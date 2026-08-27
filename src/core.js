import { resolveWorkspace } from './utils.js'

const JUR_ACTION={search_cn:'CN',search_us:'US',search_ep:'EP',search_wo:'WO',search_jp:'JP',search_kr:'KR',search_gb:'GB',search_fr:'FR',search_de:'DE',search_in:'IN'}

export async function run(args,ctx={}){
  const action=args.action,workspace=await resolveWorkspace(args.workspace)
  if(JUR_ACTION[action]){const {searchOnline}=await import('./ops.js');return searchOnline({...args,workspace,jurisdictions:[JUR_ACTION[action]],signal:ctx.signal})}
  switch(action){
    case 'strategy':{const {buildStrategy}=await import('./query.js');return buildStrategy({...args,workspace})}
    case 'connectors':{const {listConnectors}=await import('./connectors.js');return {ok:true,connectors:listConnectors()}}
    case 'import':{const {importRecords}=await import('./store.js');return importRecords({...args,workspace})}
    case 'search_ops':{const {searchOps}=await import('./ops.js');return searchOps({...args,workspace,signal:ctx.signal})}
    case 'search_online':{const {searchOnline}=await import('./ops.js');return searchOnline({...args,workspace,signal:ctx.signal})}
    case 'fetch_biblio':{const {fetchBiblio}=await import('./ops.js');return fetchBiblio({...args,workspace,signal:ctx.signal})}
    case 'workset':{const {workset}=await import('./store.js');return workset({...args,workspace})}
    case 'annotate':{const {annotate}=await import('./store.js');return annotate({...args,workspace})}
    case 'analyze':{const {analyze}=await import('./analyze.js');return analyze({...args,workspace})}
    case 'report':{const {report}=await import('./report.js');return report({...args,workspace})}
    case 'status':{const {status}=await import('./store.js');return status({...args,workspace})}
    default:throw new Error(`Unsupported action: ${action}`)
  }
}
