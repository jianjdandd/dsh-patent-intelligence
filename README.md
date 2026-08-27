# dsh-patent-intelligence

Lightweight DeepSeek Harness plugin for professional global patent search and analysis.

Internal version: **0.2.0.0**.

## Online coverage

The plugin can automatically retrieve bibliographic patent data for **CN, US, EP, WO/PCT, JP, KR, GB, FR, DE and IN**. The common online backbone is EPO OPS/DOCDB, whose worldwide bibliographic data covers 100+ patent authorities. Returned/stored fields include publication number, application number, priorities, title, abstract, applicants, inventors, IPC/CPC and key dates when available.

This design gives every target jurisdiction an online path immediately while keeping the DSH plugin small. Source-specific official connectors can be added later without changing the unified patent schema. For WIPO PATENTSCOPE, full programmatic webservice access is licensed/conditional; for KIPRIS Plus, the dedicated API can be added when an API key is configured.

## Main workflow

`natural-language question -> strategy -> online search / commercial export import -> normalization -> family merge -> technical classification -> route extraction -> core patent scoring -> SQLite/JSON/Markdown/Excel/HTML`

## Online actions

- `connectors`: list online jurisdiction coverage and source.
- `search_online`: search several jurisdictions in one call using an EPO OPS CQL base query.
- `search_cn`, `search_us`, `search_ep`, `search_wo`, `search_jp`, `search_kr`, `search_gb`, `search_fr`, `search_de`, `search_in`: jurisdiction shortcuts.
- `fetch_biblio`: retrieve bibliographic records for known publication numbers.
- `search_ops`: direct EPO OPS query for advanced users.

Example:

```json
{
  "action":"search_online",
  "query":"ta=(resveratrol) AND ta=(ferment* OR biosynth*)",
  "jurisdictions":["CN","US","EP","WO","JP","KR"],
  "limit":600
}
```

## Credentials

Set EPO OPS credentials in the runtime environment:

```bash
EPO_OPS_KEY=...
EPO_OPS_SECRET=...
```

OPS uses OAuth and is the same EPO data family behind Espacenet/European Patent Register. Large searches must be partitioned because one OPS bibliographic query exposes at most 2,000 hits.

## Commercial databases

IncoPat and Derwent/DWPI access remains license-dependent. The plugin generates queries and imports authorized XLSX/CSV exports; licensed APIs can be added as optional connectors.

## Architecture

One model-visible tool (`patent_intel`) + action router + dynamic imports. No connector is loaded until called, minimizing DeepSeek Harness startup/context overhead.

## Versioning

`MAJOR.MINOR.FEATURE.REVISION`; current `0.2.0.0`.
