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
    patent_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_record_id TEXT NOT NULL DEFAULT '',
    retrieved_at TEXT,
    verified INTEGER DEFAULT 0,
    raw_json TEXT,
    PRIMARY KEY(patent_id,source,source_record_id)
  );CREATE INDEX IF NOT EXISTS idx_patent_sources_patent ON patent_sources(patent_id);`)
  return d
}

function cmp(v){return cleanText(v).toLowerCase().replace(/[\s,;|./_-]+/g,'')}
function mergeSet(a,b){return unique([...splitList(a),...splitList(b)]).join('; ')}
function patentId(r){return normNumber(r?.publication_number)||normNumber(r?.application_number)}
function sourceId(r){return cleanText(r?.official_record_id||r?.publication_number||r?.application_number)}

function saveSource(d,record,source,verified=0){
  const id=patentId(record);if(!id)return
  d.prepare(`INSERT INTO patent_sources(patent_id,source,source_record_id,retrieved_at,verified,raw_json) VALUES(?,?,?,?,?,?)
    ON CONFLICT(patent_id,source,source_record_id) DO UPDATE SET retrieved_at=excluded.retrieved_at,verified=excluded.verified,raw_json=excluded.raw_json`)
    .run(id,source,sourceId(record),cleanText(record.retrieved_at)||new Date().toISOString(),verified?1:0,JSON.stringify(record))
}

export function loadPatentRecords(workspace,{publication_numbers=[],jurisdiction='',limit=500}={}){
  const d=db(workspace);let rows
  if(publication_numbers.length){
    const stmt=d.prepare('SELECT * FROM patents WHERE id=? OR publication_number=? OR application_number=? LIMIT 1')
    rows=publication_numbers.map(v=>stmt.get(normNumber(v),cleanText(v),cleanText(v))).filter(Boolean)
  }else if(jurisdiction){rows=d.prepare('SELECT * FROM patents WHERE jurisdiction=? ORDER BY publication_date DESC LIMIT ?').all(String(jurisdiction).toUpperCase(),Math.min(Number(limit)||500,5000))}
  else rows=d.prepare('SELECT * FROM patents ORDER BY publication_date DESC LIMIT ?').all(Math.min(Number(limit)||500,5000))
  d.close();return rows
}

export function mergeOfficialRecord(workspace,base,official,source){
  const d=db(workspace),id=patentId(base)||patentId(official)
  const current=d.prepare('SELECT * FROM patents WHERE id=? OR publication_number=? OR application_number=? LIMIT 1').get(id,cleanText(base?.publication_number),cleanText(base?.application_number))
  if(!current){d.close();return {ok:false,status:'base_record_missing'}}
  saveSource(d,current,current.source||'DOCDB',0);saveSource(d,official,source,1)
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
  const checkedAt=new Date().toISOString(),verification={source,status,counts,fields,checked_at:checkedAt}
  d.prepare(`UPDATE patents SET application_number=?,priority_numbers=?,family_id=?,title=?,abstract=?,applicants=?,inventors=?,ipc=?,cpc=?,filing_date=?,priority_date=?,publication_date=?,grant_date=?,legal_status=?,official_verified=1,official_source=?,official_checked_at=?,verification_status=?,verification_json=? WHERE id=?`)
    .run(next.application_number,next.priority_numbers,next.family_id,next.title,next.abstract,next.applicants,next.inventors,next.ipc,next.cpc,next.filing_date,next.priority_date,next.publication_date,next.grant_date,next.legal_status,source,checkedAt,status,JSON.stringify(verification),current.id)
  d.close();return {ok:true,publication_number:current.publication_number,source,status,counts,fields}
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
