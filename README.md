# dsh-web-search-ddg

[![CI](https://github.com/tatselkrik/dsh-web-search-ddg/actions/workflows/ci.yml/badge.svg)](https://github.com/tatselkrik/dsh-web-search-ddg/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520.3-blue)

**Keyless DuckDuckGo web search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**
No API key. No account. No credit card. No tokens burned — the search runs as a
plain HTTP scrape of DuckDuckGo's lite results page, registered through the
harness's public `ctx.web` provider seam.

## Why

DeepSeek Harness is free software. The agent running inside it can be free.
Everything a coding agent actually needs — files, shell, git, planning,
subagents — is local and costs nothing. Web search was the one wall: every
shipped provider requires a paid account (DeepSeek platform key, Exa,
Perplexity), while closed tools like Claude Code and ChatGPT bundle live search
into their subscriptions.

This plugin exists because "free" shouldn't mean "free, except the internet."
Search should not be the feature that forces your first API signup and your
first metered bill. It runs on the same public page your browser uses — no
quota to exhaust, no key to rotate, nothing to cancel when the trial ends.
And because it lives in your checkout rather than someone's endpoint, it is
yours to audit, patch, and keep: free software deserves free search.

## Features

- **Zero credentials** — `available()` is a pure config-shape check; nothing to store in the credential vault
- **Zero model tokens** — unlike the in-box DeepSeek provider, one search never costs an auxiliary model turn
- **Region targeting** — optional `region` config rides DuckDuckGo's `kl` parameter (`us-en`, `de-de`, `wt-wt` = "no region"); a malformed code disables the provider loudly instead of silently searching the wrong locale
- **Strict mode** — zero parsed results raises `WEB_PROVIDER_ERROR` (anomaly challenge / markup change), never a silent empty success
- **Redirect-aware parsing** — `/l/?uddg=` wrappers unwrapped to real targets; internal `duckduckgo.com` links dropped; duplicate URLs deduplicated
- **Entity-safe text** — numeric/hex/named entities decoded with `&amp;` last, so escaped text never double-decodes
- **GET and POST** — POST form fallback for deployments where GET trips anomaly checks
- **Snippet pairing done right** — each snippet attaches to its preceding anchor only

## Install

### Into a profile (recommended)

```sh
dsh plugin --profile my-profile add github:tatselkrik/dsh-web-search-ddg
```

Built artifacts are committed under `lib/`, so no build-script allowance is
needed. The bundle inserts itself into the `ctx.web` registry; when it is the
only *usable* search provider it is auto-selected. To pin it explicitly, add to
your profile's `cordis.patch.yml`:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: duckduckgo
```

Then start with your profile:

```sh
dsh --profile my-profile web
```

### Inside a source checkout (in-tree variant)

Copy `src/` into `packages/web/web-search-ddg/src/`, add the package folder's
`package.json` + `tsconfig.json` — or simply copy this repo's `src/` over an
existing clone of the in-tree version.

## Verify

Ask the running agent to search something. Each query is one HTTP GET (or POST)
to the lite page, and results arrive as normalized sources — `url`, plus
optional `title`/`snippet`. Zero parsed results raises a loud
`WEB_PROVIDER_ERROR` instead of returning an empty success; if you see those,
it is throttling or markup drift, not your config.

## Config

| Key | Default | Meaning |
|---|---|---|
| `baseURL` | `https://lite.duckduckgo.com/lite/` | The lite results page; `q` is appended. Extra params on the base are preserved. |
| `limit` | `10` | Provider-level cap on sources per search; the seam still enforces the tool request's `maxResults`. |
| `method` | `get` | Query verb. `post` sends `q` as a URL-encoded form body. |
| `region` | *(unset)* | DuckDuckGo region code sent as the form's `kl` parameter. GET appends it to the URL; POST includes it in the form body as well. Codes are `<country>-<language>` pairs as in DuckDuckGo's own regional settings (`us-en`, `jp-jp`, `uk-en`; `wt-wt` = "no region") — validated by shape only, so an unknown-but-well-formed code passes through for the endpoint to judge. Unset omits `kl` entirely (the endpoint's own default); a malformed value makes the provider unavailable rather than silently searching the wrong region. |
| `timeoutMs` | `15000` | Wall-clock cap per request, independent of caller cancellation; timeouts surface as `WEB_PROVIDER_ERROR`. |

Override any of them via a patch row:

```yaml
- id: web-search-ddg
  name: dsh-web-search-ddg
  config:
    limit: 5
    method: post
    region: de-de   # optional: pin results to a DuckDuckGo region
```

## Security and performance notes

**Security**

- **No secrets, no vault access** — the provider reads nothing from the credentials domain; there is nothing to leak.
- **No install-time code execution** — no `prepare`/`postinstall` scripts; `lib/` ships committed, so installs run zero build scripts (the supply-chain vector the harness docs warn about).
- **Pinned dependency ranges** — `^0.1.0` against the published `@deepseek-ai/*` packages, never `*`; align them with your running harness version if you prefer exactness.
- **Input handling** — queries travel only inside the encoded `q` parameter to your configured `baseURL`; results are parsed as inert text (never evaluated), and internal/non-http targets are rejected before they can become citations.
- **Parser honesty** — extraction is regex-based, not a full HTML parser: adequate for the lite page's flat markup, and it only ever sees what DuckDuckGo returns. Treat result titles/snippets like any search tool's output — untrusted text entering model context.
- **Privacy** — each query is visible to DuckDuckGo Inc. (that's how searching works); nothing else receives anything, and no telemetry exists in this package.

**Performance**

- One small HTTP round trip per search (~20–60 KB lite page); parsing is a single linear token pass.
- Stateless between calls; per-request wall clock capped at `timeoutMs` (default 15 s) even if a consumer forgets cancellation.
- Result count bounded by `limit` before the seam applies its own `maxResults`, so context cost stays predictable.
- Contrast: the in-box DeepSeek provider pays a full auxiliary model turn (seconds + tokens) per search; this pays one fetch.

## Known limitations

- **Unofficial endpoint** — no SLA. Aggressive bursts can earn 403s/CAPTCHAs; markup changes break parsing loudly until patched.
- **No published dates** — the lite page does not expose them.
- **Bing-index depth** — result quality tracks DuckDuckGo's index, slightly behind Google for niche technical queries.
- **Peer dependency versions** — declared with loose ranges against the harness packages; if you hit class-identity issues (`WebError` instanceof) between a registry-installed copy and an in-box copy, pin `dependencies` to match your running harness version.

## Development

```sh
pnpm install          # inside a DeepSeek Harness checkout that provides the peer packages
pnpm exec tsc -b .    # emit lib/types
pnpm exec vitest run packages/web/web-search-ddg   # from the checkout root: 25 tests
```

`lib/` is committed so end users never need a build step.

## License

[MIT](LICENSE)
