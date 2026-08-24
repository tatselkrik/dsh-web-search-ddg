# @deepseek-ai/dsh-web-search-ddg

A [DuckDuckGo](https://duckduckgo.com)-backed `WebSearchProvider` for the harness
[web capability seam](../../web/README.md) (`ctx.web`). Scrapes the keyless
`lite.duckduckgo.com` results page and maps anchors/snippet cells into the seam's
normalized `WebSearchResult`. **No API key, no account, no credential** — the only
free-lunch search route in this checkout, and correspondingly the only one whose
upstream is an unofficial page rather than a contract.

Local package: not part of upstream `@deepseek-ai` publishing.

## Config

| Key | Default | Meaning |
|---|---|---|
| `baseURL` | `https://lite.duckduckgo.com/lite/` | The lite results page; `q` is attached as a parameter. Extra parameters on the base are preserved. |
| `limit` | `10` | Provider-level cap on sources per search; the seam still enforces the tool request's `maxResults` afterwards. |
| `method` | `get` | Query verb. `post` sends `q` as a form body and survives some anomaly checks that trip on GET. |
| `region` | *(unset)* | DuckDuckGo region code, sent as the form's `kl` parameter (`us-en`, `de-de`, `wt-wt` = "no region"). GET appends it to the URL; POST includes it in the form body. Unset omits `kl` entirely (the endpoint's own default); a value not shaped `<country>-<language>` makes the provider **unavailable** rather than silently searching the wrong region. |

```yaml
- id: web-search-ddg
  name: '@deepseek-ai/dsh-web-search-ddg'
```

With an optional region pinned:

```yaml
- id: web-search-ddg
  name: '@deepseek-ai/dsh-web-search-ddg'
  config:
    region: de-de
```

Registering the plugin does **not** select it. Pin it in the seam:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: duckduckgo   # or env DSH_WEB_SEARCH_PROVIDER=duckduckgo
```

## Mapping

Sources come from result anchors in document order. `/l/?uddg=<encoded>` redirect
wrappers are unwrapped to their target; internal `duckduckgo.com` links and
non-http schemes are dropped; duplicates collapse to the first occurrence. Each
anchor's snippet is the `result-snippet` cell immediately following it — an anchor
without one stays snippet-less instead of stealing the next row's excerpt.
Titles/tags are stripped to plain text with entity decoding (`&amp;` last, so
escaped text never double-decodes).

## Strict mode

Zero parsed results is a `WEB_PROVIDER_ERROR`, never an empty success — an empty
page means an anomaly challenge or a markup change, and both must be loud.
HTTP failures preserve the status; network failures chain `cause`; cancellation is
`WEB_ABORTED`.

## Known Limitations

- **Unofficial endpoint** — no SLA; aggressive bursts can earn 403s/CAPTCHAs;
  markup changes break the parser loudly (strict mode) until patched.
- **No published dates** — the lite page does not expose them, so `publishedAt`
  is always absent.
- **Bing-index depth** — result quality tracks DuckDuckGo's index (Bing-backed),
  slightly behind Google for niche technical queries.
- **Static config** — unlike `web-search-deepseek`, there is no settings section:
  changes take effect at next harness start. There is nothing secret here to
  hot-swap, which is the point.
