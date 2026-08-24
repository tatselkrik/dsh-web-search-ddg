/**
 * DuckDuckGo search for the harness web capability seam (`ctx.web`), scraped
 * from the keyless `lite.duckduckgo.com` HTML page. No API, no account, no
 * credential: this is an UNOFFICIAL endpoint, so the parser owns every
 * robustness concern the other providers delegate to a structured API.
 *
 * Wire behavior: one GET (or POST form) request per search carrying `q` and,
 * when configured, the region as `kl`; result anchors are extracted in
 * document order, `/l/?uddg=` redirect wrappers are unwrapped, internal
 * `duckduckgo.com` targets are dropped, and results are deduplicated
 * by URL. Absence of parsed results is an error rather than an empty success.
 * @module @deepseek-ai/dsh-web-search-ddg/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
/** Stable id this provider registers under; matches `web.searchProvider`. */
export declare const DDG_PROVIDER_ID = "duckduckgo";
/** Default endpoint base (the lite page keeps markup minimal and stable). */
export declare const DDG_DEFAULT_BASE_URL = "https://lite.duckduckgo.com/lite/";
/** Default upper bound on sources returned per search before seam truncation. */
export declare const DDG_DEFAULT_LIMIT = 10;
/**
 * Default per-request wall-clock cap, independent of caller cancellation: the
 * provider must not hang forever merely because a future consumer forgot its
 * timeout policy.
 */
export declare const DDG_DEFAULT_TIMEOUT_MS = 15000;
/** Default HTTP verb for the query form. */
export declare const DDG_DEFAULT_METHOD: DdgRequestMethod;
/**
 * Shape of a DuckDuckGo `kl` region code (`us-en`, `de-de`, `wt-wt`, …): a
 * lowercase `<country>-<language>` pair. Deliberately a shape check, not a
 * whitelist — the endpoint owns the code list and may grow it without notice;
 * an unknown-but-well-shaped code is the endpoint's call to accept or ignore.
 */
export declare const DDG_REGION_PATTERN: RegExp;
/** HTTP verbs the provider may use against the lite form. */
export type DdgRequestMethod = 'get' | 'post';
/** Resolved provider options. */
export interface DdgSearchProviderOptions {
    /** Endpoint base of the lite HTML page. */
    baseURL: string;
    /** Upper bound on sources returned per search. */
    limit: number;
    /** Query verb; POST survives some anomaly checks that GET trips. */
    method?: DdgRequestMethod;
    /**
     * DuckDuckGo region code sent as the form's `kl` parameter (e.g. `us-en`,
     * `de-de`, `wt-wt` for "no region"). Absent/empty omits `kl` entirely, which
     * is the endpoint's own default behavior; a non-empty value that does not
     * match {@link DDG_REGION_PATTERN} makes the provider unavailable rather than
     * silently searching the wrong region.
     */
    region?: string;
    /** Per-request wall-clock cap in milliseconds; defaults to {@link DDG_DEFAULT_TIMEOUT_MS}. */
    timeoutMs?: number;
}
/** One parsed result row before seam normalization. */
interface ParsedRow {
    readonly url: string;
    readonly title?: string;
    readonly snippet?: string;
}
/**
 * Decode the HTML entities the lite page actually emits, plus numeric forms.
 * Numeric/hex references decode first; named `&amp;` last, so an escaped
 * ampersand introducing a real entity never double-decodes.
 * @param text - raw text possibly containing entities.
 * @returns decoded plain text.
 */
export declare function decodeHtmlEntities(text: string): string;
/**
 * Strip tags, decode entities, and collapse whitespace into single spaces.
 * @param html - a fragment of element inner HTML.
 * @returns display-ready plain text.
 */
export declare function stripToText(html: string): string;
/**
 * Resolve one anchor href into a citeable external URL. Handles the three
 * shapes the lite page emits: absolute links, protocol-relative redirects
 * through `/l/?uddg=<encoded>`, and same-page relative noise. Internal
 * `duckduckgo.com` targets and non-http schemes are rejected.
 * @param href - the raw anchor href, already entity-decoded.
 * @returns the absolute external URL, or `undefined` when not a result.
 */
export declare function unwrapResultUrl(href: string): string | undefined;
/**
 * Parse the lite results page. Anchors and snippet cells are consumed as one
 * ordered token stream, so each snippet attaches to the anchor preceding it;
 * anchors without a following snippet stay snippet-less rather than stealing
 * the next row's excerpt.
 * @param html - the full response body.
 * @returns deduplicated parsed rows in document order.
 */
export declare function parseLiteResults(html: string): ParsedRow[];
/**
 * Normalize a configured region: trim, lowercase, and collapse emptiness to
 * `undefined` so "not set" has exactly one representation on the wire (the
 * parameter's absence).
 * @param region - the raw configured region, if any.
 * @returns the normalized code, or `undefined` when unset.
 */
export declare function normalizeRegion(region: string | undefined): string | undefined;
/**
 * True when a normalized region matches the {@link DDG_REGION_PATTERN} shape.
 * @param region - an already-normalized region.
 * @returns whether the endpoint should be asked for it.
 */
export declare function isSupportedRegion(region: string): boolean;
/**
 * Build the request target for one query: the configured base with `q`
 * attached — plus `kl` when a region is configured — preserving any
 * parameters an operator layered onto the base URL.
 * @param options - resolved provider options.
 * @param query - the search query.
 * @returns the absolute request URL.
 */
export declare function buildRequestUrl(options: DdgSearchProviderOptions, query: string): string;
/**
 * Map a parsed page to the seam's normalized result.
 * @param rows - parsed rows from {@link parseLiteResults}.
 * @param limit - provider-level cap applied before the seam's own truncation.
 * @returns the normalized search result.
 */
export declare function toSearchResult(rows: readonly ParsedRow[], limit: number): WebSearchResult;
/**
 * The DuckDuckGo-backed search provider: keyless by construction, so
 * `available()` is purely a configuration-shape check.
 */
export declare class DdgSearchProvider implements WebSearchProvider {
    private readonly resolveOptions;
    readonly id = "duckduckgo";
    /**
     * @param resolveOptions - the options for the NEXT operation, snapshotted at
     * each operation's entry so one search never mixes two configurations.
     */
    constructor(resolveOptions: () => DdgSearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
export {};
//# sourceMappingURL=provider.d.ts.map