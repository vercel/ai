export const PLAYGROUND_ORIGIN = 'https://playground.ai-sdk.dev';

/** Preserve encoded model IDs, query parameters, and fragments in authored links. */
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

const transitionHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

const retiredApi =
  /^\/api\/(?:generate|stream\/internal|prompt|vercel|share|upload|chats(?:\/[^/]+)?|status|warm|feedback|track|request-count|auth\/(?:info|logout|signin\/vercel))\/?$/;

const goneResponse = () =>
  Response.json(
    {
      error:
        'The playground has moved. Copy any unsaved messages, then open the new playground and sign in again.',
      playground: PLAYGROUND_ORIGIN,
      recovery: 'https://ai-sdk.dev/playground-recovery',
    },
    { status: 410, headers: transitionHeaders },
  );

export function playgroundTransitionResponse(
  request: Request,
): Response | undefined {
  const url = new URL(request.url);
  const read = request.method === 'GET' || request.method === 'HEAD';

  if (url.pathname === '/api/auth/callback/vercel') {
    if (!read || request.headers.has('next-action')) return goneResponse();

    return new Response(null, {
      status: 307,
      headers: {
        ...transitionHeaders,
        Location: `${PLAYGROUND_ORIGIN}${url.pathname}${url.search}`,
      },
    });
  }

  const page = resolvePlaygroundHref(url.pathname + url.search);
  const resource = ['/api/model-feed', '/og/playground'].includes(url.pathname)
    ? `${PLAYGROUND_ORIGIN}${url.pathname}${url.search}`
    : undefined;

  if (!page && !resource && !retiredApi.test(url.pathname)) return;

  if (read && !request.headers.has('next-action') && (page || resource)) {
    return new Response(null, {
      status: 307,
      headers: {
        ...transitionHeaders,
        Location: (page ?? resource)!,
      },
    });
  }

  return goneResponse();
}
