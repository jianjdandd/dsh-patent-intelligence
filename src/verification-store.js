import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { cleanText,normNumber,splitList,unique } from './utils.js'

const VERIFIED_FIELDS=['application_number','priority_numbers','family_id','title','abstract','applicants','inventors','ipc','cpc','filing_date','priority_date','publication_date','grant_date','legal_status']
const SET_FIELDS=new Set(['priority_numbers','applicants','inventors','ipc','cpc'])

function db(workspace){
  const d=new DatabaseSync(path.join(workspace,'patents.sqlite'))
  const cols=new Set(d.prepare('PRAGMA table_info(patents)').all().map(r=>r.name))
  const add=[['official_verified','INTEGER DEFAULT 0'],['official_source',"TEXT DEFAULT ''"],['official_checked_at',"TEXT DEFAULT ''"],['verification_status',"TEXT DEFAULT ''"],['verification_json',"TEXT DEFAULT ''"]]
  for(const [name,type] of add)if(!cols.has(name))d.exec(`ALTER TABLE patents ADD COLUMN ${name} ${type}`)
  d.exec(`CREATE TABLE IF NOT EXISTS patent_sources(
    patent_id TEXT NOT NULL,source TEXT NOT NULL,source_record_id TEXT NOT NULL DEFAULT '',retrieved_at TEXT,verified INTEGER DEFAULT 0,raw_json TEXT,
    PRIMARY KEY(patent_id,source,source_record_id));
    CREATE INDEX IF NOT EXISTS idx_patent_sources_patent ON patent_sources(patent_id);
    CREATE TABLE IF NOT EXISTS patent_details(
      patent_id TEXT PRIMARY KEY,
      right_holders TEXT DEFAULT '',agents TEXT DEFAULT '',examiners TEXT DEFAULT '',art_unit TEXT DEFAULT '',entity_status TEXT DEFAULT '',status_date TEXT DEFAULT '',application_type TEXT DEFAULT '',
      pta_days INTEGER DEFAULT 0,family_members TEXT DEFAULT '',assignment_count INTEGER DEFAULT 0,transaction_count INTEGER DEFAULT 0,legal_event_count INTEGER DEFAULT 0,
      structured_json TEXT DEFAULT '{}',source_map_json TEXT DEFAULT '{}',updated_at TEXT DEFAULT '');`)
  return d
}

function cmp(v){return cleanText(v).toLowerCase().replace(/[\s,;|./_-]+/g,'')}
function mergeSet(a,b){return unique([...splitList(a),...splitList(b)]).join('; ')}
function patentId(r){return normNumber(r?.publication_number)||normNumber(r?.application_number)}
function sourceId(r){return cleanText(r?.official_record_id||r?.publication_number||r?.application_number)}
function json(v,fallback={}){try{return typeof v==='string'?JSON.parse(v||'{}'):(v??fallback)}catch{return fallback}}
function array(v){return Array.isArray(v)?v:(v==null||v===''?[]:[v])}
function text(v){return unique(array(v).flatMap(x=>typeof x==='string'?splitList(x):[])).join('; ')}
function mergeAny(a,b){
  if(b==null||b==='')return a
  if(a==null||a==='')return b
  if(Array.isArray(a)||Array.isArray(b)){const seen=new Set(),out=[];for(const x of [...array(a),...array(b)]){const k=JSON.stringify(x);if(!seen.has(k)){seen.add(k);out.push(x)}}return out}
  if(typeof a==='object'&&typeof b==='object'){const out={...a};for(const [k,v] of Object.entries(b))out[k]=mergeAny(out[k],v);return out}
  return b
}
function detailSummary(s={}){
  const p=s.parties||{},f=s.family||{},legal=s.legal||{},pro=s.prosecution||{}
  const assignments=array(s.assignments),transactions=array(s.transactions),events=array(legal.events)
  const last=assignments.at(-1)||{}
  const holders=p.right_holders?.length?p.right_holders:(last.assignees||[])
  const members=f.members||[...(f.application_numbers||[]),...(f.publication_numbers||[])]
  return {
    right_holders:text(holders),agents:text(p.agents),examiners:text(p.examiners),art_unit:cleanText(pro.art_unit),entity_status:cleanText(pro.entity_status),status_date:cleanText(pro.status_date),application_type:cleanText(pro.application_type),
    pta_days:Number(pro.pta_days??pro.patent_term_adjustment?.adjustmentTotalQuantity??pro.patent_term_adjustment?.adjustment_total_quantity??0)||0,
    family_members:text(members),assignment_count:assignments.length,transaction_count:transactions.length,legal_event_count:events.length
  }
}
function saveSource(d,record,source,verified=0){
  const id=patentId(record);if(!id)return
  d.prepare(`INSERT INTO patent_sources(patent_id,source,source_record_id,retrieved_at,verified,raw_json) VALUES(?,?,?,?,?,?)
    ON CONFLICT(patent_id,source,source_record_id) DO UPDATE SET retrieved_at=excluded.retrieved_at,verified=excluded.verified,raw_json=excluded.raw_json`)
    .run(id,source,sourceId(record),cleanText(record.retrieved_at)||new Date().toISOString(),verified?1:0,JSON.stringify(record))
}
function saveDetails(d,id,structured,source){
  if(!structured||!Object.keys(structured).length)return
  const row=d.prepare('SELECT structured_json,source_map_json FROM patent_details WHERE patent_id=?').get(id)||{}
  const merged=mergeAny(json(row.structured_json,{}),structured),sources={...json(row.source_map_json,{})}
  for(const k of Object.keys(structured))sources[k]=source
  const x=detailSummary(merged),now=new Date().toISOString()
  d.prepare(`INSERT INTO patent_details(patent_id,right_holders,agents,examiners,art_unit,entity_status,status_date,application_type,pta_days,family_members,assignment_count,transaction_count,legal_event_count,structured_json,source_map_json,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(patent_id) DO UPDATE SET right_holders=excluded.right_holders,agents=excluded.agents,examiners=excluded.examiners,art_unit=excluded.art_unit,entity_status=excluded.entity_status,status_date=excluded.status_date,application_type=excluded.application_type,pta_days=excluded.pta_days,family_members=excluded.family_members,assignment_count=excluded.assignment_count,transaction_count=excluded.transaction_count,legal_event_count=excluded.legal_event_count,structured_json=excluded.structured_json,source_map_json=excluded.source_map_json,updated_at=excluded.updated_at`)
    .run(id,x.right_holders,x.agents,x.examiners,x.art_unit,x.entity_status,x.status_date,x.application_type,x.pta_days,x.family_members,x.assignment_count,x.transaction_count,x.legal_event_count,JSON.stringify(merged),JSON.stringify(sources),now)
}

export function loadPatentRecords(workspace,{publication_numbers=[],jurisdiction='',limit=500}={}){
  const d=db(workspace);let rows
  if(publication_numbers.length){const stmt=d.prepare('SELECT * FROM patents WHERE id=? OR publication_number=? OR application_number=? LIMIT 1');rows=publication_numbers.map(v=>stmt.get(normNumber(v),cleanText(v),cleanText(v))).filter(Boolean)}
  else if(jurisdiction)rows=d.prepare('SELECT * FROM patents WHERE jurisdiction=? ORDER BY publication_date DESC LIMIT ?').all(String(jurisdiction).toUpperCase(),Math.min(Number(limit)||500,5000))
  else rows=d.prepare('SELECT * FROM patents ORDER BY publication_date DESC LIMIT ?').all(Math.min(Number(limit)||500,5000))
  d.close();return rows
}
export function loadDetailedRecords(workspace,{publication_numbers=[],jurisdiction='',limit=500}={}){
  const d=db(workspace),where=[],params=[]
  if(publication_numbers.length){where.push(`(p.id IN (${publication_numbers.map(()=>'?').join(',')}) OR p.publication_number IN (${publication_numbers.map(()=>'?').join(',')}) OR p.application_number IN (${publication_numbers.map(()=>'?').join(',')}))`);const ids=publication_numbers.map(normNumber),raw=publication_numbers.map(cleanText);params.push(...ids,...raw,...raw)}
  if(jurisdiction){where.push('p.jurisdiction=?');params.push(String(jurisdiction).toUpperCase())}
  params.push(Math.min(Number(limit)||500,5000))
  const rows=d.prepare(`SELECT p.*,d.right_holders,d.agents,d.examiners,d.art_unit,d.entity_status,d.status_date,d.application_type,d.pta_days,d.family_members,d.assignment_count,d.transaction_count,d.legal_event_count,d.structured_json,d.source_map_json,d.updated_at details_updated_at FROM patents p LEFT JOIN patent_details d ON d.patent_id=p.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY p.publication_date DESC LIMIT ?`).all(...params)
  d.close();return rows.map(r=>({...r,structured:json(r.structured_json,{}),source_map:json(r.source_map_json,{})}))
}

export function mergeOfficialRecord(workspace,base,official,source){
  const d=db(workspace),id=patentId(base)||patentId(official)
  const current=d.prepare('SELECT * FROM patents WHERE id=? OR publication_number=? OR application_number=? LIMIT 1').get(id,cleanText(base?.publication_number),cleanText(base?.application_number))
  if(!current){d.close();return {ok:false,status:'base_record_missing'}}
  saveSource(d,current,current.source||'DOCDB',0);saveSource(d,official,source,1);saveDetails(d,current.id,official.structured||{},source)
  const next={...current},fields={},counts={matched:0,supplemented:0,conflict:0,official_missing:0}
  for(const f of VERIFIED_FIELDS){
    const a=cleanText(current[f]),b=cleanText(official[f])
    if(!b){fields[f]='official_missing';counts.official_missing++;continue}
    if(!a){next[f]=b;fields[f]='supplemented';counts.supplemented++;continue}
    if(cmp(a)===cmp(b)){fields[f]='matched';counts.matched++;continue}
    if(SET_FIELDS.has(f)){next[f]=mergeSet(a,b);fields[f]='conflict_merged'}
    else if(['application_number','filing_date','priority_date','grant_date','legal_status','family_id'].includes(f)){next[f]=b;fields[f]='conflict_official_preferred'}
    else if(['title','abstract'].includes(f)){next[f]=b.length>=a.length?b:a;fields[f]='conflict_kept_richer'}
    else fields[f]='conflict'
    counts.conflict++
  }
  const status=counts.conflict?'conflict_reviewed':counts.supplemented?'verified_and_supplemented':'verified'
  const checkedAt=new Date().toISOString(),verification={source,status,counts,fields,structured_sections:Object.keys(official.structured||{}),checked_at:checkedAt}
  d.prepare(`UPDATE patents SET application_number=?,priority_numbers=?,family_id=?,title=?,abstract=?,applicants=?,inventors=?,ipc=?,cpc=?,filing_date=?,priority_date=?,publication_date=?,grant_date=?,legal_status=?,official_verified=1,official_source=?,official_checked_at=?,verification_status=?,verification_json=? WHERE id=?`)
    .run(next.application_number,next.priority_numbers,next.family_id,next.title,next.abstract,next.applicants,next.inventors,next.ipc,next.cpc,next.filing_date,next.priority_date,next.publication_date,next.grant_date,next.legal_status,source,checkedAt,status,JSON.stringify(verification),current.id)
  d.close();return {ok:true,publication_number:current.publication_number,source,status,counts,fields,structured_sections:Object.keys(official.structured||{})}
}

export function markVerificationStatus(workspace,base,{source='',status='not_available',detail=''}={}){
  const d=db(workspace),id=patentId(base),checkedAt=new Date().toISOString(),verification={source,status,detail,checked_at:checkedAt}
  const r=d.prepare('UPDATE patents SET official_verified=0,official_source=?,official_checked_at=?,verification_status=?,verification_json=? WHERE id=?').run(source,checkedAt,status,JSON.stringify(verification),id)
  if(base)saveSource(d,base,base.source||'DOCDB',0)
  d.close();return Number(r.changes||0)
}
export function verificationSummary(workspace){
  const d=db(workspace)
  const totals=d.prepare(`SELECT count(*) records,sum(CASE WHEN official_verified=1 THEN 1 ELSE 0 END) verified,sum(CASE WHEN verification_status='verified_and_supplemented' THEN 1 ELSE 0 END) supplemented,sum(CASE WHEN verification_status='conflict_reviewed' THEN 1 ELSE 0 END) conflicts FROM patents`).get()
  const byStatus=d.prepare(`SELECT verification_status status,count(*) n FROM patents GROUP BY verification_status ORDER BY n DESC`).all()
  d.close();return {...totals,by_status:byStatus}
}
