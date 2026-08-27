import { cleanText,unique,xmlText } from './utils.js'
import { normalizeJurisdiction } from './connectors.js'
import { loadPatentRecords,markVerificationStatus,mergeOfficialRecord,verificationSummary } from './verification-store.js'

export const OFFICIAL_SOURCES=Object.freeze({
  CN:{name:'CNIPA',mode:'official_portal',automated:false,credential:null,note:'CNIPA provides official patent search/data-resource services, but no stable public per-record REST API is documented for unattended use.'},
  US:{name:'USPTO Open Data Portal',mode:'rest',automated:true,credential:'USPTO_ODP_API_KEY',base:'https://api.uspto.gov/api/v1'},
  EP:{name:'European Patent Office / OPS',mode:'primary_official',automated:true,credential:'EPO_OPS_KEY + EPO_OPS_SECRET',note:'DOCDB/OPS is already the issuing-office source for EP records.'},
  WO:{name:'WIPO PATENTSCOPE Webservice',mode:'conditional_subscription',automated:false,credential:'WIPO subscription',note:'Programmatic PCT Webservice access is conditional/fee-based.'},
  JP:{name:'JPO / J-PlatPat',mode:'official_portal',automated:false,credential:null,note:'J-PlatPat is the official portal; a general public per-record REST API is not documented.'},
  KR:{name:'KIPRIS Plus',mode:'rest',automated:true,credential:'KIPRIS_SERVICE_KEY',base:'https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice'},
  GB:{name:'UKIPO',mode:'official_portal',automated:false,credential:null,note:'Official portal available; no stable public general patent REST API is documented.'},
  FR:{name:'INPI API PI Brevets',mode:'rest',automated:true,credential:'INPI_XSRF_TOKEN + INPI_ACCESS_TOKEN + INPI_SESSION_TOKEN',base:'https://api-gateway.inpi.fr/services/apidiffusion/api/brevets'},
  DE:{name:'DPMA / DPMAregister',mode:'official_portal',automated:false,credential:null,note:'Official register available; no stable public general patent REST API is documented.'},
  IN:{name:'Indian Patent Office',mode:'official_portal',automated:false,credential:null,note:'Official search portal available; no stable public general patent REST API is documented.'}
})

export function listOfficialSources(){
  return Object.entries(OFFICIAL_SOURCES).map(([jurisdiction,v])=>({jurisdiction,...v,configured:isConfigured(jurisdiction)}))
}
function isConfigured(j){
  if(j==='EP')return Boolean(process.env.EPO_OPS_KEY||process.env.EPO_CONSUMER_KEY)
  if(j==='US')return Boolean(process.env.USPTO_ODP_API_KEY||process.env.USPTO_API_KEY)
  if(j==='KR')return Boolean(process.env.KIPRIS_SERVICE_KEY||process.env.KIPRIS_API_KEY)
  if(j==='FR')return Boolean(process.env.INPI_XSRF_TOKEN&&process.env.INPI_ACCESS_TOKEN&&process.env.INPI_SESSION_TOKEN)
  return false
}

function walkValues(obj,keyRe,out=[]){
  if(obj==null)return out
  if(Array.isArray(obj)){for(const x of obj)walkValues(x,keyRe,out);return out}
  if(typeof obj!=='object')return out
  for(const [k,v] of Object.entries(obj)){
    if(keyRe.test(k)&&['string','number'].includes(typeof v))out.push(cleanText(v))
    if(v&&typeof v==='object')walkValues(v,keyRe,out)
  }
  return out
}
function firstJson(obj,re){return walkValues(obj,re,[]).find(Boolean)||''}
function allJson(obj,re){return unique(walkValues(obj,re,[])).join('; ')}
function ensurePrefix(v,prefix){const s=cleanText(v).toUpperCase().replace(/[\s./-]+/g,'');return s&&!s.startsWith(prefix)?`${prefix}${s}`:s}

export function parseUsptoJson(data){
  const root=data?.patentFileWrapperDataBag?.[0]||data||{}
  const meta=root.applicationMetaData||root.applicationMetadata||root
  const publication=ensurePrefix(firstJson(meta,/^(earliestPublicationNumber|publicationNumber(Text)?|preGrantPublicationNumber)$/i),'US')
  const application=ensurePrefix(firstJson(root,/^applicationNumberText$/i)||firstJson(meta,/^applicationNumber(Text)?$/i),'US')
  const patent=firstJson(meta,/^patentNumber$/i)
  const priority=allJson(root,/(foreign.*application.*number|priority.*application.*number|priorityNumber)/i)
  return {
    publication_number:publication,application_number:application,priority_numbers:priority,
    title:firstJson(meta,/^(inventionTitle|title)$/i),abstract:firstJson(root,/^(abstract|abstractText)$/i),
    applicants:allJson(root,/(firstApplicantName|applicantName(Text)?|applicantFullName)/i),inventors:allJson(root,/(inventorName(Text)?|inventorFullName)/i),
    ipc:allJson(root,/(ipcClassification|internationalPatentClassification|ipcCode)/i),cpc:allJson(root,/(cpcClassification|cpcCode)/i),
    filing_date:firstJson(meta,/^filingDate$/i),publication_date:firstJson(meta,/^(earliestPublicationDate|publicationDate)$/i),grant_date:firstJson(meta,/^grantDate$/i),
    legal_status:firstJson(meta,/^applicationStatusDescriptionText$/i),official_record_id:application||patent||publication,source:'USPTO Open Data Portal',retrieved_at:new Date().toISOString()
  }
}

function xmlValues(xml,names){
  const out=[]
  for(const name of names){const re=new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${name}>`,'gi');for(const m of String(xml||'').matchAll(re)){const v=xmlText(m[1]);if(v)out.push(v)}}
  return unique(out)
}
function firstXml(xml,names){return xmlValues(xml,names)[0]||''}
function allXml(xml,names){return xmlValues(xml,names).join('; ')}

export function parseKiprisXml(xml,base={}){
  return {
    publication_number:ensurePrefix(firstXml(xml,['publicationNumber','openNumber','publicationNo','openNo'])||base.publication_number,'KR'),
    application_number:ensurePrefix(firstXml(xml,['applicationNumber','applicationNo'])||base.application_number,'KR'),
    priority_numbers:allXml(xml,['priorityNumber','priorityNo'])||base.priority_numbers||'',family_id:firstXml(xml,['familyId','familyID']),
    title:firstXml(xml,['inventionTitle','titleOfInvention','title']),abstract:firstXml(xml,['astrtCont','abstract','abstractText']),
    applicants:allXml(xml,['applicantName','applicantEngName','applicant']),inventors:allXml(xml,['inventorName','inventorEngName','inventor']),
    ipc:allXml(xml,['ipcNumber','ipcCode','ipc']),cpc:allXml(xml,['cpcNumber','cpcCode','cpc']),
    filing_date:firstXml(xml,['applicationDate','filingDate']),priority_date:firstXml(xml,['priorityDate']),publication_date:firstXml(xml,['publicationDate','openDate']),grant_date:firstXml(xml,['registrationDate','grantDate']),
    legal_status:firstXml(xml,['legalStatus','legalStatusName','registrationStatus']),official_record_id:firstXml(xml,['applicationNumber','applicationNo'])||base.application_number||base.publication_number,source:'KIPRIS Plus',retrieved_at:new Date().toISOString()
  }
}

export function parseInpiXml(xml,base={}){
  return {
    publication_number:ensurePrefix(firstXml(xml,['publication-number','publicationNumber','doc-number'])||base.publication_number,'FR'),
    application_number:ensurePrefix(firstXml(xml,['application-number','applicationNumber'])||base.application_number,'FR'),
    priority_numbers:allXml(xml,['priority-number','priorityNumber'])||base.priority_numbers||'',family_id:firstXml(xml,['family-id','familyId']),
    title:firstXml(xml,['invention-title','title']),abstract:firstXml(xml,['abstract','abstractText']),
    applicants:allXml(xml,['applicant-name','applicantName','applicant']),inventors:allXml(xml,['inventor-name','inventorName','inventor']),
    ipc:allXml(xml,['classification-ipc','classification-symbol','ipc']),cpc:allXml(xml,['classification-cpc','cpc']),
    filing_date:firstXml(xml,['filing-date','filingDate','applicationDate']),priority_date:firstXml(xml,['priority-date','priorityDate']),publication_date:firstXml(xml,['publication-date','publicationDate']),grant_date:firstXml(xml,['grant-date','grantDate']),
    legal_status:firstXml(xml,['legal-status','legalStatus','status']),official_record_id:base.publication_number||base.application_number,source:'INPI API PI Brevets',retrieved_at:new Date().toISOString()
  }
}

function digits(v){return String(v||'').replace(/^[A-Z]{2}/i,'').replace(/[A-Z]\d{0,2}$/i,'').replace(/\D/g,'')}
async function fetchJson(url,headers,signal){const r=await fetch(url,{headers,signal});const text=await r.text();if(!r.ok)throw new Error(`${r.status} ${text.slice(0,300)}`);return JSON.parse(text)}
async function fetchText(url,headers,signal){const r=await fetch(url,{headers,signal});const text=await r.text();if(!r.ok)throw new Error(`${r.status} ${text.slice(0,300)}`);return text}

async function fetchUspto(base,signal){
  const key=process.env.USPTO_ODP_API_KEY||process.env.USPTO_API_KEY
  if(!key)return {status:'credentials_missing',detail:'Set USPTO_ODP_API_KEY.'}
  const q=digits(base.application_number)||digits(base.publication_number);if(!q)return {status:'identifier_missing'}
  const data=await fetchJson(`https://api.uspto.gov/api/v1/patent/applications/search?q=${encodeURIComponent(q)}&rows=10`,{'X-API-KEY':key,Accept:'application/json'},signal)
  const bag=data?.patentFileWrapperDataBag||[]
  if(!bag.length)return {status:'not_found'}
  const target=digits(base.application_number)||digits(base.publication_number)
  const chosen=bag.find(x=>JSON.stringify(x).replace(/\D/g,'').includes(target))||bag[0]
  return {status:'fetched',record:parseUsptoJson(chosen)}
}

async function fetchKipris(base,signal){
  const key=process.env.KIPRIS_SERVICE_KEY||process.env.KIPRIS_API_KEY
  if(!key)return {status:'credentials_missing',detail:'Set KIPRIS_SERVICE_KEY.'}
  const app=digits(base.application_number);if(!app)return {status:'identifier_missing',detail:'KIPRIS detail lookup requires a Korean application number.'}
  const root='https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/'
  const operations=['getBibliographyDetailInfoSearch','patentApplicantInfo','patentInventorInfo','patentIpcInfo','patentCpcInfo','patentPriorityInfo','patentLegalStatusInfo']
  const parts=[]
  for(const op of operations){try{parts.push(await fetchText(`${root}${op}?applicationNumber=${encodeURIComponent(app)}&ServiceKey=${encodeURIComponent(key)}`,{Accept:'application/xml'},signal))}catch(e){if(op==='getBibliographyDetailInfoSearch')throw e}}
  return {status:'fetched',record:parseKiprisXml(parts.join('\n'),base)}
}

async function fetchInpi(base,signal){
  const xsrf=process.env.INPI_XSRF_TOKEN,access=process.env.INPI_ACCESS_TOKEN,session=process.env.INPI_SESSION_TOKEN
  if(!xsrf||!access||!session)return {status:'credentials_missing',detail:'Set INPI_XSRF_TOKEN, INPI_ACCESS_TOKEN and INPI_SESSION_TOKEN.'}
  const pub=String(base.publication_number||'').toUpperCase().replace(/[\s./-]+/g,'').replace(/[A-Z]\d{0,2}$/,'')
  if(!pub.startsWith('FR'))return {status:'identifier_missing'}
  const url=`https://api-gateway.inpi.fr/services/apidiffusion/api/brevets/notice/pubnum/${encodeURIComponent(pub)}`
  const xml=await fetchText(url,{Accept:'application/xml','X-XSRF-TOKEN':xsrf,Cookie:`XSRF-TOKEN=${xsrf}; access_token=${access}; session_token=${session}`},signal)
  return {status:'fetched',record:parseInpiXml(xml,base)}
}

async function fetchOfficial(base,jurisdiction,signal){
  if(jurisdiction==='EP')return {status:'fetched',record:{...base,source:'EPO OPS',official_record_id:base.publication_number,retrieved_at:new Date().toISOString()}}
  if(jurisdiction==='US')return fetchUspto(base,signal)
  if(jurisdiction==='KR')return fetchKipris(base,signal)
  if(jurisdiction==='FR')return fetchInpi(base,signal)
  const cap=OFFICIAL_SOURCES[jurisdiction]||{name:'Unknown official source',note:'No adapter'}
  return {status:cap.mode==='conditional_subscription'?'subscription_required':'official_api_unavailable',detail:cap.note||''}
}

export async function verifyOfficialRecords(args){
  const records=args.records?.length?args.records:loadPatentRecords(args.workspace,{publication_numbers:args.publication_numbers||[],jurisdiction:args.jurisdiction||'',limit:args.limit||500})
  const results=[]
  for(const base of records){
    const j=normalizeJurisdiction(args.jurisdiction||base.jurisdiction||String(base.publication_number||'').slice(0,2))
    const cap=OFFICIAL_SOURCES[j]||{name:`Official source ${j}`,automated:false}
    try{
      const fetched=await fetchOfficial(base,j,args.signal)
      if(fetched.status==='fetched'&&fetched.record){const merged=mergeOfficialRecord(args.workspace,base,fetched.record,cap.name);results.push({jurisdiction:j,...merged});continue}
      markVerificationStatus(args.workspace,base,{source:cap.name,status:fetched.status,detail:fetched.detail||''});results.push({jurisdiction:j,publication_number:base.publication_number,source:cap.name,status:fetched.status,detail:fetched.detail||''})
    }catch(e){const detail=String(e.message||e);markVerificationStatus(args.workspace,base,{source:cap.name,status:'official_fetch_failed',detail});results.push({jurisdiction:j,publication_number:base.publication_number,source:cap.name,status:'official_fetch_failed',detail})}
  }
  const counts=results.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{})
  return {ok:true,checked:results.length,counts,results,summary:verificationSummary(args.workspace)}
}

export async function verifyOfficial(args){return verifyOfficialRecords(args)}
