import { insertNormalizedRecords } from './store.js'
import { cleanText, xmlText, unique } from './utils.js'
import { jurisdictionQuery, normalizeJurisdiction } from './connectors.js'

const TOKEN_URL='https://ops.epo.org/3.2/auth/accesstoken'
const SEARCH_URL='https://ops.epo.org/3.2/rest-services/published-data/search/biblio'
const PUB_URL='https://ops.epo.org/3.2/rest-services/published-data/publication/docdb'
const NS='(?:[A-Za-z_][\\w.-]*:)?'
let tokenCache={value:'',expiresAt:0}

function tagMatches(block,tag){
  const re=new RegExp(`<${NS}${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${NS}${tag}>`,'gi')
  return [...String(block||'').matchAll(re)]
}
function first(block,tag,lang=''){
  for(const m of tagMatches(block,tag)){
    if(lang&&!new RegExp(`(?:xml:)?lang=["']${lang}["']`,'i').test(m[1]||''))continue
    const value=xmlText(m[2]||'');if(value)return value
  }
  return ''
}
function allTag(block,tag){return tagMatches(block,tag).map(m=>xmlText(m[2]||'')).filter(Boolean)}
function allBlocks(block,tag){return tagMatches(block,tag).map(m=>m[0])}
function allNames(block,role){
  const out=[]
  for(const b of allBlocks(block,role)){const n=first(b,'name');if(n)out.push(n)}
  if(!out.length)for(const b of allBlocks(block,`${role}-name`)){const n=first(b,'name')||xmlText(b);if(n)out.push(n)}
  return unique(out).join('; ')
}
function docId(block,type='docdb'){
  const re=new RegExp(`<${NS}document-id\\b([^>]*)>([\\s\\S]*?)<\\/${NS}document-id>`,'gi')
  for(const m of String(block||'').matchAll(re)){
    if(type&&!new RegExp(`document-id-type=["']${type}["']`,'i').test(m[1]||''))continue
    const b=m[2]||''
    return {country:first(b,'country'),num:first(b,'doc-number'),kind:first(b,'kind'),date:first(b,'date')}
  }
  return {country:'',num:'',kind:'',date:''}
}
function docNumber(x){return `${x.country||''}${x.num||''}${x.kind||''}`.trim()}
function classifications(block){
  const ipc=[]
  for(const b of [...allBlocks(block,'classification-ipcr'),...allBlocks(block,'classification-ipc')]){const v=first(b,'text')||first(b,'classification-symbol');if(v)ipc.push(v)}
  ipc.push(...allTag(block,'classification-symbol').filter(x=>/^[A-HY]\\d{2}[A-Z]/i.test(x)))
  const cpc=[]
  for(const b of allBlocks(block,'classification-cpc')){const v=first(b,'text')||first(b,'cpc-symbol');if(v)cpc.push(v)}
  cpc.push(...allTag(block,'cpc-symbol'),...allTag(block,'classification-cpc-text'))
  return {ipc:unique(ipc).join('; '),cpc:unique(cpc).join('; ')}
}
function parseExchange(b){
  const pubBlock=allBlocks(b,'publication-reference')[0]||b
  const pub=docId(pubBlock,'docdb')
  const appBlock=allBlocks(b,'application-reference')[0]||''
  const app=docId(appBlock,'docdb')
  const priorityBlocks=allBlocks(b,'priority-claim')
  const priorities=priorityBlocks.map(x=>docNumber(docId(x,'docdb'))).filter(Boolean)
  const priorityDates=priorityBlocks.map(x=>docId(x,'docdb').date).filter(Boolean).sort()
  const cls=classifications(b)
  return {
    publication_number:docNumber(pub),application_number:docNumber(app),priority_numbers:unique(priorities).join('; '),family_id:first(b,'family-id'),jurisdiction:pub.country,
    title:first(b,'invention-title','en')||first(b,'invention-title'),abstract:first(b,'abstract','en')||first(b,'abstract'),
    applicants:allNames(b,'applicant'),inventors:allNames(b,'inventor'),ipc:cls.ipc,cpc:cls.cpc,
    filing_date:app.date,priority_date:priorityDates[0]||'',publication_date:pub.date,source:'EPO OPS/DOCDB',retrieved_at:new Date().toISOString()
  }
}

export function parseOpsBiblioXml(xml){
  const total=Number(String(xml||'').match(/total-result-count=["'](\\d+)["']/i)?.[1]||0)
  const records=allBlocks(xml,'exchange-document').map(parseExchange).filter(r=>r.publication_number)
  return {total:total||records.length,records}
}

async function token(signal){
  if(tokenCache.value&&Date.now()<tokenCache.expiresAt-30000)return tokenCache.value
  const key=process.env.EPO_OPS_KEY||process.env.EPO_CONSUMER_KEY
  const secret=process.env.EPO_OPS_SECRET||process.env.EPO_CONSUMER_SECRET
  if(!key||!secret)throw new Error('EPO OPS credentials missing. Set EPO_OPS_KEY and EPO_OPS_SECRET. All country online entrances use this common DOCDB backbone unless a source-specific connector is configured.')
  const basic=Buffer.from(`${key}:${secret}`).toString('base64')
  const r=await fetch(TOKEN_URL,{method:'POST',signal,headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'})
  if(!r.ok)throw new Error(`EPO OPS token failed: ${r.status} ${await r.text()}`)
  const data=await r.json();tokenCache={value:data.access_token,expiresAt:Date.now()+Number(data.expires_in||1200)*1000};return tokenCache.value
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function requestXml(url,accessToken,signal,range=''){
  for(let attempt=0;attempt<3;attempt++){
    const headers={Authorization:`Bearer ${accessToken}`,Accept:'application/exchange+xml'}
    if(range)headers['X-OPS-Range']=range
    const r=await fetch(url,{signal,headers})
    if(r.ok)return r.text()
    const text=await r.text()
    if(![429,503,504].includes(r.status)||attempt===2)throw new Error(`EPO OPS request failed: ${r.status} ${text}`)
    const retry=Number(r.headers.get('retry-after')||0);await sleep(retry?retry*1000:500*(attempt+1))
  }
}
async function searchWithToken(args,accessToken){
  if(!args.query)throw new Error('search requires EPO OPS CQL query')
  const requested=Math.min(Math.max(Number(args.limit||100),1),2000),records=[];let total=0
  for(let start=1;start<=requested;start+=100){
    const end=Math.min(start+99,requested),url=`${SEARCH_URL}?q=${encodeURIComponent(args.query)}`
    const parsed=parseOpsBiblioXml(await requestXml(url,accessToken,args.signal,`${start}-${end}`));total=parsed.total;records.push(...parsed.records)
    if(end>=total||records.length>=requested)break
  }
  const stored=await insertNormalizedRecords(args.workspace,records,args.source||'EPO OPS/DOCDB')
  const result={ok:true,query:cleanText(args.query),total_hits:total,fetched:records.length,stored_total:stored,truncated:total>records.length,bibliographic_fields:['publication_number','application_number','priority_numbers','title','abstract','applicants','inventors','ipc','cpc','filing_date','priority_date','publication_date'],records_sample:records.slice(0,5),note:total>2000?'OPS bibliographic search exposes at most 2,000 hits per query; partition queries for exhaustive retrieval.':''}
  if(args.return_records)result.records=records
  return result
}

export async function searchOps(args){return searchWithToken(args,await token(args.signal))}

export async function searchOnline(args){
  if(!args.query)throw new Error('search_online requires a base EPO OPS CQL query')
  const jurisdictions=(args.jurisdictions?.length?args.jurisdictions:['CN','US','EP','WO','JP','KR','GB','FR','DE','IN']).map(normalizeJurisdiction)
  const totalLimit=Math.max(Number(args.limit||500),jurisdictions.length)
  const per=Math.min(Math.max(Number(args.limit_per_jurisdiction||Math.floor(totalLimit/jurisdictions.length)),1),2000)
  const accessToken=await token(args.signal),results=[]
  for(const j of jurisdictions){
    const q=jurisdictionQuery(args.query,j)
    const r=await searchWithToken({...args,query:q,limit:per,source:`EPO OPS/DOCDB:${j}`},accessToken)
    results.push({jurisdiction:j,source:'EPO OPS/DOCDB',...r})
  }
  return {ok:true,jurisdictions,limit_per_jurisdiction:per,fetched:results.reduce((s,r)=>s+r.fetched,0),results}
}

function normalizePublication(raw){return String(raw||'').toUpperCase().replace(/[\\s./-]+/g,'')}
function docdbSeed(raw){
  const s=normalizePublication(raw),m=s.match(/^([A-Z]{2})([A-Z0-9]+?)([A-Z]\\d{0,2})?$/)
  if(!m)return null
  return `${m[1]}.${m[2]}.${m[3]||'%%'}`
}

export async function fetchBiblio(args){
  const nums=args.publication_numbers||args.publications||[]
  if(!nums.length)throw new Error('fetch_biblio requires publication_numbers[]; kind code may be omitted and OPS wildcard retrieval will be attempted')
  const accessToken=await token(args.signal),records=[],errors=[]
  for(const raw of nums){
    const seed=docdbSeed(raw);if(!seed){errors.push({publication:raw,error:'invalid publication number'});continue}
    try{
      const xml=await requestXml(`${PUB_URL}/${encodeURIComponent(seed)}/biblio`,accessToken,args.signal)
      const recs=parseOpsBiblioXml(xml).records
      if(recs.length)records.push(...recs);else errors.push({publication:raw,error:'no bibliographic record'})
    }catch(e){errors.push({publication:raw,error:String(e.message||e)})}
  }
  const stored=await insertNormalizedRecords(args.workspace,records,'EPO OPS/DOCDB:biblio')
  return {ok:true,source:'EPO OPS/DOCDB',fetched:records.length,stored_total:stored,errors,records}
}
