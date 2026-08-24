/**
 * `@deepseek-ai/dsh-web-search-ddg`: registers a DuckDuckGo-backed
 * `WebSearchProvider` with `ctx.web`, mirroring how
 * `@deepseek-ai/dsh-web-search-exa` registers INTO the seam's provider
 * registry rather than owning the `ctx.web` key. Keyless by design: the only
 * configuration is where the lite page lives and how results are bounded.
 *
 * Selection note: registering here does NOT select this provider — set
 * `web.config.searchProvider: 'duckduckgo'` (or `$DSH_WEB_SEARCH_PROVIDER`)
 * to pin it, per the seam's selection semantics.
 *
 * @module @deepseek-ai/dsh-web-search-ddg
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  DdgSearchProvider,
  DDG_DEFAULT_BASE_URL,
  DDG_DEFAULT_LIMIT,
  DDG_DEFAULT_METHOD,
  DDG_DEFAULT_TIMEOUT_MS,
} from './provider.ts'

export {
  DdgSearchProvider,
  DDG_DEFAULT_BASE_URL,
  DDG_DEFAULT_LIMIT,
  DDG_DEFAULT_METHOD,
  DDG_DEFAULT_TIMEOUT_MS,
  DDG_PROVIDER_ID,
} from './provider.ts'
export type { DdgSearchProviderOptions, DdgRequestMethod } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-ddg'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills constant defaults). */
export interface Config {
  /** Endpoint base of the lite HTML page. */
  baseURL?: string
  /** Upper bound on sources returned per search. Defaults to 10. */
  limit?: number
  /** Query verb; POST survives some anomaly checks that GET trips. */
  method?: 'get' | 'post'
  /** Per-request wall-clock cap in milliseconds. Defaults to 15000. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  limit: z.number().step(1).min(1),
  method: z.union(['get', 'post'] as const),
  timeoutMs: z.number().step(1).min(1),
})

/** Register the DuckDuckGo search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new DdgSearchProvider(() => ({
    baseURL: config.baseURL ?? DDG_DEFAULT_BASE_URL,
    limit: config.limit ?? DDG_DEFAULT_LIMIT,
    method: config.method ?? DDG_DEFAULT_METHOD,
    timeoutMs: config.timeoutMs ?? DDG_DEFAULT_TIMEOUT_MS,
  })))
}
