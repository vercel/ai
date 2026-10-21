# Identifiers in URL paths

Use `encodePathSegment` from `@ai-sdk/provider-utils` when inserting a raw
identifier into a URL path. It encodes separators, query and fragment markers,
and standalone `.` / `..` segments that URL parsers would otherwise normalize.
Pass unencoded values. For resource names with intentional slashes, encode each
segment separately with `resourceName.split('/').map(encodePathSegment).join('/')`;
the provider must still validate the resource name's expected structure.
