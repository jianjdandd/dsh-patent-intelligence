# Changelog

## 0.1.1.1 - 2026-08-27

- Fix GitHub Actions smoke workflow: remove npm cache configuration that required a missing lockfile.
- No runtime/API/schema change from 0.1.1.0.

## 0.1.1.0 - 2026-08-27

- Initial lightweight DeepSeek Harness bundle.
- Single `patent_intel` tool with action router.
- CN/US/EP/WO/JP/KR/GB/DE/FR/CA/AU/IN target-jurisdiction model.
- Search strategy/query pack for IncoPat, DWPI/Derwent, EPO OPS, WIPO PATENTSCOPE, USPTO Patent Public Search and Google Patents, plus national-office templates.
- CSV/XLSX/JSON import and canonical SQLite schema.
- Heuristic family merge, technical classification and core-patent scoring.
- LLM workset/annotation loop for technical-route extraction.
- SQLite/JSON/Markdown/Excel/HTML reporting.
- Optional EPO OPS bibliographic retrieval.
