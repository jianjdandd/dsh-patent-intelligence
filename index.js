export const name='patent-intelligence'
export const inject=['tools']

const actions=['strategy','connectors','official_sources','verify_official','import','search_ops','search_online','search_country','fetch_biblio','search_cn','search_us','search_ep','search_wo','search_jp','search_kr','search_gb','search_fr','search_de','search_in','workset','annotate','analyze','report','status']

export function apply(ctx){
  ctx.tools.register({
    name:'patent_intel',
    description:'Global patent intelligence with a two-stage evidence pipeline: EPO DOCDB/OPS supplies worldwide master bibliographic data, then jurisdiction-specific official sources verify and supplement fields where an official machine API is available. Direct official adapters: USPTO ODP (US), KIPRIS Plus (KR), INPI API PI (FR); EP is already sourced from EPO. WIPO/PCT and other official portals report explicit subscription/API availability instead of pretending verification. Use search_online/search_cn/... for automatic DOCDB plus official enrichment, verify_official to re-check stored records, official_sources to inspect source capability, and fetch_biblio for known publication numbers.',
    parameters:{type:'object',additionalProperties:true,required:['action'],properties:{action:{type:'string',enum:actions},workspace:{type:'string'},topic:{type:'string'},concepts:{type:'array',items:{type:'object',additionalProperties:true}},jurisdiction:{type:'string'},jurisdictions:{type:'array',items:{type:'string'}},databases:{type:'array',items:{type:'string'}},file:{type:'string'},query:{type:'string'},publication_numbers:{type:'array',items:{type:'string'}},limit:{type:'number'},limit_per_jurisdiction:{type:'number'},return_records:{type:'boolean'},official_enrich:{type:'boolean',description:'Default true. After DOCDB retrieval, verify/supplement with the jurisdiction official source when configured.'},offset:{type:'number'},annotations:{type:'array',items:{type:'object',additionalProperties:true}},formats:{type:'array',items:{type:'string'}}}},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value,null,2)}]},
    timeoutMs:300000,
    async execute(args,exec){const {run}=await import('./src/core.js');return run(args,{signal:exec?.signal})}
  })
}
