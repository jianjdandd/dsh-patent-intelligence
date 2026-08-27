import assert from 'node:assert/strict'
import { TARGET_JURISDICTIONS,listConnectors,jurisdictionQuery } from '../src/connectors.js'
import { parseOpsBiblioXml } from '../src/ops.js'
import { VERSION } from '../src/version.js'

assert.equal(VERSION,'0.0.2.0')
assert.deepEqual(TARGET_JURISDICTIONS,['CN','US','EP','WO','JP','KR','GB','FR','DE','IN'])
assert.equal(listConnectors().length,10)
assert.equal(jurisdictionQuery('ta=resveratrol','CN'),'(ta=resveratrol) AND pn=CN')

const xml=`<?xml version="1.0" encoding="UTF-8"?>
<ops:world-patent-data xmlns:ops="http://ops.epo.org">
  <ops:biblio-search total-result-count="1">
    <exchange-documents>
      <exchange-document>
        <bibliographic-data>
          <publication-reference><document-id document-id-type="docdb"><country>CN</country><doc-number>123456789</doc-number><kind>A</kind><date>20260101</date></document-id></publication-reference>
          <application-reference><document-id document-id-type="docdb"><country>CN</country><doc-number>202410000001</doc-number><kind>A</kind><date>20240115</date></document-id></application-reference>
          <priority-claims><priority-claim><document-id document-id-type="docdb"><country>CN</country><doc-number>202310000001</doc-number><kind>A</kind><date>20230110</date></document-id></priority-claim></priority-claims>
          <invention-title lang="en">Resveratrol biosynthesis</invention-title>
          <abstract lang="en">Microbial production of resveratrol.</abstract>
          <applicants><applicant><applicant-name><name>Applicant One</name></applicant-name></applicant><applicant><applicant-name><name>Applicant Two</name></applicant-name></applicant></applicants>
          <inventors><inventor><inventor-name><name>Inventor One</name></inventor-name></inventor><inventor><inventor-name><name>Inventor Two</name></inventor-name></inventor></inventors>
          <classifications-ipcr><classification-ipcr><text>A61K31/00</text></classification-ipcr></classifications-ipcr>
          <patent-classifications><patent-classification><classification-scheme scheme="CPCI"/><classification-cpc><text>C12P7/00</text></classification-cpc></patent-classification></patent-classifications>
        </bibliographic-data>
      </exchange-document>
    </exchange-documents>
  </ops:biblio-search>
</ops:world-patent-data>`

const parsed=parseOpsBiblioXml(xml)
assert.equal(parsed.total,1)
assert.equal(parsed.records.length,1)
const r=parsed.records[0]
assert.equal(r.publication_number,'CN123456789A')
assert.equal(r.application_number,'CN202410000001A')
assert.equal(r.priority_numbers,'CN202310000001A')
assert.equal(r.priority_date,'20230110')
assert.equal(r.title,'Resveratrol biosynthesis')
assert.equal(r.applicants,'Applicant One; Applicant Two')
assert.equal(r.inventors,'Inventor One; Inventor Two')
assert.equal(r.ipc,'A61K31/00')
assert.equal(r.cpc,'C12P7/00')
console.log('smoke ok:',VERSION,r.publication_number,r.applicants,r.inventors)
