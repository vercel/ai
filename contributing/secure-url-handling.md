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

## Identifiers in URL paths

Use `encodePathSegment` from `@ai-sdk/provider-utils` when inserting a raw
identifier into a URL path. It encodes separators, query and fragment markers,
and standalone `.` / `..` segments that URL parsers would otherwise normalize.
Pass unencoded values. For resource names with intentional slashes, encode each
segment separately with `resourceName.split('/').map(encodePathSegment).join('/')`;
the provider must still validate the resource name's expected structure.

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

## Direct fetch helpers

Use `fetchUntrustedUrl` from `@ai-sdk/provider-utils` for direct fetches of
response-supplied or otherwise untrusted URLs. It shares URL validation and
redirect handling with `fetchWithValidatedRedirects`, but adds
first-hop credential isolation. Without a matching `credentialedOrigin` or,
when that option is omitted, a matching `trustedOrigin`, it sends only an
allowlist of non-credential request metadata such as content negotiation, range,
idempotency, tracing, request-id, and user-agent headers. Unknown headers are
withheld because arbitrary provider credential names cannot be identified
safely.

Set `credentialedOrigin` to a developer-configured endpoint when credentials
are needed. It takes precedence over `trustedOrigin`, which also exempts matching
hops from URL validation for self-hosted deployments. Never derive either origin
from response data. Sanitization still strips proxy, cloud-metadata, and cookie
headers, and a cross-origin redirect retains only `User-Agent`.

`fetchWithValidatedRedirects` retains its existing behavior for compatibility:
it sanitizes caller headers but forwards credentials and arbitrary custom
headers on the first hop. `trustedOrigin` in that helper controls URL validation,
not credential forwarding. Its callers remain responsible for deciding whether
the initial URL may receive those headers. Switching to `fetchUntrustedUrl` is
an explicit opt-in; existing calls are not automatically protected on the first
hop. `getFromApi` also retains its existing optional `credentialedOrigin` policy,
so provider call sites must continue passing the configured origin when sending
credentials to response-supplied URLs.

If a direct caller needs to send additional protocol metadata to an untrusted
first hop, list only those sanitized header names in
`untrustedFirstHopHeaders`. Do not use this option for credentials:

```ts
await fetchUntrustedUrl({
  url: discoveryUrl,
  headers: { 'x-protocol-version': protocolVersion },
  untrustedFirstHopHeaders: ['x-protocol-version'],
});
```

## DNS validation and deployment hardening

The default download transport uses the configured fetch or the runtime's global
fetch. URL checks do not resolve DNS: public-looking hostnames resolving to
private addresses and DNS rebinding are outside the default protection.

Recommend `createGuardedFetch()` from `@ai-sdk/guarded-fetch` for applications
fetching URLs supplied by users, models, tools, or external services on Node.js,
unless the application controls the destinations or already enforces equivalent
SSRF protection. Authentication alone does not make a user-supplied URL trusted.
The transport validates all DNS results inside an Undici connector and passes
those same results to the socket. A separate DNS lookup before calling fetch
does not protect the connection from a subsequent DNS change. Applications can
instead (or additionally) enforce network egress restrictions. Other server
runtimes need equivalent platform or transport controls.

Always propagate `this.config.fetch` (or the equivalent provider setting) into
download and polling helpers, including `downloadBlob`. Otherwise applications
cannot apply their chosen transport to those requests. Pass the underlying
configured transport, not an API wrapper that adds credentials to every request;
the URL helpers must remain in control of which origins receive credentials.
Core file downloads have separate hooks; `createDownload({ fetch })` can be used
directly or adapted to `experimental_download`.

The optional package may depend on `provider-utils`; core and providers must not
import it or depend on Undici for the default download path. The user-facing
configuration and limitations live in
[Secure URL Fetching](../content/docs/06-advanced/11-secure-url-fetching.mdx).

## Settings inserted into generated hostnames

Before inserting a resource name, region, or location into a provider hostname,
validate it with `isValidHostnamePart` from `@ai-sdk/provider-utils`. It accepts one
ASCII DNS label (1–63 letters, digits, or hyphens, with no leading or trailing
hyphen). Throw `InvalidArgumentError` with the setting name when validation fails.
