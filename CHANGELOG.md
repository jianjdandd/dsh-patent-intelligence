# Changelog

## 0.0.3.2 - 2026-08-27
- Expanded the per-patent model with a compact `patent_details` table plus structured JSON modules instead of hundreds of sparse core columns.
- Added `details` action for enriched per-patent retrieval.
- USPTO ODP enrichment now fetches application data plus assignment, continuity, foreign-priority, transactions, attorney and patent-term-adjustment endpoints.
- USPTO ownership transfers, parent/child continuity, foreign priorities and prosecution transactions are normalized separately.
- KIPRIS Plus enrichment now attempts bibliography, applicant/inventor, IPC/CPC, priority, family, legal status, agent, international/designated-state, prior-art, claims, R&D, transfer and last-transfer metadata operations.
- KIPRIS family, legal events and right-holder/transfer data are stored as independent structured modules.
- Added `right_holders`, `agents`, `examiners`, `art_unit`, `entity_status`, `status_date`, `application_type`, `pta_days`, `family_members` and event-count summary fields in `patent_details`.
- Excel/JSON reports now include detailed enrichment and raw source-evidence datasets.

## 0.0.3.0 - 2026-08-27
- Added DOCDB primary-data + official-source verification/supplement pipeline.
- Added USPTO ODP, KIPRIS Plus and INPI official adapters and section-level provenance.

## 0.0.2.0 - 2026-08-27
- Added online country entrances for CN/US/EP/WO/JP/KR/GB/FR/DE/IN using EPO OPS/DOCDB.

## 0.1.1.1 - 2026-08-27
- Fixed CI workflow cache configuration.

## 0.1.1.0 - 2026-08-27
- Initial MVP.
