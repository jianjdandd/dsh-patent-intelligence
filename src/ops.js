import { insertNormalizedRecords } from './store.js'
import { cleanText, xmlText } from './utils.js'

const TOKEN_URL = 'https://ops.epo.org/3.2/auth/accesstoken'
const SEARCH_URL = 'https://ops.epo.org/3.2/rest-services/published-data/search'

async function token(signal) {
  const key = process.env.EPO_OPS_KEY || process.env.EPO_CONSUMER_KEY
  const secret = process.env.EPO_OPS_SECRET || process.env.EPO_CONSUMER_SECRET
  if (!key || !secret) throw new Error('EPO OPS credentials missing. Set EPO_OPS_KEY and EPO_OPS_SECRET.')
  const basic = Buffer.from(`${key}:${secret}`).toString('base64')
  const r = await fetch(TOKEN_URL, {
    method:'POST', signal,
    headers:{ Authorization:`Basic ${basic}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:'grant_type=client_credentials'
  })
  if (!r.ok) throw new Error(`EPO OPS token failed: ${r.status} ${await r.text()}`)
  return (await r.json()).access_token
}

function first(block, tag, lang='') {
  const langPart = lang ? `[^>]*lang=["']${lang}["'][^>]*` : '[^>]*'
  const re = new RegExp(`<${tag}${langPart}>([\\s\\S]*?)<\\/${tag}>`, 'i')
  return xmlText(block.match(re)?.[1] || '')
}

function allNames(block, outerTag, innerTag='name') {
  const outer = new RegExp(`<${outerTag}[^>]*>([\\s\\S]*?)<\\/${outerTag}>`, 'gi')
  const names=[]
  for (const m of block.matchAll(outer)) {
    const n = m[1].match(new RegExp(`<${innerTag}[^>]*>([\\s\\S]*?)<\\/${innerTag}>`,'i'))
    if (n) names.push(xmlText(n[1]))
  }
  return [...new Set(names.filter(Boolean))].join('; ')
}

function docId(block, type='docdb') {
  const re = new RegExp(`<document-id[^>]*document-id-type=["']${type}["'][^>]*>([\\s\\S]*?)<\\/document-id>`, 'i')
  const b = block.match(re)?.[1] || ''
  const country = first(b,'country')
  const num = first(b,'doc-number')
  const kind = first(b,'kind')
  const date = first(b,'date')
  return { number:`${country}${num}${kind}`.trim(), date }
}

function parseSearch(xml) {
  const total = Number(xml.match(/total-result-count=["'](\d+)["']/i)?.[1] || 0)
  const blocks = [...xml.matchAll(/<exchange-document\b[\s\S]*?<\/exchange-document>/gi)].map(m => m[0])
  const records = blocks.map(b => {
    const pub = docId(b,'docdb')
    const app = (b.match(/<application-reference[\s\S]*?<\/application-reference>/i)?.[0]) || ''
    const pri = [...b.matchAll(/<priority-claim[\s\S]*?<\/priority-claim>/gi)].map(m => docId(m[0],'docdb').number).filter(Boolean)
    return {
      publication_number: pub.number,
      application_number: docId(app,'docdb').number,
      priority_numbers: pri.join('; '),
      title: first(b,'invention-title','en') || first(b,'invention-title'),
      abstract: first(b,'abstract','en') || first(b,'abstract'),
      applicants: allNames(b,'applicant-name'),
      inventors: allNames(b,'inventor-name'),
      filing_date: docId(app,'docdb').date,
      publication_date: pub.date,
      source:'EPO OPS'
    }
  }).filter(r => r.publication_number)
  return { total, records }
}

export async function searchOps(args) {
  if (!args.query) throw new Error('search_ops requires EPO OPS CQL query')
  const accessToken = await token(args.signal)
  const requested = Math.min(Math.max(Number(args.limit || 100),1),2000)
  const records=[]
  let total=0
  for (let start=1; start<=requested; start+=100) {
    const end=Math.min(start+99, requested)
    const url=`${SEARCH_URL}?q=${encodeURIComponent(args.query)}`
    const r=await fetch(url,{signal:args.signal,headers:{Authorization:`Bearer ${accessToken}`,'Accept':'application/exchange+xml','X-OPS-Range':`${start}-${end}`}})
    if (!r.ok) throw new Error(`EPO OPS search failed: ${r.status} ${await r.text()}`)
    const parsed=parseSearch(await r.text())
    total=parsed.total
    records.push(...parsed.records)
    if (end>=total || records.length>=requested) break
    if (total>2000 && requested>=2000) break
  }
  const stored=await insertNormalizedRecords(args.workspace, records, 'EPO OPS')
  return {
    ok:true, query:cleanText(args.query), total_hits:total, fetched:records.length, stored_total:stored,
    truncated: total>records.length,
    note: total>2000 ? 'OPS bibliographic search exposes at most 2,000 hits per query; partition by date/technology/jurisdiction for exhaustive retrieval.' : ''
  }
}
