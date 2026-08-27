import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { cleanText, splitList, unique } from './utils.js'

function dbase(workspace) { return new DatabaseSync(path.join(workspace,'patents.sqlite')) }

const keywordRules = [
  ['biocatalysis / enzyme', /enzyme|enzymatic|biocatal|whole[- ]cell|酶催化|全细胞/i],
  ['microbial / biosynthesis', /ferment|biosynth|microbial|metabolic engineer|cell factory|发酵|生物合成|代谢工程/i],
  ['chemical synthesis', /chemical synthesis|organic synthesis|hydrogenation|oxidation|reduction|化学合成|氢化|氧化|还原/i],
  ['formulation / application', /formulation|composition|use of|application|配方|组合物|用途/i],
  ['process / equipment', /reactor|purification|separation|process control|反应器|纯化|分离|工艺控制/i]
]

function autoCategory(r) {
  if (cleanText(r.technical_category)) return r.technical_category
  const text=`${r.title} ${r.abstract} ${r.claims}`
  return keywordRules.find(([,re])=>re.test(text))?.[0] || 'unclassified'
}

function scoreFamily(members) {
  const js=unique(members.map(r=>r.jurisdiction))
  const citations=Math.max(0,...members.map(r=>Number(r.citations||0)))
  const status=members.map(r=>String(r.legal_status||'')).join(' ')
  const route=members.some(r=>cleanText(r.technical_route))
  let score=0
  score += 35*Math.min(js.length/8,1)
  score += 20*Math.min(Math.log1p(citations)/Math.log(51),1)
  if (/grant|active|有效|授权|granted/i.test(status)) score += 15
  if (js.includes('WO')) score += 10
  if (['CN','US','EP'].every(j=>js.includes(j))) score += 10
  if (route) score += 10
  return Math.round(score*10)/10
}

export async function analyze(args) {
  const d=dbase(args.workspace)
  const rows=d.prepare('SELECT * FROM patents').all()
  if (!rows.length) { d.close(); return {ok:true, records:0, families:0} }

  const byFamily=new Map()
  for (const r of rows) {
    const k=r.family_key || r.id
    if (!byFamily.has(k)) byFamily.set(k,[])
    byFamily.get(k).push(r)
  }
  const upd=d.prepare('UPDATE patents SET technical_category=?, core_score=?, core_reason=? WHERE id=?')
  d.exec('BEGIN')
  try {
    for (const members of byFamily.values()) {
      const score=scoreFamily(members)
      const js=unique(members.map(r=>r.jurisdiction)).join(',')
      const maxCit=Math.max(0,...members.map(r=>Number(r.citations||0)))
      for (const r of members) {
        const cat=autoCategory(r)
        const reason=cleanText(r.core_reason) || `family jurisdictions=${js}; forward citations=${maxCit}; family size=${members.length}`
        upd.run(cat,score,reason,r.id)
      }
    }
    d.exec('COMMIT')
  } catch(e) { d.exec('ROLLBACK'); throw e }

  const top=d.prepare(`SELECT family_key, max(core_score) core_score, count(*) family_size, group_concat(DISTINCT jurisdiction) jurisdictions, min(priority_date) earliest_priority, max(citations) max_citations, max(title) sample_title FROM patents GROUP BY family_key ORDER BY core_score DESC, max_citations DESC LIMIT 30`).all()
  d.close()
  return {ok:true, records:rows.length, families:byFamily.size, top_families:top}
}
