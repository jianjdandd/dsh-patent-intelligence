import { cleanText,unique,xmlText } from './utils.js'
import { normalizeJurisdiction } from './connectors.js'
import { loadPatentRecords,markVerificationStatus,mergeOfficialRecord,verificationSummary } from './verification-store.js'

export const OFFICIAL_SOURCES=Object.freeze({
  CN:{name:'CNIPA',mode:'official_portal',automated:false,note:'Official portal; no stable public per-record REST API documented.'},
  US:{name:'USPTO Open Data Portal',mode:'rest',automated:true,credential:'USPTO_ODP_API_KEY',base:'https://api.uspto.gov/api/v1'},
  EP:{name:'European Patent Office / OPS',mode:'primary_official',automated:true,credential:'EPO_OPS_KEY + EPO_OPS_SECRET'},
  WO:{name:'WIPO PATENTSCOPE Webservice',mode:'conditional_subscription',automated:false,credential:'WIPO subscription',note:'Programmatic PCT Webservice access is conditional/fee-based.'},
  JP:{name:'JPO / J-PlatPat',mode:'official_portal',automated:false,note:'Official portal; no general public per-record REST API documented.'},
  KR:{name:'KIPRIS Plus',mode:'rest',automated:true,credential:'KIPRIS_SERVICE_KEY',base:'https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice'},
  GB:{name:'UKIPO',mode:'official_portal',automated:false,note:'Official portal; no stable general patent REST API documented.'},
  FR:{name:'INPI API PI Brevets',mode:'rest',automated:true,credential:'INPI_XSRF_TOKEN + INPI_ACCESS_TOKEN + INPI_SESSION_TOKEN',base:'https://api-gateway.inpi.fr/services/apidiffusion/api/brevets'},
  DE:{name:'DPMA / DPMAregister',mode:'official_portal',automated:false,note:'Official register; no stable general patent REST API documented.'},
  IN:{name:'Indian Patent Office',mode:'official_portal',automated:false,note:'Official portal; no stable general patent REST API documented.'}
})
export function listOfficialSources(){return Object.entries(OFFICIAL_SOURCES).map(([jurisdiction,v])=>({jurisdiction,...v,configured:isConfigured(jurisdiction)}))}
function isConfigured(j){if(j==='EP')return Boolean(process.env.EPO_OPS_KEY||process.env.EPO_CONSUMER_KEY);if(j==='US')return Boolean(process.env.USPTO_ODP_API_KEY||process.env.USPTO_API_KEY);if(j==='KR')return Boolean(process.env.KIPRIS_SERVICE_KEY||process.env.KIPRIS_API_KEY);if(j==='FR')return Boolean(process.env.INPI_XSRF_TOKEN&&process.env.INPI_ACCESS_TOKEN&&process.env.INPI_SESSION_TOKEN);return false}

function walkValues(obj,keyRe,out=[]){if(obj==null)return out;if(Array.isArray(obj)){for(const x of obj)walkValues(x,keyRe,out);return out}if(typeof obj!=='object')return out;for(const [k,v] of Object.entries(obj)){if(keyRe.test(k)&&['string','number','boolean'].includes(typeof v))out.push(cleanText(v));if(v&&typeof v==='object')walkValues(v,keyRe,out)}return out}
function firstJson(obj,re){return walkValues(obj,re,[]).find(Boolean)||''}
function allJson(obj,re){return unique(walkValues(obj,re,[])).join('; ')}
function ensurePrefix(v,prefix){const s=cleanText(v).toUpperCase().replace(/[\s./-]+/g,'');return s&&!s.startsWith(prefix)?`${prefix}${s}`:s}
function unwrap(data){return data?.patentFileWrapperDataBag?.[0]||data||{}}
function asArray(v){return Array.isArray(v)?v:(v==null?[]:[v])}
function cleanObj(o){return Object.fromEntries(Object.entries(o).filter(([,v])=>v!==''&&v!=null&&(!Array.isArray(v)||v.length)))}
function arrNames(v,re){return unique(walkValues(v,re,[]))}

function normalizeAssignments(data){
  const bag=asArray(unwrap(data).assignmentBag)
  return bag.map(a=>cleanObj({
    reel:a.reelNumber??'',frame:a.frameNumber??'',reel_frame:a['reelNumber/frameNumber']||'',recorded_date:a.assignmentRecordedDate||a.recordedDate||'',received_date:a.assignmentReceivedDate||'',mailed_date:a.assignmentMailedDate||'',
    conveyance:a.conveyanceText||'',assignors:arrNames(a,/assignorName(Text)?$/i),assignees:arrNames(a,/assigneeName(Text)?$/i),document_uri:a.assignmentDocumentLocationURI||''
  })).filter(x=>Object.keys(x).length)
}
function normalizeContinuity(data){const r=unwrap(data);return {parents:asArray(r.parentContinuityBag).map(x=>cleanObj({application_number:x.parentApplicationNumberText,filing_date:x.parentApplicationFilingDate,patent_number:x.parentPatentNumber,relation_code:x.claimParentageTypeCode,relation:x.claimParentageTypeCodeDescriptionText,status:x.parentApplicationStatusDescriptionText})),children:asArray(r.childContinuityBag).map(x=>cleanObj({application_number:x.childApplicationNumberText,filing_date:x.childApplicationFilingDate,patent_number:x.childPatentNumber,relation_code:x.claimParentageTypeCode,relation:x.claimParentageTypeCodeDescriptionText,status:x.childApplicationStatusDescriptionText}))}}
function normalizeForeignPriority(data){return asArray(unwrap(data).foreignPriorityBag).map(x=>cleanObj({application_number:x.foreignApplicationNumberText||x.priorityNumberText||x.priorityApplicationNumber,filing_date:x.foreignFilingDate||x.filingDate,country_code:x.foreignCountryCode,country_name:x.foreignCountryName,office:x.foreignPatentOffice,kind_code:x.kindCode,relation_type:x.relationType,international:x.internationalFilingIndicator})).filter(x=>Object.keys(x).length)}
function normalizeTransactions(data){const r=unwrap(data);return asArray(r.eventDataBag||r.transactionContentBag).map(x=>cleanObj({code:x.eventCode,date:x.eventDate,description:x.eventDescriptionText||x.eventDescription,category:x.eventCategory,document_code:x.documentCode,document_name:x.documentName,correspondent:x.correspondentName})).filter(x=>Object.keys(x).length)}

export function parseUsptoJson(data,extras={}){
  const root=unwrap(data),meta=root.applicationMetaData||root.applicationMetadata||root
  const assignmentData=extras.assignment||root,continuityData=extras.continuity||root,priorityData=extras.foreign_priority||root,transactionData=extras.transactions||root,attorneyData=extras.attorney||root.recordAttorney||{},adjustmentData=extras.adjustment||root.patentTermAdjustmentData||{}
  const assignments=normalizeAssignments(assignmentData),continuity=normalizeContinuity(continuityData),foreignPriority=normalizeForeignPriority(priorityData),transactions=normalizeTransactions(transactionData)
  const applicants=arrNames(root,/(firstApplicantName|applicantName(Text)?|applicantFullName)$/i),inventors=arrNames(root,/(firstInventorName|inventorName(Text)?|inventorFullName)$/i),agents=arrNames(attorneyData,/(attorneyName(Text)?|practitionerName|nameLineOneText)$/i),examiners=arrNames(meta,/(examinerName(Text)?|primaryExaminerName)$/i)
  const currentAssignees=assignments.length?(assignments.at(-1).assignees||[]):[]
  const publication=ensurePrefix(firstJson(meta,/^(earliestPublicationNumber|publicationNumber(Text)?|preGrantPublicationNumber)$/i),'US'),application=ensurePrefix(root.applicationNumberText||firstJson(meta,/^applicationNumber(Text)?$/i),'US'),patent=firstJson(meta,/^patentNumber$/i)
  const structured={
    identifiers:cleanObj({application_number:application,publication_number:publication,patent_number:patent}),
    parties:{applicants,inventors,agents,examiners,right_holders:currentAssignees},
    priority:{foreign:foreignPriority},continuity,assignments,transactions,
    legal:{current_status:firstJson(meta,/^applicationStatusDescriptionText$/i),status_code:firstJson(meta,/^applicationStatusCode$/i),status_date:firstJson(meta,/^applicationStatusDate$/i)},
    prosecution:cleanObj({application_type:firstJson(meta,/^(applicationTypeCode|applicationTypeLabelName)$/i),entity_status:firstJson(meta,/^businessEntityStatusCategory$/i),art_unit:firstJson(meta,/^groupArtUnitNumber$/i),status_date:firstJson(meta,/^applicationStatusDate$/i),examiners,patent_term_adjustment:unwrap(adjustmentData),pta_days:Number(firstJson(adjustmentData,/^(adjustmentTotalQuantity|totalPtaDays)$/i)||0)})
  }
  return {publication_number:publication,application_number:application,priority_numbers:foreignPriority.map(x=>x.application_number).filter(Boolean).join('; '),title:firstJson(meta,/^(inventionTitle|title)$/i),abstract:firstJson(root,/^(abstract|abstractText)$/i),applicants:applicants.join('; '),inventors:inventors.join('; '),ipc:allJson(root,/(ipcClassification|internationalPatentClassification|ipcCode)$/i),cpc:allJson(root,/(cpcClassification|cpcCode)$/i),filing_date:firstJson(meta,/^filingDate$/i),priority_date:foreignPriority.map(x=>x.filing_date).filter(Boolean).sort()[0]||'',publication_date:firstJson(meta,/^(earliestPublicationDate|publicationDate)$/i),grant_date:firstJson(meta,/^grantDate$/i),legal_status:firstJson(meta,/^applicationStatusDescriptionText$/i),official_record_id:application||patent||publication,source:'USPTO Open Data Portal',structured,retrieved_at:new Date().toISOString()}
}

function xmlValues(xml,names){const out=[];for(const name of names){const re=new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${name}>`,'gi');for(const m of String(xml||'').matchAll(re)){const v=xmlText(m[1]);if(v)out.push(v)}}return unique(out)}
function firstXml(xml,names){return xmlValues(xml,names)[0]||''}
function allXml(xml,names){return xmlValues(xml,names).join('; ')}
function xmlPart(input,key){return typeof input==='string'?input:(input?.[key]||'')}
function allParts(input){return typeof input==='string'?input:Object.values(input||{}).join('\n')}

export function parseKiprisXml(input,base={}){
  const all=allParts(input),family=xmlPart(input,'patentFamilyInfo')+'\n'+xmlPart(input,'patentFamilyInfoV1'),legal=xmlPart(input,'patentLegalStatusInfo'),transfer=xmlPart(input,'patentTransferInfo')+'\n'+xmlPart(input,'lastTransferDateInfo')+'\n'+xmlPart(input,'getChangeInfoSearch'),priority=xmlPart(input,'patentPriorityInfo'),intl=xmlPart(input,'patentInternationalInfo')+'\n'+xmlPart(input,'patentDesignatedStateInfo'),priorArt=xmlPart(input,'patentPriorArtDocumentsInfo'),claims=xmlPart(input,'patentClaimInfo'),rnd=xmlPart(input,'patentRndInfo')
  const applicants=xmlValues(all,['applicantName','applicantEngName','applicant']),inventors=xmlValues(all,['inventorName','inventorEngName','inventor']),agents=xmlValues(all,['agentName','agentEngName','attorneyName']),rightHolders=xmlValues(transfer||all,['rightHolderName','rightHolerName','registrantName','ownerName','assigneeName'])
  const familyApps=xmlValues(family,['applicationNumber','applicationNo','familyApplicationNumber']),familyPubs=xmlValues(family,['publicationNumber','publicationNo','openNumber','familyPublicationNumber']),familyIds=xmlValues(family,['familyId','familyID'])
  const legalEvents={codes:xmlValues(legal,['legalStatusCode','statusCode','eventCode']),descriptions:xmlValues(legal,['legalStatusName','legalStatus','statusName','eventDescription']),dates:xmlValues(legal,['legalStatusDate','statusDate','eventDate'])}
  const structured={
    parties:{applicants,inventors,agents,right_holders:rightHolders},
    priority:{numbers:xmlValues(priority||all,['priorityNumber','priorityNo']),dates:xmlValues(priority||all,['priorityDate'])},
    family:{ids:familyIds,application_numbers:familyApps,publication_numbers:familyPubs,members:unique([...familyApps,...familyPubs])},
    legal:{current_status:firstXml(legal||all,['legalStatus','legalStatusName','registrationStatus']),events:legalEvents.descriptions.map((description,i)=>cleanObj({description,code:legalEvents.codes[i]||'',date:legalEvents.dates[i]||''}))},
    transfers:{right_holders:rightHolders,transfer_dates:xmlValues(transfer,['transferDate','changeDate','registrationDate']),last_transfer_date:firstXml(transfer,['lastTransferDate','transferDate'])},
    international:{application_numbers:xmlValues(intl,['internationalApplicationNumber']),publication_numbers:xmlValues(intl,['internationalOpenNumber','internationalPublicationNumber']),application_dates:xmlValues(intl,['internationalApplicationDate']),publication_dates:xmlValues(intl,['internationalOpenDate']),designated_states:xmlValues(intl,['designatedState','designatedStateCode'])},
    citations:{prior_art_documents:xmlValues(priorArt,['documentNumber','publicationNumber','priorArtDocumentNumber'])},
    prosecution:{claims:xmlValues(claims,['claimText','claim','claimContent']),rnd_projects:xmlValues(rnd,['rndProjectName','projectName','rndInfo'])}
  }
  return {publication_number:ensurePrefix(firstXml(all,['publicationNumber','openNumber','publicationNo','openNo'])||base.publication_number,'KR'),application_number:ensurePrefix(firstXml(all,['applicationNumber','applicationNo'])||base.application_number,'KR'),priority_numbers:allXml(priority||all,['priorityNumber','priorityNo'])||base.priority_numbers||'',family_id:familyIds[0]||'',title:firstXml(all,['inventionTitle','titleOfInvention','title']),abstract:firstXml(all,['astrtCont','abstract','abstractText']),applicants:applicants.join('; '),inventors:inventors.join('; '),ipc:allXml(all,['ipcNumber','ipcCode','ipc']),cpc:allXml(all,['cpcNumber','cpcCode','cpc']),filing_date:firstXml(all,['applicationDate','filingDate']),priority_date:firstXml(priority||all,['priorityDate']),publication_date:firstXml(all,['publicationDate','openDate']),grant_date:firstXml(all,['registrationDate','grantDate']),legal_status:firstXml(legal||all,['legalStatus','legalStatusName','registrationStatus']),official_record_id:firstXml(all,['applicationNumber','applicationNo'])||base.application_number||base.publication_number,source:'KIPRIS Plus',structured,retrieved_at:new Date().toISOString()}
}

export function parseInpiXml(xml,base={}){
  const applicants=xmlValues(xml,['applicant-name','applicantName','applicant']),inventors=xmlValues(xml,['inventor-name','inventorName','inventor']),familyIds=xmlValues(xml,['family-id','familyId'])
  const structured={parties:{applicants,inventors},priority:{numbers:xmlValues(xml,['priority-number','priorityNumber']),dates:xmlValues(xml,['priority-date','priorityDate'])},family:{ids:familyIds},legal:{current_status:firstXml(xml,['legal-status','legalStatus','status'])}}
  return {publication_number:ensurePrefix(firstXml(xml,['publication-number','publicationNumber','doc-number'])||base.publication_number,'FR'),application_number:ensurePrefix(firstXml(xml,['application-number','applicationNumber'])||base.application_number,'FR'),priority_numbers:allXml(xml,['priority-number','priorityNumber'])||base.priority_numbers||'',family_id:familyIds[0]||'',title:firstXml(xml,['invention-title','title']),abstract:firstXml(xml,['abstract','abstractText']),applicants:applicants.join('; '),inventors:inventors.join('; '),ipc:allXml(xml,['classification-ipc','classification-symbol','ipc']),cpc:allXml(xml,['classification-cpc','cpc']),filing_date:firstXml(xml,['filing-date','filingDate','applicationDate']),priority_date:firstXml(xml,['priority-date','priorityDate']),publication_date:firstXml(xml,['publication-date','publicationDate']),grant_date:firstXml(xml,['grant-date','grantDate']),legal_status:firstXml(xml,['legal-status','legalStatus','status']),official_record_id:base.publication_number||base.application_number,source:'INPI API PI Brevets',structured,retrieved_at:new Date().toISOString()}
}

function digits(v){return String(v||'').replace(/^[A-Z]{2}/i,'').replace(/[A-Z]\d{0,2}$/i,'').replace(/\D/g,'')}
async function fetchJson(url,headers,signal){const r=await fetch(url,{headers,signal}),text=await r.text();if(!r.ok)throw new Error(`${r.status} ${text.slice(0,300)}`);return JSON.parse(text)}
async function fetchText(url,headers,signal){const r=await fetch(url,{headers,signal}),text=await r.text();if(!r.ok)throw new Error(`${r.status} ${text.slice(0,300)}`);return text}
async function optionalJson(url,headers,signal){try{return await fetchJson(url,headers,signal)}catch{return {}}}

async function fetchUspto(base,signal){
  const key=process.env.USPTO_ODP_API_KEY||process.env.USPTO_API_KEY;if(!key)return {status:'credentials_missing',detail:'Set USPTO_ODP_API_KEY.'}
  const app=digits(base.application_number);if(!app)return {status:'identifier_missing',detail:'USPTO detail enrichment requires a US application number.'}
  const headers={'X-API-KEY':key,Accept:'application/json'},root=`https://api.uspto.gov/api/v1/patent/applications/${encodeURIComponent(app)}`
  const main=await fetchJson(root,headers,signal),names={assignment:'assignment',continuity:'continuity',foreign_priority:'foreign-priority',transactions:'transactions',attorney:'attorney',adjustment:'adjustment'},extras={}
  await Promise.all(Object.entries(names).map(async([k,p])=>{extras[k]=await optionalJson(`${root}/${p}`,headers,signal)}))
  return {status:'fetched',record:parseUsptoJson(main,extras)}
}

const KIPRIS_OPS=['getBibliographyDetailInfoSearch','patentApplicantInfo','patentInventorInfo','patentIpcInfo','patentCpcInfo','patentPriorityInfo','patentFamilyInfo','patentFamilyInfoV1','patentLegalStatusInfo','patentAgentInfo','patentInternationalInfo','patentDesignatedStateInfo','patentPriorArtDocumentsInfo','patentClaimInfo','patentRndInfo','patentTransferInfo','lastTransferDateInfo','getChangeInfoSearch']
async function fetchKipris(base,signal){
  const key=process.env.KIPRIS_SERVICE_KEY||process.env.KIPRIS_API_KEY;if(!key)return {status:'credentials_missing',detail:'Set KIPRIS_SERVICE_KEY.'}
  const app=digits(base.application_number);if(!app)return {status:'identifier_missing',detail:'KIPRIS detail enrichment requires a Korean application number.'}
  const root='https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/',parts={}
  await Promise.all(KIPRIS_OPS.map(async op=>{try{parts[op]=await fetchText(`${root}${op}?applicationNumber=${encodeURIComponent(app)}&ServiceKey=${encodeURIComponent(key)}`,{Accept:'application/xml'},signal)}catch(e){if(op==='getBibliographyDetailInfoSearch')throw e}}))
  return {status:'fetched',record:parseKiprisXml(parts,base)}
}
async function fetchInpi(base,signal){
  const xsrf=process.env.INPI_XSRF_TOKEN,access=process.env.INPI_ACCESS_TOKEN,session=process.env.INPI_SESSION_TOKEN;if(!xsrf||!access||!session)return {status:'credentials_missing',detail:'Set INPI_XSRF_TOKEN, INPI_ACCESS_TOKEN and INPI_SESSION_TOKEN.'}
  const pub=String(base.publication_number||'').toUpperCase().replace(/[\s./-]+/g,'').replace(/[A-Z]\d{0,2}$/,'');if(!pub.startsWith('FR'))return {status:'identifier_missing'}
  const xml=await fetchText(`https://api-gateway.inpi.fr/services/apidiffusion/api/brevets/notice/pubnum/${encodeURIComponent(pub)}`,{Accept:'application/xml','X-XSRF-TOKEN':xsrf,Cookie:`XSRF-TOKEN=${xsrf}; access_token=${access}; session_token=${session}`},signal)
  return {status:'fetched',record:parseInpiXml(xml,base)}
}
async function fetchOfficial(base,jurisdiction,signal){if(jurisdiction==='EP')return {status:'fetched',record:{...base,source:'EPO OPS',official_record_id:base.publication_number,structured:{identifiers:{publication_number:base.publication_number,application_number:base.application_number}},retrieved_at:new Date().toISOString()}};if(jurisdiction==='US')return fetchUspto(base,signal);if(jurisdiction==='KR')return fetchKipris(base,signal);if(jurisdiction==='FR')return fetchInpi(base,signal);const cap=OFFICIAL_SOURCES[jurisdiction]||{name:'Unknown official source',note:'No adapter'};return {status:cap.mode==='conditional_subscription'?'subscription_required':'official_api_unavailable',detail:cap.note||''}}

export async function verifyOfficialRecords(args){
  const records=args.records?.length?args.records:loadPatentRecords(args.workspace,{publication_numbers:args.publication_numbers||[],jurisdiction:args.jurisdiction||'',limit:args.limit||500}),results=[]
  for(const base of records){const j=normalizeJurisdiction(args.jurisdiction||base.jurisdiction||String(base.publication_number||'').slice(0,2)),cap=OFFICIAL_SOURCES[j]||{name:`Official source ${j}`,automated:false};try{const fetched=await fetchOfficial(base,j,args.signal);if(fetched.status==='fetched'&&fetched.record){const merged=mergeOfficialRecord(args.workspace,base,fetched.record,cap.name);results.push({jurisdiction:j,...merged});continue}markVerificationStatus(args.workspace,base,{source:cap.name,status:fetched.status,detail:fetched.detail||''});results.push({jurisdiction:j,publication_number:base.publication_number,source:cap.name,status:fetched.status,detail:fetched.detail||''})}catch(e){const detail=String(e.message||e);markVerificationStatus(args.workspace,base,{source:cap.name,status:'official_fetch_failed',detail});results.push({jurisdiction:j,publication_number:base.publication_number,source:cap.name,status:'official_fetch_failed',detail})}}
  const counts=results.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{});return {ok:true,checked:results.length,counts,results,summary:verificationSummary(args.workspace)}
}
export async function verifyOfficial(args){return verifyOfficialRecords(args)}
