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
  const localHostnames = ['localhost', '127.0.0.1', '[::1]'];
  const host = request.headers.get('host');
  const port = url.port ? `:${url.port}` : '';

  // Next.js can construct request.url from the bind address. Check the actual
  // Host header too, so a browser cannot reach this route via DNS rebinding.
  if (
    !localHostnames.includes(url.hostname) ||
    !localHostnames.some(hostname => host === `${hostname}${port}`)
  ) {
    return false;
  }

  // Next.js adds forwarding headers for direct requests as well. Allow only
  // its single loopback client address and an unchanged Host, never a proxy's
  // external client address or forwarding chain.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (
    request.headers.has('forwarded') ||
    (forwardedHost !== null && forwardedHost !== host) ||
    (forwardedFor !== null &&
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(forwardedFor))
  ) {
    return false;
  }

  const origin = request.headers.get('origin');
  if (origin !== null && origin !== `${url.protocol}//${host}`) {
    return false;
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none'
  );
}
