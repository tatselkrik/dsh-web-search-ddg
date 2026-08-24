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
- **Strict mode** — only DuckDuckGo result-marked anchors are accepted; zero parsed results raises `WEB_PROVIDER_ERROR`, never a silent empty success
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

For a Harness development checkout that already contains the in-tree package,
replace `packages/web/web-search-ddg/src/` with this repository's `src/`, then
rebuild from the Harness root:

```sh
pnpm exec tsc -b packages/web/web-search-ddg
pnpm exec vitest run packages/web/web-search-ddg
```

A fresh in-tree integration also needs the package added to the Harness
workspace and build graph. For normal use, the profile installation above is
the supported route and requires no source-tree changes.

## Config

| Key | Default | Meaning |
|---|---|---|
| `baseURL` | `https://lite.duckduckgo.com/lite/` | The lite results page. Extra params on the base (e.g. `?kl=us-en`) are preserved. |
| `limit` | `10` | Provider-level cap on sources per search; the seam still enforces the tool request's `maxResults`. |
| `method` | `get` | Query verb. GET sends `q` in the URL; POST sends it only as a URL-encoded form body. |
| `timeoutMs` | `15000` | Wall-clock cap per request, independent of caller cancellation; timeouts surface as `WEB_PROVIDER_ERROR`. |

Override any of them via a patch row:

```yaml
- id: web-search-ddg
  name: dsh-web-search-ddg
  config:
    limit: 5
    method: post
```

## Security and performance notes

**Security**

- **No secrets, no vault access** — the provider reads nothing from the credentials domain; there is nothing to leak.
- **No install-time code execution** — no `prepare`/`postinstall` scripts; `lib/` ships committed, so installs run zero build scripts (the supply-chain vector the harness docs warn about).
- **Bounded dependency ranges** — every published dependency has an explicit caret range, never `*`; align them with your running harness version if you prefer exactness.
- **Input handling** — GET queries travel in the encoded `q` URL parameter; POST queries travel only in the encoded form body. Results are parsed as inert text (never evaluated), and unmarked/internal/non-http targets are rejected before they can become citations.
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
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test             # 24 tests
pnpm run build         # regenerate committed lib/
git diff --exit-code -- lib
```

`lib/` is committed so end users never need a build step.

## License

[MIT](LICENSE)
