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
import z from '@deepseek-ai/schemastery';
import { DdgSearchProvider, DDG_DEFAULT_BASE_URL, DDG_DEFAULT_LIMIT, DDG_DEFAULT_METHOD, DDG_DEFAULT_TIMEOUT_MS, } from "./provider.js";
export { DdgSearchProvider, DDG_DEFAULT_BASE_URL, DDG_DEFAULT_LIMIT, DDG_DEFAULT_METHOD, DDG_DEFAULT_TIMEOUT_MS, DDG_PROVIDER_ID, } from "./provider.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-ddg';
/** The web seam this provider registers into. */
export const inject = ['web'];
export const Config = z.object({
    baseURL: z.string(),
    limit: z.number().step(1).min(1),
    method: z.union(['get', 'post']),
    timeoutMs: z.number().step(1).min(1),
});
/** Register the DuckDuckGo search provider with `ctx.web`. */
export function apply(ctx, config) {
    ctx.web.registerSearchProvider(new DdgSearchProvider(() => ({
        baseURL: config.baseURL ?? DDG_DEFAULT_BASE_URL,
        limit: config.limit ?? DDG_DEFAULT_LIMIT,
        method: config.method ?? DDG_DEFAULT_METHOD,
        timeoutMs: config.timeoutMs ?? DDG_DEFAULT_TIMEOUT_MS,
    })));
}
//# sourceMappingURL=index.js.map