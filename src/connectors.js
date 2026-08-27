export const JURISDICTION_CONNECTORS = {
  CN:{name:'China / CNIPA', authority:'CN', primary:'EPO OPS/DOCDB', fallback:null},
  US:{name:'United States / USPTO', authority:'US', primary:'EPO OPS/DOCDB', fallback:null},
  EP:{name:'Europe / EPO', authority:'EP', primary:'EPO OPS', fallback:null},
  WO:{name:'WIPO/PCT', authority:'WO', primary:'EPO OPS/DOCDB', fallback:'WIPO PATENTSCOPE licensed webservice'},
  JP:{name:'Japan / JPO', authority:'JP', primary:'EPO OPS/DOCDB', fallback:null},
  KR:{name:'Korea / KIPO', authority:'KR', primary:'EPO OPS/DOCDB', fallback:'KIPRIS Plus when configured'},
  GB:{name:'United Kingdom / UKIPO', authority:'GB', primary:'EPO OPS/DOCDB', fallback:null},
  FR:{name:'France / INPI', authority:'FR', primary:'EPO OPS/DOCDB', fallback:null},
  DE:{name:'Germany / DPMA', authority:'DE', primary:'EPO OPS/DOCDB', fallback:null},
  IN:{name:'India / IPO', authority:'IN', primary:'EPO OPS/DOCDB', fallback:null}
}

export function listConnectors() {
  return Object.entries(JURISDICTION_CONNECTORS).map(([jurisdiction,v])=>({jurisdiction,...v,online:true,bibliographic_fields:['publication_number','application_number','priority_numbers','title','abstract','applicants','inventors','ipc','cpc','filing_date','priority_date','publication_date']}))
}

export function jurisdictionQuery(base, jurisdiction) {
  const j=String(jurisdiction||'').toUpperCase()
  if (!JURISDICTION_CONNECTORS[j]) throw new Error(`Unsupported jurisdiction: ${j}`)
  return `(${base}) AND pn=${j}`
}
