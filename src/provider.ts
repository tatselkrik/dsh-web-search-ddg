/**
 * DuckDuckGo search for the harness web capability seam (`ctx.web`), scraped
 * from the keyless `lite.duckduckgo.com` HTML page. No API, no account, no
 * credential: this is an UNOFFICIAL endpoint, so the parser owns every
 * robustness concern the other providers delegate to a structured API.
 *
 * Wire behavior: one GET (or POST form) request per search; result anchors are
 * extracted in document order, `/l/?uddg=` redirect wrappers are unwrapped,
 * internal `duckduckgo.com` targets are dropped, and results are deduplicated
 * by URL. Absence of parsed results is an error rather than an empty success.
 * @module @deepseek-ai/dsh-web-search-ddg/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'

/** Stable id this provider registers under; matches `web.searchProvider`. */
export const DDG_PROVIDER_ID = 'duckduckgo'

/** Default endpoint base (the lite page keeps markup minimal and stable). */
export const DDG_DEFAULT_BASE_URL = 'https://lite.duckduckgo.com/lite/'

/** Default upper bound on sources returned per search before seam truncation. */
export const DDG_DEFAULT_LIMIT = 10

/** Default HTTP verb for the query form. */
export const DDG_DEFAULT_METHOD: DdgRequestMethod = 'get'

/**
 * Browser-shaped User-Agent. The endpoint is unofficial and serves anomalies
 * to bare non-browser clients; identify honestly as harness traffic while
 * keeping the shape the endpoint expects.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 deepseek-harness/0.0.1'

/** HTTP verbs the provider may use against the lite form. */
export type DdgRequestMethod = 'get' | 'post'

/** Resolved provider options. */
export interface DdgSearchProviderOptions {
  /** Endpoint base of the lite HTML page. */
  baseURL: string
  /** Upper bound on sources returned per search. */
  limit: number
  /** Query verb; POST survives some anomaly checks that GET trips. */
  method?: DdgRequestMethod
}

/** One parsed result row before seam normalization. */
interface ParsedRow {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
}

/**
 * Decode the HTML entities the lite page actually emits, plus numeric forms.
 * Numeric/hex references decode first; named `&amp;` last, so an escaped
 * ampersand introducing a real entity never double-decodes.
 * @param text - raw text possibly containing entities.
 * @returns decoded plain text.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
}

/** Code point for a decoded number, or U+FFFD outside the scalar range. */
function safeCodePoint(codePoint: number): string {
  return Number.isInteger(codePoint)
    && codePoint >= 0
    && codePoint <= 0x10ffff
    && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
    ? String.fromCodePoint(codePoint)
    : '\uFFFD'
}

/**
 * Strip tags, decode entities, and collapse whitespace into single spaces.
 * @param html - a fragment of element inner HTML.
 * @returns display-ready plain text.
 */
export function stripToText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/gu, ' ').trim()
}

/**
 * Resolve one anchor href into a citeable external URL. Handles the three
 * shapes the lite page emits: absolute links, protocol-relative redirects
 * through `/l/?uddg=<encoded>`, and same-page relative noise. Internal
 * `duckduckgo.com` targets and non-http schemes are rejected.
 * @param href - the raw anchor href, already entity-decoded.
 * @returns the absolute external URL, or `undefined` when not a result.
 */
export function unwrapResultUrl(href: string): string | undefined {
  let url: URL
  try {
    url = new URL(href, 'https://duckduckgo.com/')
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  // Redirect wrapper first: the uddg parameter IS the target, already
  // percent-decoded by URLSearchParams.
  const uddg = url.searchParams.get('uddg')
  if (uddg !== null) {
    try {
      const target = new URL(uddg)
      if (target.protocol !== 'https:' && target.protocol !== 'http:') return undefined
      if (/(^|\.)duckduckgo\.com$/i.test(target.hostname)) return undefined
      return target.toString()
    } catch {
      return undefined
    }
  }
  if (/(^|\.)duckduckgo\.com$/i.test(url.hostname)) return undefined
  return url.toString()
}

/**
 * Parse the lite results page. Anchors and snippet cells are consumed as one
 * ordered token stream, so each snippet attaches to the anchor preceding it;
 * anchors without a following snippet stay snippet-less rather than stealing
 * the next row's excerpt.
 * @param html - the full response body.
 * @returns deduplicated parsed rows in document order.
 */
export function parseLiteResults(html: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const seen = new Set<string>()
  const token =
    /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<t[dh][^>]*class="?result-snippet"?[^>]*>([\s\S]*?)<\/t[dh]>/gi
  let match: RegExpExecArray | null
  let pending: ParsedRow | undefined
  while ((match = token.exec(html)) !== null) {
    if (match[1] !== undefined) {
      const url = unwrapResultUrl(decodeHtmlEntities(match[1]).trim())
      if (url === undefined || seen.has(url)) continue
      seen.add(url)
      pending = { url, ...titleOf(match[2] ?? '') }
      rows.push(pending)
    } else if (pending !== undefined) {
      const snippet = stripToText(match[3] ?? '')
      if (snippet.length > 0) rows[rows.length - 1] = { ...pending, snippet }
      pending = undefined
    }
  }
  return rows
}

/** Title text for one anchor, omitted when empty after stripping. */
function titleOf(innerHtml: string): { title?: string } | {} {
  const title = stripToText(innerHtml)
  return title.length > 0 ? { title } : {}
}

/**
 * Build the request target for one query: the configured base with `q`
 * attached, preserving any parameters an operator layered onto the base URL.
 * @param options - resolved provider options.
 * @param query - the search query.
 * @returns the absolute request URL.
 */
export function buildRequestUrl(options: DdgSearchProviderOptions, query: string): string {
  const url = new URL(options.baseURL)
  url.searchParams.set('q', query)
  return url.toString()
}

/**
 * Map a parsed page to the seam's normalized result.
 * @param rows - parsed rows from {@link parseLiteResults}.
 * @param limit - provider-level cap applied before the seam's own truncation.
 * @returns the normalized search result.
 */
export function toSearchResult(rows: readonly ParsedRow[], limit: number): WebSearchResult {
  const sources: WebSearchSource[] = rows.slice(0, limit).map(row => ({
    url: row.url,
    ...row.title !== undefined ? { title: row.title } : {},
    ...row.snippet !== undefined ? { snippet: row.snippet } : {},
  }))
  return { sources, truncated: false }
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Throw the provider's stable cancellation error while retaining the reason. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('DuckDuckGo search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a positive integer, the only legal bound on results or URLs. */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/**
 * Throw the provider's stable cancellation error when the caller already
 * aborted. A function boundary rather than an inline test, mirroring
 * `web-search-deepseek`: the indirection keeps control-flow analysis from
 * narrowing later `signal?.aborted` reads into non-overlapping literals.
 */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/**
 * The DuckDuckGo-backed search provider: keyless by construction, so
 * `available()` is purely a configuration-shape check.
 */
export class DdgSearchProvider implements WebSearchProvider {
  readonly id = DDG_PROVIDER_ID

  /**
   * @param resolveOptions - the options for the NEXT operation, snapshotted at
   * each operation's entry so one search never mixes two configurations.
   */
  constructor(private readonly resolveOptions: () => DdgSearchProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return URL.canParse(options.baseURL) && isPositiveInteger(options.limit)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    throwIfSearchAborted(signal)
    const options = this.resolveOptions()
    const endpoint = buildRequestUrl(options, request.query)
    // Built per-call under `exactOptionalPropertyTypes`: an explicit
    // `body: undefined` is not assignable to `RequestInit`, so POST-only
    // fields join through conditional spreads instead.
    const method = options.method ?? DDG_DEFAULT_METHOD
    let response: Response
    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'text/html,application/xhtml+xml',
          ...method === 'post' ? { 'content-type': 'application/x-www-form-urlencoded' } : {},
        },
        ...(method === 'post' ? { body: new URLSearchParams({ q: request.query }).toString() } : {}),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`DuckDuckGo search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      throw new WebError(
        `DuckDuckGo returned HTTP ${response.status}; the unofficial endpoint may be throttling or challenging this client`,
        'WEB_PROVIDER_ERROR',
      )
    }

    let html: string
    try {
      html = await response.text()
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`DuckDuckGo response body failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    const rows = parseLiteResults(html)
    if (rows.length === 0) {
      throw new WebError(
        'DuckDuckGo parsed zero results; the page may be an anomaly challenge or its markup changed',
        'WEB_PROVIDER_ERROR',
      )
    }
    return toSearchResult(rows, options.limit)
  }
}
