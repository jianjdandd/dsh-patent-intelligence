export const name='patent-intelligence'
export const inject=['tools']

const actions=['strategy','connectors','import','search_ops','search_online','fetch_biblio','search_cn','search_us','search_ep','search_wo','search_jp','search_kr','search_gb','search_fr','search_de','search_in','workset','annotate','analyze','report','status']

export function apply(ctx){
  ctx.tools.register({
    name:'patent_intel',
    description:'Lightweight global patent intelligence. One tool, action-routed. Supports online bibliographic retrieval for CN/US/EP/WO/JP/KR/GB/FR/DE/IN through EPO OPS/DOCDB, including applicants, inventors, publication/application/priority numbers, title, abstract, IPC/CPC and dates. Use strategy to build queries; search_online for multi-jurisdiction download; search_cn/search_us/search_ep/search_wo/search_jp/search_kr/search_gb/search_fr/search_de/search_in as shortcuts; fetch_biblio for known publication numbers; import for commercial-database exports; workset/annotate/analyze/report for research workflow.',
    parameters:{type:'object',additionalProperties:true,required:['action'],properties:{action:{type:'string',enum:actions},workspace:{type:'string'},topic:{type:'string'},concepts:{type:'array',items:{type:'object',additionalProperties:true}},jurisdictions:{type:'array',items:{type:'string'}},databases:{type:'array',items:{type:'string'}},file:{type:'string'},query:{type:'string'},publication_numbers:{type:'array',items:{type:'string'}},limit:{type:'number'},offset:{type:'number'},annotations:{type:'array',items:{type:'object',additionalProperties:true}},formats:{type:'array',items:{type:'string'}}}},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
    timeoutMs:300000,
    async execute(args,exec){const {run}=await import('./src/core.js');return run(args,{signal:exec?.signal})}
  })
}
