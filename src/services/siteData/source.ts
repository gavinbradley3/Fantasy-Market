// WHERE PRODUCTION DATA COMES FROM.
//
// One decision, in one place. The deployed app reads STATIC JSON published by the scheduled
// refresh; a developer reads the local API server. Nothing else in the frontend knows the
// difference, and no component chooses its own source.
//
// WHY STATIC JSON RATHER THAN AN API
// The refresh already produces exactly what the product renders — a published board, the latest
// market quotes and a freshness document — and commits them to the `site-data` branch. Standing
// a server in front of four read-only files would add a process to operate, a thing to keep
// awake and a second place for the data to live. The deploy copies those files into the built
// site instead, so the browser fetches them from the same origin and CDN as the app.
//
// SINGLE SOURCE OF TRUTH. The copy happens in CI, from the `site-data` branch, every deploy.
// There is no second pipeline and nothing is uploaded by hand, so the deployed JSON cannot drift
// from what the refresh published: it IS what the refresh published.

/** The environment knobs this module reads. Nothing else consults them. */
export interface SiteDataEnv {
  /** Explicit static-data base, e.g. to preview the production path locally. */
  readonly VITE_PLAYERTICKER_DATA_URL?: string;
  /** Explicit API base. Kept for the development server and for tests. */
  readonly VITE_PLAYERTICKER_API_URL?: string;
  /** Vite's deployed base path, e.g. `/Fantasy-Market/` on a project page. */
  readonly BASE_URL?: string;
  readonly DEV?: boolean;
}

export type SiteDataKind = 'static' | 'api';

export interface SiteDataSource {
  /** `static` reads published JSON; `api` reads the development server's HTTP routes. */
  readonly kind: SiteDataKind;
  readonly baseUrl: string;
  /** Path to the published board, relative to `baseUrl`. */
  readonly publicationPath: string;
  /** Freshness document. `null` when the source does not publish one (the dev API). */
  readonly statusPath: string | null;
  /** Latest market quotes. `null` when the source does not publish them. */
  readonly marketPath: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** The static layout the deploy produces: published documents under `<base>/data/`. */
function staticSource(baseUrl: string): SiteDataSource {
  return {
    kind: 'static',
    baseUrl: trimTrailingSlash(baseUrl),
    publicationPath: '/board.json',
    statusPath: '/status.json',
    marketPath: '/market-latest.json',
  };
}

/**
 * Resolve the production data source.
 *
 * Precedence, and the reasoning for it:
 *   1. `VITE_PLAYERTICKER_DATA_URL` — an explicit static base always wins, so the production
 *      path can be exercised locally against a real export.
 *   2. `VITE_PLAYERTICKER_API_URL` — an explicit API base, for a developer pointing at a server.
 *   3. development default — `/api`, which `vite.config.ts` proxies to the local API server.
 *   4. production default — static JSON under the deployed base path.
 *
 * A production build therefore needs NO environment variable at all, which is what keeps
 * deployment a one-click affair rather than a configuration exercise.
 */
export function resolveSiteDataSource(env: SiteDataEnv = {}): SiteDataSource {
  const staticBase = env.VITE_PLAYERTICKER_DATA_URL?.trim();
  if (staticBase) return staticSource(staticBase);

  const apiBase = env.VITE_PLAYERTICKER_API_URL?.trim();
  if (apiBase) {
    return {
      kind: 'api',
      baseUrl: trimTrailingSlash(apiBase),
      publicationPath: '/publication',
      // The dev API serves market through a route, but publishes no status document — freshness
      // is a property of the scheduled refresh, which does not exist locally.
      statusPath: null,
      marketPath: '/market',
    };
  }

  if (env.DEV) {
    return {
      kind: 'api',
      baseUrl: '/api',
      publicationPath: '/publication',
      statusPath: null,
      marketPath: '/market',
    };
  }

  // `BASE_URL` is Vite's own deployed base ('/' at a domain root, '/Fantasy-Market/' on a
  // project page). Using it rather than a hard-coded '/data' is what lets the same build work
  // at either, which matters because a project page and a custom domain differ exactly here.
  const base = trimTrailingSlash(env.BASE_URL ?? '/');
  return staticSource(`${base}/data`);
}
