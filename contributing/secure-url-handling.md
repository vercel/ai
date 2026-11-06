# Response-supplied URLs

Use `getFromApi` with `validateUrl: true` for response-supplied polling and
download URLs. This opts into the shared URL guard, DNS-pinned validation on
Node.js, and validation of every redirect hop. An explicitly injected custom
fetch must provide equivalent connect-time validation.

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
