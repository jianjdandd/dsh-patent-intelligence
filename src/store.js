import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { cleanText, hash, jurisdictionOf, normNumber, splitList, unique } from './utils.js'

const aliases = {
  publication_number: ['publication_number','publication number','公开号','公开(公告)号','公开公告号','专利号','publication no','publication'],
  application_number: ['application_number','application number','申请号','application no'],
  priority_numbers: ['priority_numbers','priority number','优先权号','优先权号码','priority'],
  family_id: ['family_id','family id','专利族','同族','dwpi family','inpadoc family'],
  title: ['title','标题','专利名称','发明名称','名称'],
  abstract: ['abstract','摘要'],
  claims: ['claims','权利要求','权利要求书'],
  applicants: ['applicants','applicant','assignee','申请人','专利权人','当前专利权人'],
  inventors: ['inventors','inventor','发明人'],
  ipc: ['ipc','ipc main','国际专利分类'],
  cpc: ['cpc','cpc main','合作专利分类'],
  filing_date: ['filing_date','filing date','申请日'],
  priority_date: ['priority_date','priority date','最早优先权日','优先权日'],
  publication_date: ['publication_date','publication date','公开日','公告日'],
  grant_date: ['grant_date','grant date','授权日'],
  legal_status: ['legal_status','legal status','法律状态','当前法律状态'],
  citations: ['citations','citation count','被引证次数','被引用次数','forward citations'],
  source: ['source','来源','数据库']
}

function db(workspace) {
  const d = new DatabaseSync(path.join(workspace, 'patents.sqlite'))
  d.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS patents (
      id TEXT PRIMARY KEY,
      publication_number TEXT,
      application_number TEXT,
      priority_numbers TEXT,
      family_id TEXT,
      family_key TEXT,
      jurisdiction TEXT,
      title TEXT,
      abstract TEXT,
      claims TEXT,
      applicants TEXT,
      inventors TEXT,
      ipc TEXT,
      cpc TEXT,
      filing_date TEXT,
      priority_date TEXT,
      publication_date TEXT,
      grant_date TEXT,
      legal_status TEXT,
      citations INTEGER DEFAULT 0,
      source TEXT,
      technical_category TEXT,
      technical_route TEXT,
      core_reason TEXT,
      core_score REAL DEFAULT 0,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_patents_family ON patents(family_key);
    CREATE INDEX IF NOT EXISTS idx_patents_jurisdiction ON patents(jurisdiction);
  `)
  return d
}

function keyMap(row) {
  const out = {}
  const lowered = new Map(Object.keys(row).map(k => [cleanText(k).toLowerCase(), k]))
  for (const [target, names] of Object.entries(aliases)) {
    for (const n of names) {
      const k = lowered.get(n.toLowerCase())
      if (k) { out[target] = row[k]; break }
    }
  }
  return out
}

function familyKey(r) {
  if (r.family_id) return `F:${normNumber(r.family_id)}`
  const priorities = splitList(r.priority_numbers).map(normNumber).filter(Boolean).sort()
  if (priorities.length) return `P:${priorities[0]}`
  if (r.application_number) return `A:${normNumber(r.application_number)}`
  return `D:${normNumber(r.publication_number)}`
}

function normalizeRow(row, sourceOverride = '') {
  const r = keyMap(row)
  const publication = cleanText(r.publication_number)
  const application = cleanText(r.application_number)
  const id = normNumber(publication) || normNumber(application) || hash(JSON.stringify(row))
  const normalized = {
    id,
    publication_number: publication,
    application_number: application,
    priority_numbers: unique(splitList(r.priority_numbers).map(cleanText)).join('; '),
    family_id: cleanText(r.family_id),
    jurisdiction: jurisdictionOf(publication || application),
    title: cleanText(r.title),
    abstract: cleanText(r.abstract),
    claims: cleanText(r.claims),
    applicants: unique(splitList(r.applicants)).join('; '),
    inventors: unique(splitList(r.inventors)).join('; '),
    ipc: unique(splitList(r.ipc)).join('; '),
    cpc: unique(splitList(r.cpc)).join('; '),
    filing_date: cleanText(r.filing_date),
    priority_date: cleanText(r.priority_date),
    publication_date: cleanText(r.publication_date),
    grant_date: cleanText(r.grant_date),
    legal_status: cleanText(r.legal_status),
    citations: Number.parseInt(String(r.citations ?? '0').replace(/\D/g,''), 10) || 0,
    source: sourceOverride || cleanText(r.source),
    raw_json: JSON.stringify(row)
  }
  normalized.family_key = familyKey(normalized)
  return normalized
}

function upsert(d, r) {
  d.prepare(`
    INSERT INTO patents (
      id,publication_number,application_number,priority_numbers,family_id,family_key,jurisdiction,title,abstract,claims,
      applicants,inventors,ipc,cpc,filing_date,priority_date,publication_date,grant_date,legal_status,citations,source,raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      publication_number=excluded.publication_number,
      application_number=excluded.application_number,
      priority_numbers=excluded.priority_numbers,
      family_id=CASE WHEN excluded.family_id<>'' THEN excluded.family_id ELSE patents.family_id END,
      family_key=excluded.family_key,
      jurisdiction=excluded.jurisdiction,
      title=CASE WHEN length(excluded.title)>length(patents.title) THEN excluded.title ELSE patents.title END,
      abstract=CASE WHEN length(excluded.abstract)>length(patents.abstract) THEN excluded.abstract ELSE patents.abstract END,
      claims=CASE WHEN length(excluded.claims)>length(patents.claims) THEN excluded.claims ELSE patents.claims END,
      applicants=CASE WHEN excluded.applicants<>'' THEN excluded.applicants ELSE patents.applicants END,
      inventors=CASE WHEN excluded.inventors<>'' THEN excluded.inventors ELSE patents.inventors END,
      ipc=CASE WHEN excluded.ipc<>'' THEN excluded.ipc ELSE patents.ipc END,
      cpc=CASE WHEN excluded.cpc<>'' THEN excluded.cpc ELSE patents.cpc END,
      legal_status=CASE WHEN excluded.legal_status<>'' THEN excluded.legal_status ELSE patents.legal_status END,
      citations=max(patents.citations, excluded.citations),
      source=CASE WHEN excluded.source<>'' THEN excluded.source ELSE patents.source END,
      raw_json=excluded.raw_json
  `).run(
    r.id,r.publication_number,r.application_number,r.priority_numbers,r.family_id,r.family_key,r.jurisdiction,r.title,r.abstract,r.claims,
    r.applicants,r.inventors,r.ipc,r.cpc,r.filing_date,r.priority_date,r.publication_date,r.grant_date,r.legal_status,r.citations,r.source,r.raw_json
  )
}

async function rowsFromFile(file) {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.json') {
    const obj = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(obj) ? obj : (obj.records || obj.patents || [obj])
  }
  if (ext === '.jsonl' || ext === '.ndjson') {
    return (await readFile(file,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse)
  }
  if (['.xlsx','.xls','.csv','.tsv'].includes(ext)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.readFile(file)
    return wb.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }))
  }
  throw new Error(`Unsupported import format: ${ext}`)
}

export async function importRecords(args) {
  if (!args.file) throw new Error('import requires file')
  const d = db(args.workspace)
  const rows = await rowsFromFile(path.resolve(args.file))
  d.exec('BEGIN')
  let imported = 0
  try {
    for (const row of rows) { upsert(d, normalizeRow(row, args.source || '')); imported++ }
    d.exec('COMMIT')
  } catch (e) { d.exec('ROLLBACK'); throw e }
  const totals = d.prepare('SELECT count(*) AS n, count(DISTINCT family_key) AS families FROM patents').get()
  d.close()
  return { ok:true, imported, total_records:totals.n, total_families:totals.families, sqlite:path.join(args.workspace,'patents.sqlite') }
}

export async function insertNormalizedRecords(workspace, rows, source='EPO OPS') {
  const d = db(workspace)
  d.exec('BEGIN')
  try {
    for (const row of rows) upsert(d, normalizeRow(row, source))
    d.exec('COMMIT')
  } catch (e) { d.exec('ROLLBACK'); throw e }
  const n = d.prepare('SELECT count(*) AS n FROM patents').get().n
  d.close()
  return n
}

export async function workset(args) {
  const d = db(args.workspace)
  const limit = Math.min(Math.max(Number(args.limit || 25),1),100)
  const offset = Math.max(Number(args.offset || 0),0)
  const rows = d.prepare(`SELECT publication_number,title,abstract,claims,applicants,ipc,cpc,legal_status,citations,technical_category,technical_route FROM patents ORDER BY core_score DESC, citations DESC, publication_date ASC LIMIT ? OFFSET ?`).all(limit, offset)
  d.close()
  return {
    ok:true, offset, limit, count:rows.length,
    instruction:'Classify each record and extract a concise technical route from evidence. Then call action=annotate with publication_number, technical_category, technical_route, core_reason.',
    records:rows
  }
}

export async function annotate(args) {
  const list = args.annotations || []
  const d = db(args.workspace)
  const stmt = d.prepare(`UPDATE patents SET technical_category=?, technical_route=?, core_reason=? WHERE publication_number=? OR id=?`)
  let updated=0
  d.exec('BEGIN')
  try {
    for (const a of list) {
      const pub=cleanText(a.publication_number || a.id)
      const r=stmt.run(cleanText(a.technical_category), cleanText(a.technical_route), cleanText(a.core_reason), pub, normNumber(pub))
      updated += Number(r.changes || 0)
    }
    d.exec('COMMIT')
  } catch(e) { d.exec('ROLLBACK'); throw e }
  d.close()
  return { ok:true, updated }
}

export async function status(args) {
  const d = db(args.workspace)
  const totals = d.prepare(`SELECT count(*) n, count(DISTINCT family_key) families, count(DISTINCT jurisdiction) jurisdictions, sum(CASE WHEN technical_category<>'' THEN 1 ELSE 0 END) annotated FROM patents`).get()
  const byJ = d.prepare(`SELECT jurisdiction, count(*) n FROM patents GROUP BY jurisdiction ORDER BY n DESC`).all()
  d.close()
  return { ok:true, workspace:args.workspace, ...totals, by_jurisdiction:byJ }
}
