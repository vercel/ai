/** Only record the known transport destination, never infer a provider backend. */
export function getServerAttributes(url: string | undefined): {
  'server.address'?: string;
  'server.port'?: number;
} {
  if (url == null) return {};

  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      return {};
    }

    return {
      'server.address': endpoint.hostname.replace(/^\[|\]$/g, ''),
      'server.port':
        endpoint.port !== ''
          ? Number(endpoint.port)
          : endpoint.protocol === 'https:'
            ? 443
            : 80,
    };
  } catch {
    return {};
  }
}
