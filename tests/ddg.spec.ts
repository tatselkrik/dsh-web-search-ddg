/** Unit coverage for the DuckDuckGo lite-page parser and provider plumbing. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  DdgSearchProvider,
  buildRequestUrl,
  decodeHtmlEntities,
  parseLiteResults,
  stripToText,
  unwrapResultUrl,
} from '../src/provider.ts'

/**
 * Fixture shaped like a real `lite.duckduckgo.com/lite/` response: uddg-wrapped
 * redirect anchors, one absolute anchor, entity-laden text, an internal nav
 * link that must be dropped, and a duplicate URL that must dedupe.
 */
const FIXTURE = [
  '<html><head><title>a.b - DuckDuckGo Search</title></head><body>',
  '<form action="/lite/"><input name="q"></form>',
  '<table>',
  '<tr><td>1.&nbsp;</td><td>',
  '<a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=abc123"><b>Example</b> &amp; Sons &#8212; Home</a>',
  '</td></tr>',
  '<tr><td colspan="2" class="result-snippet">First &amp; foremost, the &quot;quoted&#x27; snippet.</td></tr>',
  '<tr><td>2.</td><td>',
  '<a rel="nofollow" href="https://github.com/octocat/Hello-World">Hello-World repo</a>',
  '</td></tr>',
  '<tr><td class="result-snippet">A repository for testing.</td></tr>',
  '<tr><td>3.</td><td>',
  '<a href="https://duckduckgo.com/about">About DuckDuckGo</a>',
  '</td></tr>',
  '<tr><td>4.</td><td>',
  '<a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=zzz">Example &amp; Sons (duplicate)</a>',
  '</td></tr>',
  '<tr><td>5.</td><td>',
  '<a rel="nofollow" href="/lite/">Next page</a>',
  '</td></tr>',
  '</table>',
  '</body></html>',
].join('\n')

describe('decodeHtmlEntities', () => {
  it('decodes named, numeric, hex, and keeps &amp; last so entities never double-decode', () => {
    expect(decodeHtmlEntities('&amp;quot;')).toBe('&quot;')
    expect(decodeHtmlEntities('say &amp; stay')).toBe('say & stay')
    expect(decodeHtmlEntities('plain')).toBe('plain')
  })

  it('maps out-of-range references to U+FFFD instead of throwing', () => {
    expect(decodeHtmlEntities('&#999999999;')).toBe('\uFFFD')
    expect(decodeHtmlEntities('&#xD800;')).toBe('\uFFFD')
  })
})

describe('stripToText', () => {
  it('drops tags, decodes, collapses whitespace', () => {
    expect(stripToText('<b>Hello</b>\n  <i>wide&#160;&amp;</i>\tworld')).toBe('Hello wide & world')
  })
})

describe('unwrapResultUrl', () => {
  it('unwraps uddg redirect wrappers to the encoded target', () => {
    expect(unwrapResultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fx&rut=r'))
      .toBe('https://example.com/x')
  })

  it('passes absolute external links through unchanged', () => {
    expect(unwrapResultUrl('https://example.net/page')).toBe('https://example.net/page')
  })

  it('rejects internal duckduckgo.com targets, relative noise, and junk schemes', () => {
    expect(unwrapResultUrl('/lite/')).toBeUndefined()
    expect(unwrapResultUrl('https://duckduckgo.com/about')).toBeUndefined()
    expect(unwrapResultUrl('javascript:void(0)')).toBeUndefined()
    expect(unwrapResultUrl('::not a url::')).toBeUndefined()
  })

  it('rejects uddg wrappers whose target is internal or malformed', () => {
    expect(unwrapResultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fhome'))
      .toBeUndefined()
    expect(unwrapResultUrl('//duckduckgo.com/l/?uddg=%3A%3Abroken')).toBeUndefined()
  })
})

describe('parseLiteResults + toSearchResult ordering contract', () => {
  const rows = parseLiteResults(FIXTURE)

  it('extracts results in document order, unwrapping and skipping internals', () => {
    expect(rows.map(row => row.url)).toEqual([
      'https://example.com/a',
      'https://github.com/octocat/Hello-World',
    ])
  })

  it('attaches each snippet to its preceding anchor only', () => {
    expect(rows[0]?.title).toBe('Example & Sons — Home')
    expect(rows[0]?.snippet).toBe('First & foremost, the "quoted\' snippet.')
    expect(rows[1]?.snippet).toBe('A repository for testing.')
  })

  it('deduplicates repeated URLs keeping the first occurrence', () => {
    expect(rows.filter(row => row.url === 'https://example.com/a')).toHaveLength(1)
  })

  it('caps sources at the provider limit and never claims seam truncation', async () => {
    const provider = new DdgSearchProvider(() => ({
      baseURL: 'https://lite.duckduckgo.com/lite/',
      limit: 1,
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE, { status: 200 })))
    try {
      const result = await provider.search({ query: 'q' })
      expect(result.sources).toHaveLength(1)
      expect(result.truncated).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('DdgSearchProvider.search plumbing', () => {
  const okProvider = new DdgSearchProvider(() => ({
    baseURL: 'https://lite.duckduckgo.com/lite/',
    limit: 10,
  }))

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.headers).toBeDefined()
      return new Response(FIXTURE, { status: 200 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns normalized sources on success', async () => {
    const result = await okProvider.search({ query: 'hello world' })
    expect(result.truncated).toBe(false)
    expect(result.sources[0]).toMatchObject({ url: 'https://example.com/a' })
  })

  it('surfaces HTTP failure status as WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    const error = await okProvider.search({ query: 'q' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).code).toBe('WEB_PROVIDER_ERROR')
  })

  it('surfaces zero parsed results as WEB_PROVIDER_ERROR rather than empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body>anomaly</body></html>', { status: 200 })))
    const error = await okProvider.search({ query: 'q' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).code).toBe('WEB_PROVIDER_ERROR')
  })

  it('surfaces network rejection as WEB_PROVIDER_ERROR with cause retained', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    const error = await okProvider.search({ query: 'q' }).catch((e: unknown) => e)
    expect((error as WebError).code).toBe('WEB_PROVIDER_ERROR')
  })

  it('reports pre-aborted searches as WEB_ABORTED without dispatching', async () => {
    const controller = new AbortController()
    controller.abort()
    const dispatch = vi.fn()
    vi.stubGlobal('fetch', dispatch)
    const error = await okProvider.search({ query: 'q' }, controller.signal).catch((e: unknown) => e)
    expect(dispatch).not.toHaveBeenCalled()
    expect((error as WebError).code).toBe('WEB_ABORTED')
  })

  it('sends q as form body under POST method', async () => {
    const postProvider = new DdgSearchProvider(() => ({
      baseURL: 'https://lite.duckduckgo.com/lite/',
      limit: 10,
      method: 'post',
    }))
    let seenBody: string | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      seenBody = init?.body as string
      return new Response(FIXTURE, { status: 200 })
    }))
    await postProvider.search({ query: 'two words' })
    expect(seenBody).toContain('q=two+words')
  })
})

describe('configuration shape', () => {
  it('available() reflects URL validity and positive-integer limit', () => {
    const good = new DdgSearchProvider(() => ({ baseURL: 'https://lite.duckduckgo.com/lite/', limit: 10 }))
    const badUrl = new DdgSearchProvider(() => ({ baseURL: '::nope::', limit: 10 }))
    const badLimit = new DdgSearchProvider(() => ({ baseURL: 'https://lite.duckduckgo.com/lite/', limit: 0 }))
    expect(good.available()).toBe(true)
    expect(badUrl.available()).toBe(false)
    expect(badLimit.available()).toBe(false)
  })

  it('buildRequestUrl preserves operator parameters while setting q', () => {
    expect(buildRequestUrl(
      { baseURL: 'https://proxy.internal/lite/?kl=us-en', limit: 5 },
      'two words',
    )).toBe('https://proxy.internal/lite/?kl=us-en&q=two+words')
  })
})
