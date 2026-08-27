# dsh-patent-intelligence

Lightweight DeepSeek Harness plugin for global patent search and patent intelligence.

Internal version: **0.0.3.2**.

## Architecture

One model-visible tool (`patent_intel`) + action router + dynamic imports.

Data pipeline:

`natural-language request -> query strategy -> DOCDB worldwide bibliographic retrieval -> issuing-office / national official-source enrichment -> field-level merge + provenance -> SQLite -> analysis/report`

Online DOCDB coverage includes CN, US, EP, WO/PCT, JP, KR, GB, FR, DE and IN. Official second-stage adapters currently include USPTO ODP (US), KIPRIS Plus (KR), INPI (FR), with EPO OPS itself serving as the official EP source. Other jurisdictions are explicitly marked when no stable unattended public API is available.

## Per-patent structure

Core `patents` rows retain the canonical searchable fields: publication/application/priority/family identifiers, title, abstract, applicant, inventor, IPC/CPC, dates, legal status, source, technical classification and core score.

`patent_details` stores systematic enrichment without turning the core table into hundreds of sparse columns:

- `parties`: applicants, inventors, agents/attorneys, examiners, current/right holders
- `priority`: foreign/national priority claims and dates
- `family`: family IDs and related application/publication members
- `legal`: current status and structured legal events
- `assignments`: ownership-transfer history
- `continuity`: parent/child continuation, CIP, divisional and provisional relations
- `transactions`: prosecution transaction history
- `prosecution`: application type, entity status, art unit, examiner, patent-term adjustment, claims/R&D metadata when supplied
- `international`: PCT/international filing/publication/designated states
- `citations`: prior-art documents

Summary columns in `patent_details` include `right_holders`, `agents`, `examiners`, `art_unit`, `entity_status`, `status_date`, `application_type`, `pta_days`, `family_members`, and event counts. Full structured modules remain in `structured_json`; section-level provenance is in `source_map_json`.

Raw evidence from DOCDB and each official source is retained in `patent_sources`.

## USPTO enrichment

For a US application, the plugin retrieves the main Patent File Wrapper record plus:

- `/assignment`
- `/continuity`
- `/foreign-priority`
- `/transactions`
- `/attorney`
- `/adjustment`

These are normalized into ownership, continuity, priority, prosecution and transaction modules instead of being collapsed into one status string.

## KIPRIS Plus enrichment

For a Korean application, the plugin attempts metadata REST operations including bibliography, applicant, inventor, IPC/CPC, priority, family, legal status, agent, international information, designated states, prior-art documents, claims, R&D metadata, transfer information and last-transfer date. Family, legal-status history and right-holder/transfer information are preserved separately.

## Main actions

- `strategy`: build multilingual/database-specific patent queries
- `search_online`: DOCDB search + official enrichment for several jurisdictions
- `search_cn/us/ep/wo/jp/kr/gb/fr/de/in`: country shortcuts
- `search_country`: arbitrary two-letter ST.3 authority filter
- `fetch_biblio`: fetch known publication numbers then enrich
- `verify_official`: rerun official-source verification/enrichment on stored records
- `details`: return enriched per-patent structure
- `official_sources`: show official adapter availability/configuration
- `import`: import XLSX/CSV/JSON exports from IncoPat, Derwent or other databases
- `workset` / `annotate` / `analyze` / `report` / `status`: downstream research workflow

## Credentials

```bash
EPO_OPS_KEY=...
EPO_OPS_SECRET=...
USPTO_ODP_API_KEY=...
KIPRIS_SERVICE_KEY=...
INPI_XSRF_TOKEN=...
INPI_ACCESS_TOKEN=...
INPI_SESSION_TOKEN=...
```

Credentials are optional per official source. Without a national-office credential, DOCDB retrieval still works and the official verification status is recorded explicitly.

## Reports

Report output supports SQLite, JSON, Markdown, HTML and Excel. Excel includes `Patents`, `PatentDetails`, `Sources`, `Families` and `Summary` sheets when enrichment data is present.

## Versioning

Project convention: `MAJOR.MINOR.FEATURE.REVISION`; current version **0.0.3.2**. npm package version uses the three-part compatible form `0.0.3`.
