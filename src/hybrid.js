import { searchOnline as searchDocdb,fetchBiblio as fetchDocdb } from './ops.js'
import { verifyOfficialRecords } from './official.js'

export async function searchHybrid(args){
  const docdb=await searchDocdb({...args,return_records:true})
  const official=[]
  if(args.official_enrich!==false){
    for(const r of docdb.results||[]){
      const records=r.records||[]
      if(!records.length){official.push({jurisdiction:r.jurisdiction,ok:true,checked:0,counts:{}});continue}
      official.push({jurisdiction:r.jurisdiction,...await verifyOfficialRecords({...args,records,jurisdiction:r.jurisdiction})})
    }
  }
  if(!args.return_records)for(const r of docdb.results||[])delete r.records
  return {...docdb,pipeline:'DOCDB -> official verification/supplement',official_enrich:args.official_enrich!==false,official}
}

export async function fetchHybrid(args){
  const docdb=await fetchDocdb(args),official=[]
  if(args.official_enrich!==false){
    const groups=new Map()
    for(const r of docdb.records||[]){const j=r.jurisdiction||String(r.publication_number||'').slice(0,2).toUpperCase();if(!groups.has(j))groups.set(j,[]);groups.get(j).push(r)}
    for(const [jurisdiction,records] of groups)official.push({jurisdiction,...await verifyOfficialRecords({...args,records,jurisdiction})})
  }
  return {...docdb,pipeline:'DOCDB -> official verification/supplement',official_enrich:args.official_enrich!==false,official}
}
