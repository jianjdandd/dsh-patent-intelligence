# Changelog

## 0.0.3.0 - 2026-08-27
- Upgraded the online architecture from DOCDB-only retrieval to `DOCDB master -> jurisdiction official verification/supplement`.
- Added direct official adapters for USPTO Open Data Portal (US), KIPRIS Plus (KR) and INPI API PI Brevets (FR); EP is treated as primary-official because the backbone is EPO OPS/DOCDB.
- Added explicit capability states for WIPO/PCT conditional webservice access and official portals without a stable public unattended patent REST API.
- Added `official_sources` and `verify_official` actions.
- Existing `search_online`, `fetch_biblio` and jurisdiction shortcuts now run the two-stage pipeline by default; set `official_enrich=false` to disable the second pass.
- Added field-level verification/provenance columns and a `patent_sources` evidence table preserving DOCDB and official raw snapshots.
- Added verification statuses: verified, verified_and_supplemented, conflict_reviewed, credentials_missing, subscription_required, official_api_unavailable and official_fetch_failed.
- Added parser and storage tests for USPTO, KIPRIS and field-level official supplementation.

## 0.0.2.0 - 2026-08-27
- Added automatic online bibliographic retrieval for CN, US, EP, WO/PCT, JP, KR, GB, FR, DE and IN using EPO OPS/DOCDB.
- Added `search_online`, `search_country` and jurisdiction shortcuts.
- Added `fetch_biblio` and strengthened applicant/inventor/priority/IPC/CPC extraction.
- Added token caching, retries, record samples and bibliographic parser tests.

## 0.1.1.1 - 2026-08-27
- Fixed CI workflow cache configuration.

## 0.1.1.0 - 2026-08-27
- Initial MVP.
