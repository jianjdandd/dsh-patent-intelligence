import { insertNormalizedRecords } from './store.js'
import { cleanText, xmlText, unique } from './utils.js'
import { jurisdictionQuery } from './connectors.js'

const TOKEN_URL='https://ops.epo.org/3.2/auth/accesstoken'
const SEARCH_URL='https://ops.epo.org/3.2/rest-services/published-data/search/biblio'
const PUB_URL='https://ops.epo.org/3.2/rest-services/published-data/publication/docdb'

async function token(signal){
  const key=process.env.EPO_OPS_KEY||process.env.EPO_CONSUMER_KEY
  const secret=process.env.EPO_OPS_SECRET||process.env.EPO_CONSUMER_SECRET
  if(!key||!secret) throw new Error('EPO OPS credentials missing. Set EPO_OPS_KEY and EPO_OPS_SECRET.')
  const basic=Buffer.from(`${key}:${secret}`).toString('base64')
  const r=await fetch(TOKEN_URL,{method:'POST',signal,headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'})
  if(!r.ok) throw new Error(`EPO OPS token failed: ${r.status} ${await r.text()}`)
  return (await r.json()).access_token
}
function first(block,tag,lang=''){
  const langPart=lang?`[^>]*lang=["']${lang}["'][^>]*`:'[^>]*'
  return xmlText(block.match(new RegExp(`<${tag}${langPart}>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]||'')
}
function allTag(block,tag){return [...block.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi'))].map(m=>xmlText(m[1])).filter(Boolean)}
function allNames(block,outerTag){
  const out=[]
  for(const m of block.matchAll(new RegExp(`<${outerTag}[^>]*>([\\s\\S]*?)<\\/${outerTag}>`,'gi'))){
    const n=m[1].match(/<name[^>]*>([\s\S]*?)<\/name>/i); if(n) out.push(xmlText(n[1]))
  }
  return unique(out).join('; ')
}
function docId(block,type='docdb'){
  const b=block.match(new RegExp(`<document-id[^>]*document-id-type=["']${type}["'][^>]*>([\\s\\S]*?)<\\/document-id>`,'i'))?.[1]||''
  return {country:first(b,'country'),num:first(b,'doc-number'),kind:first(b,'kind'),date:first(b,'date')}
}
function docNumber(x){return `${x.country}${x.num}${x.kind}`.trim()}
function classes(block){
  const ipc=unique([...allTag(block,'classification-symbol'),...allTag(block,'text').filter(x=>/^[A-HY]\d{2}[A-Z]/i.test(x))])
  const cpc=unique([...allTag(block,'cpc-symbol'),...allTag(block,'classification-cpc-text')])
  return {ipc:ipc.join('; '),cpc:cpc.join('; ')}
}
function parseExchange(b){
  const pub=docId(b,'docdb')
  const appBlock=b.match(/<application-reference[\s\S]*?<\/application-reference>/i)?.[0]||''
  const app=docId(appBlock,'docdb')
  const priorities=[...b.matchAll(/<priority-claim[\s\S]*?<\/priority-claim>/gi)].map(m=>docNumber(docId(m[0],'docdb'))).filter(Boolean)
  const priorityDates=[...b.matchAll(/<priority-claim[\s\S]*?<\/priority-claim>/gi)].map(m=>docId(m[0],'docdb').date).filter(Boolean).sort()
  const cls=classes(b)
  return {publication_number:docNumber(pub),application_number:docNumber(app),priority_numbers:unique(priorities).join('; '),title:first(b,'invention-title','en')||first(b,'invention-title'),abstract:first(b,'abstract','en')||first(b,'abstract'),applicants:allNames(b,'applicant-name'),inventors:allNames(b,'inventor-name'),ipc:cls.ipc,cpc:cls.cpc,filing_date:app.date,priority_date:priorityDates[0]||'',publication_date:pub.date,source:'EPO OPS/DOCDB'}
}
function parseSearch(xml){
  const total=Number(xml.match(/total-result-count=["'](\d+)["']/i)?.[1]||0)
  const records=[...xml.matchAll(/<exchange-document\b[\s\S]*?<\/exchange-document>/gi)].map(m=>parseExchange(m[0])).filter(r=>r.publication_number)
  return {total,records}
}
async function requestXml(url,accessToken,signal,range=''){
  const headers={Authorization:`Bearer ${accessToken}`,Accept:'application/exchange+xml'}
  if(range) headers['X-OPS-Range']=range
  const r=await fetch(url,{signal,headers}); if(!r.ok) throw new Error(`EPO OPS request failed: ${r.status} ${await r.text()}`); return r.text()
}
export async function searchOps(args){
  if(!args.query) throw new Error('search_ops requires EPO OPS CQL query')
  const accessToken=await token(args.signal)
  const requested=Math.min(Math.max(Number(args.limit||100),1),2000),records=[]; let total=0
  for(let start=1;start<=requested;start+=100){
    const end=Math.min(start+99,requested),url=`${SEARCH_URL}?q=${encodeURIComponent(args.query)}`
    const parsed=parseSearch(await requestXml(url,accessToken,args.signal,`${start}-${end}`)); total=parsed.total; records.push(...parsed.records)
    if(end>=total||records.length>=requested) break
  }
  const stored=await insertNormalizedRecords(args.workspace,records,args.source||'EPO OPS/DOCDB')
  return {ok:true,query:cleanText(args.query),total_hits:total,fetched:records.length,stored_total:stored,truncated:total>records.length,note:total>2000?'OPS bibliographic search exposes at most 2,000 hits per query; partition queries for exhaustive retrieval.':''}
}
export async function searchOnline(args){
  if(!args.query) throw new Error('search_online requires a base EPO OPS CQL query')
  const jurisdictions=args.jurisdictions?.length?args.jurisdictions:['CN','US','EP','WO','JP','KR','GB','FR','DE','IN']
  const per=Math.max(1,Math.floor(Number(args.limit||500)/jurisdictions.length)); const results=[]
  for(const j of jurisdictions){
    const q=jurisdictionQuery(args.query,j)
    const r=await searchOps({...args,query:q,limit:Math.min(per,2000),source:`EPO OPS/DOCDB:${j}`})
    results.push({jurisdiction:j,...r})
  }
  return {ok:true,jurisdictions,results,fetched:results.reduce((s,r)=>s+r.fetched,0)}
}
export async function fetchBiblio(args){
  const nums=args.publication_numbers||args.publications||[]
  if(!nums.length) throw new Error('fetch_biblio requires publication_numbers[] in DOCDB form, e.g. EP1000000A1')
  const accessToken=await token(args.signal),records=[],errors=[]
  for(const raw of nums){
    const s=String(raw).replace(/\s+/g,'').toUpperCase(); const m=s.match(/^([A-Z]{2})([A-Z0-9]+?)([A-Z]\d?)?$/)
    if(!m){errors.push({publication:raw,error:'invalid publication number'});continue}
    const docdb=`${m[1]}.${m[2]}.${m[3]||'A'}`
    try{const xml=await requestXml(`${PUB_URL}/${encodeURIComponent(docdb)}/biblio`,accessToken,args.signal); const recs=parseSearch(xml).records; if(recs.length) records.push(...recs); else errors.push({publication:raw,error:'no record'})}catch(e){errors.push({publication:raw,error:String(e.message||e)})}
  }
  const stored=await insertNormalizedRecords(args.workspace,records,'EPO OPS/DOCDB:biblio')
  return {ok:true,fetched:records.length,stored_total:stored,errors,records}
}
