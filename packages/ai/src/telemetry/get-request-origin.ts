/** Remove credentials, paths, queries, and fragments before emitting telemetry. */
export function getRequestOrigin(url: string | undefined): string | undefined {
  if (url == null) return undefined;

  try {
    const endpoint = new URL(url);
    return endpoint.protocol === 'http:' || endpoint.protocol === 'https:'
      ? endpoint.origin
      : undefined;
  } catch {
    return undefined;
  }
}
