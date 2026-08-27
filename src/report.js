import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'

function db(workspace) { return new DatabaseSync(path.join(workspace,'patents.sqlite')) }
function esc(s='') { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

function summary(rows) {
  const families=new Set(rows.map(r=>r.family_key))
  const js=[...new Set(rows.map(r=>r.jurisdiction).filter(Boolean))]
  return {records:rows.length,families:families.size,jurisdictions:js}
}

function md(rows,s) {
  const top=[...rows].sort((a,b)=>Number(b.core_score)-Number(a.core_score)).slice(0,50)
  const lines=[`# Patent Intelligence Report`,``,`- Records: ${s.records}` ,`- Families: ${s.families}`,`- Jurisdictions: ${s.jurisdictions.join(', ')}`,``,`## Core patents / families`,``,`| Publication | Family | Score | Applicant | Category | Technical route |`,`|---|---|---:|---|---|---|`]
  for (const r of top) lines.push(`| ${r.publication_number||''} | ${r.family_key||''} | ${r.core_score||0} | ${(r.applicants||'').replace(/\|/g,'/')} | ${(r.technical_category||'').replace(/\|/g,'/')} | ${(r.technical_route||'').replace(/\|/g,'/')} |`)
  return lines.join('\n')+'\n'
}

function html(rows,s) {
  const top=[...rows].sort((a,b)=>Number(b.core_score)-Number(a.core_score)).slice(0,100)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Patent Intelligence Report</title><style>body{font-family:Arial,sans-serif;max-width:1400px;margin:32px auto;padding:0 20px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ddd;padding:6px;vertical-align:top}th{background:#f5f5f5;position:sticky;top:0}</style></head><body><h1>Patent Intelligence Report</h1><p>Records: ${s.records} · Families: ${s.families} · Jurisdictions: ${esc(s.jurisdictions.join(', '))}</p><table><thead><tr><th>Publication</th><th>Family</th><th>Score</th><th>Title</th><th>Applicant</th><th>Category</th><th>Technical route</th><th>Status</th></tr></thead><tbody>${top.map(r=>`<tr><td>${esc(r.publication_number)}</td><td>${esc(r.family_key)}</td><td>${esc(r.core_score)}</td><td>${esc(r.title)}</td><td>${esc(r.applicants)}</td><td>${esc(r.technical_category)}</td><td>${esc(r.technical_route)}</td><td>${esc(r.legal_status)}</td></tr>`).join('')}</tbody></table></body></html>`
}

export async function report(args) {
  const d=db(args.workspace)
  const rows=d.prepare('SELECT * FROM patents ORDER BY core_score DESC, publication_date ASC').all()
  d.close()
  const s=summary(rows)
  const formats=(args.formats?.length?args.formats:['json','markdown','excel','html']).map(x=>String(x).toLowerCase())
  const files={sqlite:path.join(args.workspace,'patents.sqlite')}

  if (formats.includes('json')) {
    files.json=path.join(args.workspace,'patents.json')
    await writeFile(files.json,JSON.stringify({summary:s,records:rows},null,2))
  }
  if (formats.includes('markdown')||formats.includes('md')) {
    files.markdown=path.join(args.workspace,'report.md')
    await writeFile(files.markdown,md(rows,s))
  }
  if (formats.includes('html')) {
    files.html=path.join(args.workspace,'report.html')
    await writeFile(files.html,html(rows,s))
  }
  if (formats.includes('excel')||formats.includes('xlsx')) {
    const XLSX=await import('xlsx')
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Patents')
    const famMap=new Map()
    for(const r of rows){if(!famMap.has(r.family_key))famMap.set(r.family_key,{family_key:r.family_key,core_score:r.core_score,members:0,jurisdictions:new Set(),earliest_priority:r.priority_date||'',sample_title:r.title||''});const f=famMap.get(r.family_key);f.members++;if(r.jurisdiction)f.jurisdictions.add(r.jurisdiction);if(r.priority_date&&(!f.earliest_priority||r.priority_date<f.earliest_priority))f.earliest_priority=r.priority_date}
    const fam=[...famMap.values()].map(f=>({...f,jurisdictions:[...f.jurisdictions].join(',')})).sort((a,b)=>Number(b.core_score)-Number(a.core_score))
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(fam),'Families')
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{metric:'records',value:s.records},{metric:'families',value:s.families},{metric:'jurisdictions',value:s.jurisdictions.join(',')}]),'Summary')
    files.excel=path.join(args.workspace,'patent_report.xlsx')
    XLSX.writeFile(wb,files.excel)
  }
  return {ok:true,summary:s,files}
}
