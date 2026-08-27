# dsh-patent-intelligence

Lightweight DeepSeek Harness plugin for professional global patent intelligence.

Internal version: **0.0.3.0** (`package.json` SemVer: `0.0.3`).

## Architecture: DOCDB master + official verification

The default online pipeline is now:

`search -> EPO OPS/DOCDB worldwide master data -> jurisdiction official verification/supplement -> field-level provenance -> SQLite -> analysis/report`

DOCDB remains the common backbone for CN, US, EP, WO/PCT, JP, KR, GB, FR, DE and IN. After each `search_online` or jurisdiction shortcut, the plugin automatically tries the official source for that jurisdiction unless `official_enrich=false`.

### Official second-pass sources

| Jurisdiction | Official source | Automation in 0.0.3.0 | Credential |
|---|---|---|---|
| US | USPTO Open Data Portal / Patent File Wrapper | Yes | `USPTO_ODP_API_KEY` |
| KR | KIPRIS Plus Patent-Utility Model Publications | Yes | `KIPRIS_SERVICE_KEY` |
| FR | INPI API PI Brevets | Yes | `INPI_XSRF_TOKEN`, `INPI_ACCESS_TOKEN`, `INPI_SESSION_TOKEN` |
| EP | EPO OPS/DOCDB | Yes; DOCDB is already the issuing-office source | EPO OPS credentials |
| WO/PCT | WIPO PATENTSCOPE Webservice | Conditional/fee-based; reported explicitly when not configured | WIPO subscription |
| CN | CNIPA official search/data-resource platforms | Official portal; no stable public unattended per-record REST API documented | — |
| JP | JPO / J-PlatPat | Official portal; no general public per-record REST API documented | — |
| GB | UKIPO | Official portal; no stable public general patent REST API documented | — |
| DE | DPMA / DPMAregister | Official portal; no stable public general patent REST API documented | — |
| IN | Indian Patent Office | Official portal; no stable public general patent REST API documented | — |

The plugin does **not** label a record as officially verified when an official machine interface is unavailable or credentials are missing. It records states such as `credentials_missing`, `subscription_required`, `official_api_unavailable`, `official_fetch_failed`, `verified`, `verified_and_supplemented`, and `conflict_reviewed`.

## Evidence and provenance

Canonical patent rows retain the existing DOCDB-oriented schema and add:

- `official_verified`
- `official_source`
- `official_checked_at`
- `verification_status`
- `verification_json`

A new `patent_sources` table preserves source snapshots separately, so DOCDB and national-office records are both retained instead of one silently overwriting the other.

Field-level verification covers application/priority/family identifiers, title, abstract, applicants, inventors, IPC/CPC, filing/priority/publication/grant dates and legal status when supplied by the official source. Conflicting list fields are merged; authoritative jurisdiction-specific status/date fields prefer the official source while the conflict remains recorded in `verification_json`.

## Online actions

- `search_online`: multi-jurisdiction DOCDB retrieval followed by official verification/supplement.
- `search_cn`, `search_us`, `search_ep`, `search_wo`, `search_jp`, `search_kr`, `search_gb`, `search_fr`, `search_de`, `search_in`: jurisdiction shortcuts with the same two-stage pipeline.
- `search_country`: generic ST.3 jurisdiction entry.
- `fetch_biblio`: DOCDB lookup for known publication numbers, then official verification where supported.
- `verify_official`: re-check already stored records against the official source.
- `official_sources`: show official-source capability and whether required credentials are configured.
- `search_ops`: raw EPO OPS/DOCDB search without the hybrid orchestration layer.

Example:

```json
{
  "action": "search_online",
  "query": "ta=(resveratrol) AND ta=(ferment* OR biosynth*)",
  "jurisdictions": ["CN","US","EP","WO","JP","KR","FR"],
  "limit_per_jurisdiction": 100
}
```

Re-verify stored US records:

```json
{
  "action": "verify_official",
  "jurisdiction": "US",
  "publication_numbers": ["US20240123456A1"]
}
```

## Credentials

DOCDB backbone:

```bash
EPO_OPS_KEY=...
EPO_OPS_SECRET=...
```

Official supplements as needed:

```bash
USPTO_ODP_API_KEY=...
KIPRIS_SERVICE_KEY=...
INPI_XSRF_TOKEN=...
INPI_ACCESS_TOKEN=...
INPI_SESSION_TOKEN=...
```

The USPTO ODP requires an API key/account; KIPRIS Plus requires its service key; INPI API PI requires an API account/session tokens. WIPO PCT Webservice is a conditional subscription service.

## Design rule

One model-visible tool (`patent_intel`) + action router + dynamic imports. Official adapters and verification storage are loaded only when called, keeping DeepSeek Harness startup and context overhead small.
