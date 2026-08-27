export const name='patent-intelligence'
export const inject=['tools']

const actions=['strategy','connectors','official_sources','import','search_ops','search_online','search_country','fetch_biblio','verify_official','details','search_cn','search_us','search_ep','search_wo','search_jp','search_kr','search_gb','search_fr','search_de','search_in','workset','annotate','analyze','report','status']

export function apply(ctx){
  ctx.tools.register({
    name:'patent_intel',
    description:'Global patent intelligence with DOCDB primary data plus official-source verification. One action-routed tool. Online coverage: CN/US/EP/WO/JP/KR/GB/FR/DE/IN. Core bibliographic fields plus structured details for parties, priority, family, legal events, assignments, continuity, transactions, prosecution, international data and citations. USPTO enrichment includes assignment/continuity/foreign-priority/transactions/attorney/PTA; KIPRIS enrichment includes family/legal status/right-holder transfer plus other metadata endpoints. Use details to retrieve the enriched per-patent structure.',
    parameters:{type:'object',additionalProperties:true,required:['action'],properties:{action:{type:'string',enum:actions},workspace:{type:'string'},topic:{type:'string'},concepts:{type:'array',items:{type:'object',additionalProperties:true}},jurisdiction:{type:'string'},jurisdictions:{type:'array',items:{type:'string'}},databases:{type:'array',items:{type:'string'}},file:{type:'string'},query:{type:'string'},publication_numbers:{type:'array',items:{type:'string'}},limit:{type:'number'},limit_per_jurisdiction:{type:'number'},return_records:{type:'boolean'},official_enrich:{type:'boolean'},offset:{type:'number'},annotations:{type:'array',items:{type:'object',additionalProperties:true}},formats:{type:'array',items:{type:'string'}}}},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
    timeoutMs:300000,
    async execute(args,exec){const {run}=await import('./src/core.js');return run(args,{signal:exec?.signal})}
  })
}
