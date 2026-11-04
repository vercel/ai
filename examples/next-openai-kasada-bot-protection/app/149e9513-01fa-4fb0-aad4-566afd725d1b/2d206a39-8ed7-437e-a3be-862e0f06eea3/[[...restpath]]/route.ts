const KASADA_ENDPOINT = 'FILL_IN.kasadapolyform.io';

type RouteContext = {
  params?: {
    restpath?: string[];
  };
};

function isSafePathSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('/') &&
    !segment.includes('\\') &&
    /^[A-Za-z0-9._~-]+$/.test(segment)
  );
}

async function handler(request: Request, context: RouteContext) {
  const incomingUrl = new URL(request.url);
  const url = new URL(`https://${KASADA_ENDPOINT}`);

  const rawSegments = context.params?.restpath ?? [];
  if (!rawSegments.every(isSafePathSegment)) {
    return new Response('Invalid path.', { status: 400 });
  }
  url.pathname = `/${rawSegments.join('/')}`;

  incomingUrl.searchParams.forEach((value, key) => {
    if (key !== 'restpath') {
      url.searchParams.append(key, value);
    }
  });

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', 'FILL_IN');
  headers.delete('host');
  const r = await fetch(url.toString(), {
    method: request.method,
    body: request.body,
    headers,
    mode: request.mode,
    redirect: 'manual',
    // @ts-expect-error
    duplex: 'half',
  });
  const responseHeaders = new Headers(r.headers);
  responseHeaders.set('cdn-cache-control', 'no-cache');
  return new Response(r.body, {
    status: r.status,
    statusText: r.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
export const PUT = handler;
