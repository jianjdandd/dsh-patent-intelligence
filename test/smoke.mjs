import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TARGET_JURISDICTIONS,listConnectors,jurisdictionQuery } from '../src/connectors.js'
import { parseOpsBiblioXml } from '../src/ops.js'
import { OFFICIAL_SOURCES,listOfficialSources,parseKiprisXml,parseUsptoJson } from '../src/official.js'
import { insertNormalizedRecords } from '../src/store.js'
import { loadPatentRecords,mergeOfficialRecord } from '../src/verification-store.js'
import { VERSION } from '../src/version.js'

assert.equal(VERSION,'0.0.3.0')
assert.deepEqual(TARGET_JURISDICTIONS,['CN','US','EP','WO','JP','KR','GB','FR','DE','IN'])
assert.equal(listConnectors().length,10)
assert.equal(jurisdictionQuery('ta=resveratrol','CN'),'(ta=resveratrol) AND pn=CN')
assert.equal(OFFICIAL_SOURCES.US.automated,true)
assert.equal(OFFICIAL_SOURCES.KR.automated,true)
assert.equal(OFFICIAL_SOURCES.FR.automated,true)
assert.equal(OFFICIAL_SOURCES.WO.automated,false)
assert.equal(listOfficialSources().length,10)

const xml=`<?xml version="1.0" encoding="UTF-8"?>
<ops:world-patent-data xmlns:ops="http://ops.epo.org"><ops:biblio-search total-result-count="1"><exchange-documents><exchange-document><bibliographic-data>
<publication-reference><document-id document-id-type="docdb"><country>CN</country><doc-number>123456789</doc-number><kind>A</kind><date>20260101</date></document-id></publication-reference>
<application-reference><document-id document-id-type="docdb"><country>CN</country><doc-number>202410000001</doc-number><kind>A</kind><date>20240115</date></document-id></application-reference>
<priority-claims><priority-claim><document-id document-id-type="docdb"><country>CN</country><doc-number>202310000001</doc-number><kind>A</kind><date>20230110</date></document-id></priority-claim></priority-claims>
<invention-title lang="en">Resveratrol biosynthesis</invention-title><abstract lang="en">Microbial production of resveratrol.</abstract>
<applicants><applicant><applicant-name><name>Applicant One</name></applicant-name></applicant><applicant><applicant-name><name>Applicant Two</name></applicant-name></applicant></applicants>
<inventors><inventor><inventor-name><name>Inventor One</name></inventor-name></inventor><inventor><inventor-name><name>Inventor Two</name></inventor-name></inventor></inventors>
<classifications-ipcr><classification-ipcr><text>A61K31/00</text></classification-ipcr></classifications-ipcr><classification-cpc><text>C12P7/00</text></classification-cpc>
</bibliographic-data></exchange-document></exchange-documents></ops:biblio-search></ops:world-patent-data>`
const parsed=parseOpsBiblioXml(xml),r=parsed.records[0]
assert.equal(r.publication_number,'CN123456789A')
assert.equal(r.applicants,'Applicant One; Applicant Two')
assert.equal(r.inventors,'Inventor One; Inventor Two')
assert.equal(r.ipc,'A61K31/00')
assert.equal(r.cpc,'C12P7/00')

const us=parseUsptoJson({applicationNumberText:'16123456',applicationMetaData:{earliestPublicationNumber:'20240123456A1',filingDate:'2020-01-15',inventionTitle:'Example invention',applicationStatusDescriptionText:'Patented Case',grantDate:'2024-01-02'},inventorBag:[{inventorNameText:'Jane Doe'}],applicantBag:[{applicantNameText:'Example Corp'}],foreignPriorityBag:[{priorityApplicationNumber:'CN202010000001'}]})
assert.equal(us.publication_number,'US20240123456A1')
assert.equal(us.application_number,'US16123456')
assert.equal(us.applicants,'Example Corp')
assert.equal(us.inventors,'Jane Doe')
assert.equal(us.legal_status,'Patented Case')

const kr=parseKiprisXml(`<root><applicationNumber>1020230012345</applicationNumber><publicationNumber>1020240099999</publicationNumber><inventionTitle>발명</inventionTitle><applicantName>회사</applicantName><inventorName>홍길동</inventorName><ipcNumber>C12P7/00</ipcNumber><legalStatus>등록</legalStatus></root>`)
assert.equal(kr.application_number,'KR1020230012345')
assert.equal(kr.publication_number,'KR1020240099999')
assert.equal(kr.applicants,'회사')
assert.equal(kr.inventors,'홍길동')

const dir=await mkdtemp(join(tmpdir(),'dsh-patent-'))
try{
  const base={publication_number:'US20240123456A1',application_number:'US16123456',title:'Example invention',applicants:'Example Corp',inventors:'',ipc:'',cpc:'',source:'EPO OPS/DOCDB'}
  await insertNormalizedRecords(dir,[base],'EPO OPS/DOCDB')
  const merged=mergeOfficialRecord(dir,base,{...us,ipc:'C12P7/00'},'USPTO Open Data Portal')
  assert.equal(merged.ok,true)
  assert.ok(['verified_and_supplemented','conflict_reviewed'].includes(merged.status))
  const stored=loadPatentRecords(dir,{publication_numbers:['US20240123456A1']})[0]
  assert.equal(stored.official_verified,1)
  assert.equal(stored.official_source,'USPTO Open Data Portal')
  assert.equal(stored.inventors,'Jane Doe')
  assert.equal(stored.ipc,'C12P7/00')
  assert.ok(stored.verification_json.includes('inventors'))
}finally{await rm(dir,{recursive:true,force:true})}

console.log('smoke ok:',VERSION,r.publication_number,us.publication_number,kr.publication_number)
