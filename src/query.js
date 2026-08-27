import { DEFAULT_JURISDICTIONS,cleanText,quoteTerm,unique } from './utils.js'
import { VERSION } from './version.js'

function conceptBlocks(concepts=[]){return concepts.map(c=>({name:cleanText(c.name||'concept'),terms:unique((c.terms||[]).map(cleanText))})).filter(c=>c.terms.length)}
function boolExpr(blocks,fieldFn){return blocks.map(block=>`(${block.terms.map(fieldFn).join(' OR ')})`).join(' AND ')}
function fieldless(blocks){return boolExpr(blocks,t=>quoteTerm(t))}
function incopat(blocks){return blocks.map(b=>`TIABC=(${b.terms.map(quoteTerm).join(' OR ')})`).join(' AND ')}
function isCjk(t){return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(t)}
function latinBlocks(blocks){return blocks.map(b=>({...b,terms:b.terms.filter(t=>!isCjk(t))})).filter(b=>b.terms.length)}
function dwpi(blocks,jurisdictions=[]){const b=latinBlocks(blocks),core=`TS=(${fieldless(b.length?b:blocks)})`;return jurisdictions.length?`${core} AND CC=(${jurisdictions.join(' OR ')})`:core}
function epo(blocks){const b=latinBlocks(blocks);return boolExpr(b.length?b:blocks,t=>`ta=${quoteTerm(t)}`)}
function wipoField(t){if(/[\uac00-\ud7af]/u.test(t))return'KO_ALLTXT';if(/[\u3040-\u30ff]/u.test(t))return'JA_ALLTXT';if(/[\u3400-\u9fff]/u.test(t))return'ZH_ALLTXT';return'EN_ALLTXT'}
function wipo(blocks,jurisdictions=[]){const core=blocks.map(b=>`(${b.terms.map(t=>`${wipoField(t)}:${quoteTerm(t)}`).join(' OR ')})`).join(' AND ');return jurisdictions.length?`${core} AND OF:(${jurisdictions.join(' OR ')})`:core}
function uspto(blocks){const b=latinBlocks(blocks),use=b.length?b:blocks;return use.map(x=>`(${x.terms.map(t=>`(${quoteTerm(t)}.TI. OR ${quoteTerm(t)}.AB. OR ${quoteTerm(t)}.CLM.)`).join(' OR ')})`).join(' AND ')}
function google(blocks){return fieldless(blocks)}
function jurisdictionFilter(js){return js.map(j=>j.toUpperCase()).filter(Boolean)}
export function buildStrategy(args){
  const blocks=conceptBlocks(args.concepts);if(!blocks.length)throw new Error('strategy requires concepts[]')
  const jurisdictions=jurisdictionFilter(args.jurisdictions?.length?args.jurisdictions:DEFAULT_JURISDICTIONS)
  const canonical=fieldless(blocks)
  return {ok:true,version:VERSION,topic:args.topic||blocks.map(b=>b.name).join(' + '),jurisdictions,databases:args.databases?.length?args.databases:['IncoPat','DWPI/Derwent','EPO OPS/Espacenet','WIPO PATENTSCOPE','USPTO Patent Public Search','CNIPA','J-PlatPat','KIPRIS','Google Patents'],strategy:{concept_blocks:blocks,canonical_boolean:canonical,recommended_sequence:['broad title/abstract search','expand synonyms from high-relevance families','add IPC/CPC and applicant/inventor constraints','run action=search_online for target jurisdictions','normalize, merge families, classify technology, extract routes, score core patents'],note:'Online bibliographic retrieval uses EPO OPS/DOCDB as the common worldwide backbone. Commercial and national-office queries remain available for validation and deeper source-specific fields.'},queries:{incopat:incopat(blocks),dwpi_derwent_topic:dwpi(blocks,jurisdictions),epo_ops_cql:epo(blocks),wipo_patentscope:wipo(blocks,jurisdictions),uspto_ppubs:uspto(blocks),google_patents:google(blocks)},source_templates:{cnipa:canonical,jplatpat:canonical,kipris:canonical,ukipo:canonical,dpma_de:canonical,inpi_fr:canonical,ipindia:canonical}}
}
