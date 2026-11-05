// These examples have no user or chat ownership model. Never expose their
// credentialed file downloads outside a local development server.
export function isLocalDevelopmentRequest(request: Request): boolean {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.VERCEL !== undefined
  ) {
    return false;
  }

  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return false;
  }

  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) {
    return false;
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none'
  );
}
