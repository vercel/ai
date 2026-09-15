# Secure URL handling

When a provider fetches a URL with `getFromApi`, always set the `validateUrl`
flag explicitly so every call site makes a visible trust decision. The option
is optional in the type only for backwards compatibility with external callers
of `@ai-sdk/provider-utils`; omitting it behaves like `false` (no validation),
so provider code in this repository must never leave it out. The
`ai-sdk/require-validate-url` oxlint rule (`tools/oxlint-plugin-ai-sdk`)
enforces this in CI: `pnpm check` fails for any `getFromApi` call without an
explicit `validateUrl`.

## Deciding `true` vs `false`

- **`validateUrl: true`** — the host comes from response-body data (a download
  URL like `json.audio.url` / `image.url`, or a polling URL like
  `finalPrediction.urls.get`). It is attacker-influenceable, so it is routed
  through `fetchWithValidatedRedirects`, which rejects private/loopback/link-local
  targets and re-validates every redirect hop. Blocked URLs throw
  `DownloadError`. Also use this for authenticated status polling when the
  initial URL is built from the configured provider endpoint: pass that endpoint
  as `trustedOrigin` so the first hop is allowed while every redirect off that
  origin is validated.
- **`validateUrl: false`** — the URL is built from a developer-configured
  endpoint (`${config.baseURL}/…`, `config.url({ path })`,
  `${baseUrl.origin}/…`) with at most a path segment or id interpolated, and the
  request does not need the validated redirect path. The host is fixed by
  config, so validating the initial URL would break legitimate self-hosted /
  localhost base URLs. (Path-only injection is not SSRF — the host cannot be
  changed.)

> If the host, or anything beyond a path segment, comes from a response body,
> or an authenticated poll must validate redirects → `validateUrl: true`.

## Self-hosted deployments: `trustedOrigin`

A response URL often points back at the developer-configured endpoint itself
(a polling URL on the API host, a download URL on a self-hosted server). When
that endpoint is private — a localhost Replicate-compatible cog server, an
internal fal deployment — `validateUrl: true` would reject exactly the host the
developer configured. Pass `trustedOrigin` with the configured base URL so
hops that are same-origin with it skip target validation; every other hop is
still validated:

```ts
await getFromApi({
  url: pollUrl, // from the response body
  validateUrl: true,
  trustedOrigin: this.config.baseURL,
  // …
});
```

This is safe because a URL same-origin with the configured endpoint is exactly
what a config-derived `validateUrl: false` request would fetch anyway.
`trustedOrigin` must always be a developer-configured value — never derive it
from response data.

## Credentials

When an untrusted URL may legitimately carry the API key on its first hop (e.g.
a same-host polling URL), pass `credentialedOrigin` so headers are sent **only**
when the URL is same-origin with it:

```ts
await getFromApi({
  url: pollUrl, // from the response body
  validateUrl: true,
  credentialedOrigin: this.config.baseURL,
  trustedOrigin: this.config.baseURL,
  headers: authHeaders,
  successfulResponseHandler,
  failedResponseHandler,
  fetch: this.config.fetch,
});
```

## DNS validation and deployment hardening

On Node.js, the default validated download fetch resolves all DNS records
inside an `undici` connector hook, rejects the entire result if any address is
private/internal, and returns those exact records to the connector. This pins
the connection to the validated result and prevents DNS rebinding.

An injected or globally replaced custom `fetch` must provide equivalent
connect-time validation. Other server runtimes should restrict network egress
because the Node DNS and socket hooks are unavailable there. The user-facing
explanation lives in:
[Secure URL Fetching](../content/docs/06-advanced/11-secure-url-fetching.mdx).
