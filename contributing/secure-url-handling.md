# Response-supplied URLs

Use `getFromApi` with `validateUrl: true` for response-supplied polling and
download URLs. This opts into the shared URL guard, DNS-pinned validation on
Node.js, and validation of every redirect hop. An explicitly injected custom
fetch must provide equivalent connect-time validation.

Server-side validated downloads reject redirects from HTTPS to HTTP before
requesting the insecure target, even when it matches `trustedOrigin`. Initial
HTTP URLs, HTTP-to-HTTP redirects, and HTTP-to-HTTPS upgrades remain supported.

Pass the developer-configured `baseURL` as `trustedOrigin` to support private
self-hosted endpoints. Only URLs on that exact origin bypass destination
validation; other origins, including redirects, are still validated. Never
derive `trustedOrigin` from a response URL.

Use `credentialedOrigin` with a configured origin when first-hop credentials
must be limited to that origin. Callers that support additional provider-owned
polling hosts must explicitly select the headers allowed on those hosts.
Cross-origin redirects drop all caller headers except User-Agent and do not
restore credentials if the redirect chain returns to the original origin.

For compatibility, omitting `validateUrl` retains the existing unvalidated
behavior. New response URL call sites should always opt into validation.

# Identifiers in URL paths

Use `encodePathSegment` from `@ai-sdk/provider-utils` when inserting a raw
identifier into a URL path. It encodes separators, query and fragment markers,
and standalone `.` / `..` segments that URL parsers would otherwise normalize.
Pass unencoded values. For resource names with intentional slashes, encode each
segment separately with `resourceName.split('/').map(encodePathSegment).join('/')`;
the provider must still validate the resource name's expected structure.

# MCP OAuth DNS validation

MCP OAuth discovery requires a DNS-pinned transport for untrusted URLs on
server runtimes. On Bun, Deno, Workers, and framework edge runtimes, it blocks
untrusted authorization-server hosts and redirects unless you explicitly supply
a custom fetch with equivalent connect-time validation. The configured MCP
server origin and browser window discovery remain supported. Browser Web
Workers and Service Workers without a DOM also require an explicit custom
fetch under this strict policy: worker globals alone are not sufficient to
distinguish them from server workers. Direct callers of
`fetchWithValidatedEndpoint` can opt into this policy with
`requireDnsValidation: true`; other download helpers retain their existing
runtime behavior.
