export const PLAYGROUND_ORIGIN = 'https://playground.ai-sdk.dev';

/** Keep encoded model IDs, query parameters, and fragments intact. */
export const resolvePlaygroundHref = (href: string): string | undefined => {
  const match = /^(\/[^?#]*)([?#].*)?$/.exec(href);
  if (!match) return;
  const [, path, suffix = ''] = match;
  let destination: string;
  if (['/playground', '/playground/', '/play', '/prompt'].includes(path)) {
    destination = '/';
  } else if (/^\/(?:playground\/)?r\/[^/]+\/?$/.test(path)) {
    destination = '/';
  } else if (path.startsWith('/playground/')) {
    destination = path.slice('/playground'.length);
  } else if (
    path === '/user' ||
    path.startsWith('/user/') ||
    path.startsWith('/s/')
  ) {
    destination = path;
  } else {
    return;
  }
  return `${PLAYGROUND_ORIGIN}${destination}${suffix}`;
};

// Run before Geistdocs routing, with method checks: 307 redirects would forward
// old Server Action bodies to another origin if configured in next.config.ts.
export function playgroundTransitionResponse(
  request: Request,
): Response | undefined {
  const url = new URL(request.url);
  const page = resolvePlaygroundHref(url.pathname + url.search);
  const resource = ['/api/model-feed', '/og/playground'].includes(url.pathname)
    ? `${PLAYGROUND_ORIGIN}${url.pathname}${url.search}`
    : undefined;
  const legacyApi =
    /^\/api\/(?:generate|stream\/internal|prompt|vercel|share|upload|chats(?:\/[^/]+)?|status|warm|feedback|track|request-count|auth\/(?:info|logout|signin\/vercel|callback\/vercel))\/?$/.test(
      url.pathname,
    );
  if (!page && !resource && !legacyApi) return;
  const read = request.method === 'GET' || request.method === 'HEAD';
  const headers = { 'Cache-Control': 'no-store' };
  if (read && !request.headers.has('next-action') && (page || resource)) {
    return new Response(null, {
      status: 307,
      headers: { ...headers, Location: (page || resource)! },
    });
  }
  // Never forward OAuth codes, verifier cookies, POST bodies, or action IDs.
  // Old tabs must be reloaded; signed-in history is recovered with a fresh login.
  return Response.json(
    {
      error:
        'The playground has moved. Copy any unsaved messages, then open the new playground and sign in again.',
      playground: PLAYGROUND_ORIGIN,
      recovery: 'https://ai-sdk.dev/playground-recovery',
    },
    { status: 410, headers },
  );
}
