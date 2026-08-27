# dsh-patent-intelligence

Lightweight DeepSeek Harness plugin for professional patent search and analysis.

Internal plugin version: **0.1.1.1**. `package.json` uses npm-compatible SemVer `0.1.1`; the fourth revision digit is kept in `VERSION` and `dsh.patentIntelligence.version`.

## Scope

Target jurisdictions: **CN, US, EP, WO/PCT, JP, KR, GB, DE, FR, CA, AU, IN**.

Workflow:

`natural-language question -> multilingual search concepts -> IncoPat/DWPI/public-office queries -> bibliographic retrieval/import -> normalization -> family merge -> technical classification -> technical-route extraction -> core-patent scoring -> SQLite/JSON/Markdown/Excel/HTML`

## Design goals

- One model-visible tool: `patent_intel`.
- Pure ESM, no build step.
- Heavy modules are dynamically imported only when used.
- SQLite is Node built-in `node:sqlite`.
- Only one runtime dependency (`xlsx`), loaded only for Excel import/export.
- Commercial databases are supported primarily through query generation + exported Excel/CSV import; credentials/APIs can be added as optional connectors without changing the core schema.

## Install

```bash
dsh plugin --profile web add ./dsh-patent-intelligence
```

Then run DSH normally.

## Tool actions

- `strategy`: agent converts the natural-language request into multilingual concept blocks, then the plugin emits canonical and database-specific query strings.
- `import`: import `.xlsx/.xls/.csv/.tsv/.json/.jsonl` exported from IncoPat, DWPI/Derwent or other databases.
- `search_ops`: retrieve EPO OPS bibliographic search results. Requires `EPO_OPS_KEY` and `EPO_OPS_SECRET`.
- `workset`: return compact patent records for LLM classification and technical-route extraction.
- `annotate`: write LLM annotations back to SQLite.
- `analyze`: family-level merge/normalization and deterministic core-patent scoring.
- `report`: export SQLite/JSON/Markdown/Excel/HTML.
- `status`: workspace statistics.

## Commercial database policy

IncoPat and Derwent/DWPI data access depends on the user's subscription and license. This plugin does **not** bypass access controls. It generates search strategies and imports user-authorized exports. API connectors should only be enabled where the account/license expressly permits automation and bulk retrieval.

## Versioning

Project convention: `MAJOR.MINOR.FEATURE.REVISION`, e.g. `0.1.1.1`.

NPM itself requires three-part SemVer, so npm package versions map `0.1.1.x -> 0.1.1`; the full four-part version remains in `VERSION` and plugin metadata.
