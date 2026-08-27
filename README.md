# dsh-patent-intelligence

Lightweight DeepSeek Harness plugin for professional global patent search and analysis.

Internal version: **0.0.2.0** (`package.json` uses npm-compatible `0.0.2`).

## Online patent entrances

Built-in online entrances:

- China: `search_cn` (CN)
- United States: `search_us` (US)
- Europe/EPO: `search_ep` (EP)
- WIPO/PCT: `search_wo` (WO)
- Japan: `search_jp` (JP)
- Korea: `search_kr` (KR)
- United Kingdom: `search_gb` (GB)
- France: `search_fr` (FR)
- Germany: `search_de` (DE)
- India: `search_in` (IN)
- Generic ST.3 office: `search_country`
- Multiple offices: `search_online`
- Known publication numbers: `fetch_biblio`

The common online backbone is **EPO OPS/DOCDB**. Once EPO OPS credentials are configured, these entrances retrieve and store bibliographic data automatically without requiring manual Excel export.

## Bibliographic fields

When supplied by DOCDB/OPS the connector captures:

- publication number
- application number
- priority number(s)
- earliest priority date
- title
- abstract
- applicant / assignee / patent applicant names
- inventor names
- IPC
- CPC
- filing date
- publication date
- family id when present
- source and retrieval timestamp in the raw record

Records are normalized into `patents.sqlite`; the original normalized source record is retained through `raw_json`.

## Credentials

Configure once in the DeepSeek Harness runtime environment:

```bash
EPO_OPS_KEY=...
EPO_OPS_SECRET=...
```

OPS uses OAuth. The plugin caches and reuses the access token, and `search_online` reuses one token across all selected jurisdictions.

## Examples

Multi-jurisdiction search:

```json
{
  "action":"search_online",
  "query":"ta=(resveratrol) AND ta=(ferment* OR biosynth*)",
  "jurisdictions":["CN","US","EP","WO","JP","KR","GB","FR","DE","IN"],
  "limit":500
}
```

China only:

```json
{
  "action":"search_cn",
  "query":"ta=(resveratrol) AND ta=(biosynth*)",
  "limit":100,
  "return_records":true
}
```

Any ST.3 authority:

```json
{
  "action":"search_country",
  "jurisdiction":"CA",
  "query":"ta=(resveratrol)",
  "limit":100
}
```

Known publications:

```json
{
  "action":"fetch_biblio",
  "publication_numbers":["CN123456789A","US12345678B2","EP1234567A1","WO2026123456A1"]
}
```

## Source policy

The ten fixed country entrances use EPO OPS/DOCDB as the stable common online source. This keeps the plugin small while providing one normalized data contract across jurisdictions. Source-specific connectors (for example KIPRIS Plus or USPTO-specific services) can later override/enrich DOCDB without changing the DSH tool surface or SQLite schema.

Large OPS searches are limited by the service retrieval window; partition large result sets by date, CPC/IPC, applicant or technology block for exhaustive projects.

## Commercial databases

IncoPat and Derwent/DWPI remain license-dependent. The plugin continues to generate search strategies and import user-authorized XLSX/CSV exports for enrichment and cross-checking.

## Architecture

One model-visible tool (`patent_intel`) + action router + dynamic imports. Connectors load only when called, minimizing DeepSeek Harness startup/context overhead.

## Versioning

Project convention: `MAJOR.MINOR.FEATURE.REVISION`. Current release line: `0.0.2.*`; first release: **0.0.2.0**.
