export const TARGET_JURISDICTIONS=['CN','US','EP','WO','JP','KR','GB','FR','DE','IN']

const FIELDS=['publication_number','application_number','priority_numbers','title','abstract','applicants','inventors','ipc','cpc','filing_date','priority_date','publication_date']

export const JURISDICTION_CONNECTORS=Object.freeze({
  CN:{name:'China / CNIPA',authority:'CN',primary:'EPO OPS/DOCDB',direct:'CNIPA source-specific connector reserved'},
  US:{name:'United States / USPTO',authority:'US',primary:'EPO OPS/DOCDB',direct:'USPTO source-specific connector reserved'},
  EP:{name:'Europe / EPO',authority:'EP',primary:'EPO OPS/DOCDB',direct:'EPO OPS'},
  WO:{name:'WIPO / PCT',authority:'WO',primary:'EPO OPS/DOCDB',direct:'PATENTSCOPE validation/search UI; programmatic access depends on service terms'},
  JP:{name:'Japan / JPO',authority:'JP',primary:'EPO OPS/DOCDB',direct:'J-PlatPat source-specific connector reserved'},
  KR:{name:'Korea / KIPO',authority:'KR',primary:'EPO OPS/DOCDB',direct:'KIPRIS Plus REST API optional when separately configured'},
  GB:{name:'United Kingdom / UKIPO',authority:'GB',primary:'EPO OPS/DOCDB',direct:'UKIPO source-specific connector reserved'},
  FR:{name:'France / INPI',authority:'FR',primary:'EPO OPS/DOCDB',direct:'INPI source-specific connector reserved'},
  DE:{name:'Germany / DPMA',authority:'DE',primary:'EPO OPS/DOCDB',direct:'DPMA source-specific connector reserved'},
  IN:{name:'India / IPO',authority:'IN',primary:'EPO OPS/DOCDB',direct:'Indian Patent Office source-specific connector reserved'}
})

export function normalizeJurisdiction(value){return String(value||'').trim().toUpperCase()}

export function listConnectors(){
  return TARGET_JURISDICTIONS.map(j=>({jurisdiction:j,...JURISDICTION_CONNECTORS[j],online:true,credential:'EPO_OPS_KEY + EPO_OPS_SECRET',bibliographic_fields:FIELDS}))
}

export function jurisdictionQuery(base,jurisdiction){
  const j=normalizeJurisdiction(jurisdiction)
  if(!/^[A-Z]{2}$/.test(j))throw new Error(`Invalid ST.3 jurisdiction: ${j}`)
  return `(${String(base||'').trim()}) AND pn=${j}`
}
