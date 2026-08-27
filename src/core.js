import { resolveWorkspace } from './utils.js'

const JUR_ACTION={search_cn:'CN',search_us:'US',search_ep:'EP',search_wo:'WO',search_jp:'JP',search_kr:'KR',search_gb:'GB',search_fr:'FR',search_de:'DE',search_in:'IN'}

export async function run(args,ctx={}){
  const action=args.action,workspace=await resolveWorkspace(args.workspace)
  if(JUR_ACTION[action]){const {searchHybrid}=await import('./hybrid.js');return searchHybrid({...args,workspace,jurisdictions:[JUR_ACTION[action]],signal:ctx.signal})}
  switch(action){
    case 'strategy':{const {buildStrategy}=await import('./query.js');return buildStrategy({...args,workspace})}
    case 'connectors':{const [{listConnectors},{listOfficialSources}]=await Promise.all([import('./connectors.js'),import('./official.js')]);return {ok:true,docdb:listConnectors(),official_sources:listOfficialSources()}}
    case 'official_sources':{const {listOfficialSources}=await import('./official.js');return {ok:true,official_sources:listOfficialSources()}}
    case 'verify_official':{const {verifyOfficial}=await import('./official.js');return verifyOfficial({...args,workspace,signal:ctx.signal})}
    case 'import':{const {importRecords}=await import('./store.js');return importRecords({...args,workspace})}
    case 'search_ops':{const {searchOps}=await import('./ops.js');return searchOps({...args,workspace,signal:ctx.signal})}
    case 'search_online':{const {searchHybrid}=await import('./hybrid.js');return searchHybrid({...args,workspace,signal:ctx.signal})}
    case 'search_country':{const {searchHybrid}=await import('./hybrid.js');const jurisdiction=args.jurisdiction||args.jurisdictions?.[0];if(!jurisdiction)throw new Error('search_country requires jurisdiction');return searchHybrid({...args,workspace,jurisdictions:[jurisdiction],signal:ctx.signal})}
    case 'fetch_biblio':{const {fetchHybrid}=await import('./hybrid.js');return fetchHybrid({...args,workspace,signal:ctx.signal})}
    case 'workset':{const {workset}=await import('./store.js');return workset({...args,workspace})}
    case 'annotate':{const {annotate}=await import('./store.js');return annotate({...args,workspace})}
    case 'analyze':{const {analyze}=await import('./analyze.js');return analyze({...args,workspace})}
    case 'report':{const {report}=await import('./report.js');return report({...args,workspace})}
    case 'status':{const {status}=await import('./store.js');return status({...args,workspace})}
    default:throw new Error(`Unsupported action: ${action}`)
  }
}
