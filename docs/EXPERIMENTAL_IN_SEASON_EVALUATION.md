# Experimental in-season evaluation

Configuration `playerticker.experimental.in-season-participation-independent/v1` is an explicit,
non-serving evaluation mode. It reuses the production transport, normalization, evidence,
evidence-driven tier selection, and inference path while omitting the one valuation-season
participation coordinate before acquisition. Version 1 is restricted to one explicitly named
September–December season from 2023 onward, matching nflverse's documented post-2023
postseason-only participation delivery.

It does not use the production persistence pipeline. Its result contract contains no raw refresh
result or inference builds, marks production publication authorization `false`, and can only be
written to a caller-selected non-serving directory. The command rejects `site-data` and
`dist/data`. Normal `npm run ingest`, replay, workflow, persistence, publication, and export
behavior are unchanged.

Example replay from an already populated isolated capture directory:

```sh
npm run evaluate:in-season-experiment -- \
  --config playerticker.experimental.in-season-participation-independent/v1 \
  --seasons 2026 \
  --career-seasons 2017,2018,2019,2020,2021,2022,2023,2024,2025 \
  --as-of 2026-09-15T12:00:00.000Z \
  --mode replay \
  --captures .local/experimental-captures \
  --output-dir .local/experimental-results \
  --code-sha 0123456789abcdef0123456789abcdef01234567 \
  --code-tree 89abcdef0123456789abcdef0123456789abcdef
```

The JSON result records the configuration/version, requested and intentionally omitted
coordinates, source failures, capture checksums, inference/model versions, selected tier,
unavailable inputs, inference status, source-plan completeness, and replay inputs. A successful
experiment still carries `productionPublicationAuthorized: false` and the unresolved-role warning.

Supported valued paths are only `QB:FULL`, `RB:ACCESSIBLE`, `WR:ACCESSIBLE`, and
`TE:ACCESSIBLE`. A successful `INSUFFICIENT` remains a legitimate inference outcome; missing,
failed, malformed-null, and unsupported paths make the evaluation incomplete. Identity, schedule,
valuation roster, valuation games, and every configured career-game coordinate remain mandatory.
Sleeper remains optional.

This mode deliberately does not repair current-role semantics. In particular, appearance-window
role claims may remain stale after subsequent missed team opportunities. Its output is unsuitable
for production publication or population-accuracy claims.
