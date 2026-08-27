export const name='patent-intelligence'
export const inject=['tools']

const actions=['strategy','connectors','import','search_ops','search_online','search_country','fetch_biblio','search_cn','search_us','search_ep','search_wo','search_jp','search_kr','search_gb','search_fr','search_de','search_in','workset','annotate','analyze','report','status']

export function apply(ctx){
  ctx.tools.register({
    name:'patent_intel',
    description:'Lightweight global patent intelligence. One action-routed tool. Online bibliographic retrieval covers CN/US/EP/WO/JP/KR/GB/FR/DE/IN through EPO OPS/DOCDB and stores publication/application/priority numbers, title, abstract, applicants, inventors, IPC/CPC and dates. Use search_online for several jurisdictions, search_country for one ST.3 authority, jurisdiction shortcuts such as search_cn/search_us/search_ep/search_wo/search_jp/search_kr/search_gb/search_fr/search_de/search_in, or fetch_biblio for known publication numbers. Commercial database exports remain supported through import.',
    parameters:{type:'object',additionalProperties:true,required:['action'],properties:{action:{type:'string',enum:actions},workspace:{type:'string'},topic:{type:'string'},concepts:{type:'array',items:{type:'object',additionalProperties:true}},jurisdiction:{type:'string'},jurisdictions:{type:'array',items:{type:'string'}},databases:{type:'array',items:{type:'string'}},file:{type:'string'},query:{type:'string'},publication_numbers:{type:'array',items:{type:'string'}},limit:{type:'number'},limit_per_jurisdiction:{type:'number'},return_records:{type:'boolean'},offset:{type:'number'},annotations:{type:'array',items:{type:'object',additionalProperties:true}},formats:{type:'array',items:{type:'string'}}}},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
    timeoutMs:300000,
    async execute(args,exec){const {run}=await import('./src/core.js');return run(args,{signal:exec?.signal})}
  })
}
