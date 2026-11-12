# npm audit triage, 2026-11-12

Scope: `npm audit` on `main` (`084cbab`) reported 15 findings: 2 critical, 6 high, 7 moderate. This PR applies the non-breaking fixes (lockfile only), which clears 6. The 9 that remain need major-version upgrades and are scheduled below, not applied.

**Exposure classes**
- **Browser:** shipped in the deployed JavaScript.
- **Pipeline:** runs in the Node ingest and export scripts on GitHub Actions.
- **Build:** Vite, PostCSS and Tailwind at build time, plus the local dev server.
- **Test:** Vitest only.

## Findings

| Severity | Package (path) | Advisory | Exposure | Exploitable here? | Action |
|---|---|---|---|---|---|
| critical | tinypool (via vitest) | Prototype-pollution gadget to RCE in worker options (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) | Test | No. It requires an attacker to control the worker options passed by the test runner. CI runs only repository code. | Vitest 5 upgrade (major) |
| critical | vitest | UI server file read (GHSA-5xrq-8626-4rwp); mocker path traversal (GHSA-82fw-gwwq-j7x9) | Test | No. The UI server is never started, and mocks come from repository code. | Vitest 5 upgrade (major) |
| moderate | @vitest/mocker, vite-node (via vitest) | Mock registration injection; transitive vite | Test | No | Vitest 5 upgrade |
| high | vite 5.4.21 | Dev-server path traversal, `fs.allow` and `fs.deny` bypasses, cross-origin script via middleware, launch-editor issues (mostly Windows) | Build and dev server | Only while a developer runs `vite dev` and visits a hostile page. Production is static files on Pages, with no Vite server. | Vite 6.4.4+ or 8 (major); meanwhile run the dev server on localhost only (the default) |
| moderate | esbuild 0.21.5 (via vite) | Any website can query the dev server (GHSA-67mh-4wv8-2f99) | Dev server | Same as vite | With vite |
| high | zod 3.25.76 | Memory exhaustion validating oversized constrained collections (GHSA-mrhx-c7xc-m3w5) | Browser and pipeline | Low. Zod validates our own `board.json` and `status.json` (same origin) and provider payloads already size-bounded by the transport. An attacker would need to replace those files. | Zod 4 migration (major; schema API changes) |
| moderate | react-router(-dom) 6.30.x | Open redirect via backslash in `<Link>` or `useNavigate` (GHSA-wrjc-x8rr-h8h6, GHSA-jjmj-jmhj-qwj2); SSR hydration constructor injection (GHSA-337j-9hxr-rhxg) | Browser | Low. Every navigation target is a constant in the code; the only `useNavigate` call (`SearchOverlay`) is no longer rendered after PR #11. No SSR. | React Router 7 (major) |
| high | postcss 8.4.x | sourceMappingURL arbitrary `.map` read (GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849) | Build | Build reads only repository CSS | **Fixed here** (8.5.32) |
| high | nanoid, source-map-js, browserslist | Infinite loop, DoS, OOM on hostile input | Build | No hostile input at build | **Fixed here** |
| moderate | baseline-browser-mapping, postcss-selector-parser | DoS on invalid input | Build | No | **Fixed here** |

**Result:** none of the findings is exploitable against the deployed site or the data pipeline as configured. The two criticals sit in test tooling.

## Verification of this PR

- `npm audit fix` without `--force` changes only `package-lock.json`. Findings drop from 15 to 9.
- `npm run typecheck`: passes.
- `npm test`: 219 files, 2,219 tests pass.
- `npm run build`: passes.

## Scheduled upgrades (not in this PR; one PR each, after Phase 0 ships)

1. **Vitest 2 → 5:** clears both criticals. Test-only, so the deployed artifact is unchanged. Risk is test configuration churn.
2. **Vite 5 → 6.4.4+ (or 8) with `@vitejs/plugin-react`:** build output must be re-verified with the deployment preview and `assert:public-data`.
3. **Zod 3 → 4:** touches every schema in `src/services/api` and the ingestion adapters. Needs the full suite plus a staging replay to prove identical boards.
4. **React Router 6 → 7:** routing changes need the route tests and a preview check.
