# Changelog

## 0.0.2.0 - 2026-08-27
- Reset the active user-requested release line to `0.0.2.*`; npm package version is `0.0.2` and internal version is `0.0.2.0`.
- Added/retained fixed online entrances for CN, US, EP, WO/PCT, JP, KR, GB, FR, DE and IN.
- Added generic `search_country` for any two-letter WIPO ST.3 authority supported by the DOCDB search corpus.
- `search_online` now reuses a single EPO OPS OAuth token across jurisdictions.
- Added token caching and retry/backoff for temporary OPS 429/503/504 responses.
- Hardened namespaced OPS XML parsing for publication/application/priority identifiers, applicants, inventors, IPC/CPC and dates.
- `search_ops` and country searches now return bibliographic field metadata and a small record sample; `return_records=true` returns all fetched records in addition to SQLite storage.
- `fetch_biblio` accepts publication numbers with omitted kind codes and attempts DOCDB wildcard retrieval.
- Added deterministic CI smoke assertions for applicant, inventor, priority, IPC and CPC extraction.

## 0.2.0.0 - 2026-08-27
- Interim multi-jurisdiction connector build, superseded by the user-requested `0.0.2.*` release line.

## 0.1.1.1 - 2026-08-27
- Fixed CI workflow cache configuration.

## 0.1.1.0 - 2026-08-27
- Initial MVP.
