import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TARGET_JURISDICTIONS,listConnectors,jurisdictionQuery } from '../src/connectors.js'
import { parseOpsBiblioXml } from '../src/ops.js'
import { OFFICIAL_SOURCES,listOfficialSources,parseKiprisXml,parseUsptoJson } from '../src/official.js'
import { insertNormalizedRecords } from '../src/store.js'
import { loadDetailedRecords,mergeOfficialRecord } from '../src/verification-store.js'
import { VERSION } from '../src/version.js'

assert.equal(VERSION,'0.0.3.2')
assert.deepEqual(TARGET_JURISDICTIONS,['CN','US','EP','WO','JP','KR','GB','FR','DE','IN'])
assert.equal(listConnectors().length,10)
assert.equal(jurisdictionQuery('ta=resveratrol','CN'),'(ta=resveratrol) AND pn=CN')
assert.equal(OFFICIAL_SOURCES.US.automated,true)
assert.equal(OFFICIAL_SOURCES.KR.automated,true)
assert.equal(listOfficialSources().length,10)

const opsXml=`<ops:biblio-search total-result-count="1"><exchange-document><bibliographic-data><publication-reference><document-id document-id-type="docdb"><country>CN</country><doc-number>123456789</doc-number><kind>A</kind><date>20260101</date></document-id></publication-reference><application-reference><document-id document-id-type="docdb"><country>CN</country><doc-number>202410000001</doc-number><kind>A</kind><date>20240115</date></document-id></application-reference><invention-title lang="en">Resveratrol biosynthesis</invention-title><applicants><applicant><applicant-name><name>Applicant One</name></applicant-name></applicant></applicants><inventors><inventor><inventor-name><name>Inventor One</name></inventor-name></inventor></inventors></bibliographic-data></exchange-document></ops:biblio-search>`
const ops=parseOpsBiblioXml(opsXml).records[0]
assert.equal(ops.publication_number,'CN123456789A')
assert.equal(ops.applicants,'Applicant One')

const us=parseUsptoJson({applicationNumberText:'16123456',applicationMetaData:{earliestPublicationNumber:'20240123456A1',filingDate:'2020-01-15',inventionTitle:'Example invention',applicationStatusDescriptionText:'Patented Case',applicationStatusDate:'2024-01-02',applicationTypeCode:'UTL',businessEntityStatusCategory:'SMALL',groupArtUnitNumber:'1791',examinerNameText:'Examiner A',grantDate:'2024-01-02'},inventorBag:[{inventorNameText:'Jane Doe'}],applicantBag:[{applicantNameText:'Example Corp'}]},
  {assignment:{patentFileWrapperDataBag:[{assignmentBag:[{assignmentRecordedDate:'2023-01-01',conveyanceText:'ASSIGNMENT',assignorBag:[{assignorName:'Founder'}],assigneeBag:[{assigneeNameText:'Current Owner Inc.'}]}]}]},continuity:{patentFileWrapperDataBag:[{parentContinuityBag:[{parentApplicationNumberText:'15111111',claimParentageTypeCode:'CON',claimParentageTypeCodeDescriptionText:'is a Continuation of'}],childContinuityBag:[{childApplicationNumberText:'17111111',claimParentageTypeCode:'DIV'}]}]},foreign_priority:{patentFileWrapperDataBag:[{foreignPriorityBag:[{foreignApplicationNumberText:'CN202010000001',foreignFilingDate:'2020-01-01',foreignCountryCode:'CN'}]}]},transactions:{patentFileWrapperDataBag:[{eventDataBag:[{eventCode:'NOA',eventDate:'2023-10-01',eventDescriptionText:'Notice of Allowance'}]}]},attorney:{attorneyBag:[{attorneyNameText:'Agent A'}]},adjustment:{adjustmentTotalQuantity:42}})
assert.equal(us.publication_number,'US20240123456A1')
assert.equal(us.application_number,'US16123456')
assert.equal(us.structured.assignments[0].assignees[0],'Current Owner Inc.')
assert.equal(us.structured.continuity.parents[0].application_number,'15111111')
assert.equal(us.structured.priority.foreign[0].application_number,'CN202010000001')
assert.equal(us.structured.transactions[0].code,'NOA')
assert.equal(us.structured.prosecution.pta_days,42)
assert.equal(us.structured.parties.right_holders[0],'Current Owner Inc.')

const kr=parseKiprisXml({
  getBibliographyDetailInfoSearch:'<root><applicationNumber>1020230012345</applicationNumber><publicationNumber>1020240099999</publicationNumber><inventionTitle>발명</inventionTitle><applicantName>회사</applicantName><inventorName>홍길동</inventorName><ipcNumber>C12P7/00</ipcNumber></root>',
  patentFamilyInfo:'<root><familyId>F123</familyId><familyApplicationNumber>US16123456</familyApplicationNumber><familyPublicationNumber>US20240123456A1</familyPublicationNumber></root>',
  patentLegalStatusInfo:'<root><legalStatus>등록</legalStatus><eventDescription>등록결정</eventDescription><eventCode>REG</eventCode><eventDate>20240102</eventDate></root>',
  patentTransferInfo:'<root><rightHolderName>현재권리자</rightHolderName><transferDate>20240201</transferDate></root>',
  lastTransferDateInfo:'<root><lastTransferDate>20240201</lastTransferDate></root>',
  patentAgentInfo:'<root><agentName>대리인</agentName></root>',
  patentPriorArtDocumentsInfo:'<root><priorArtDocumentNumber>WO2020000001</priorArtDocumentNumber></root>'
})
assert.equal(kr.application_number,'KR1020230012345')
assert.equal(kr.family_id,'F123')
assert.equal(kr.structured.parties.right_holders[0],'현재권리자')
assert.equal(kr.structured.family.members[0],'US16123456')
assert.equal(kr.structured.legal.events[0].description,'등록결정')
assert.equal(kr.structured.citations.prior_art_documents[0],'WO2020000001')

const dir=await mkdtemp(join(tmpdir(),'dsh-patent-'))
try{
  const base={publication_number:'US20240123456A1',application_number:'US16123456',title:'Example invention',applicants:'Example Corp',inventors:'',source:'EPO OPS/DOCDB'}
  await insertNormalizedRecords(dir,[base],'EPO OPS/DOCDB')
  const merged=mergeOfficialRecord(dir,base,{...us,ipc:'C12P7/00'},'USPTO Open Data Portal')
  assert.equal(merged.ok,true)
  const stored=loadDetailedRecords(dir,{publication_numbers:['US20240123456A1']})[0]
  assert.equal(stored.official_verified,1)
  assert.equal(stored.right_holders,'Current Owner Inc.')
  assert.equal(stored.agents,'Agent A')
  assert.equal(stored.art_unit,'1791')
  assert.equal(stored.entity_status,'SMALL')
  assert.equal(stored.pta_days,42)
  assert.equal(stored.assignment_count,1)
  assert.equal(stored.transaction_count,1)
  assert.equal(stored.structured.continuity.parents[0].application_number,'15111111')
  assert.equal(stored.source_map.assignments,'USPTO Open Data Portal')
}finally{await rm(dir,{recursive:true,force:true})}

console.log('smoke ok:',VERSION,us.publication_number,kr.publication_number)
