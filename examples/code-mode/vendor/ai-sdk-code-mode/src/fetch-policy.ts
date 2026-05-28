import { CodeModeFetchError } from './errors.js';
import type { CodeModeFetchPolicy } from './types.js';

export interface HostFetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HostFetchResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface NormalizedFetchRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

const DEFAULT_MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function executeHostFetch({
  request,
  fetch,
  policy,
  signal,
}: {
  request: HostFetchRequest;
  fetch: typeof globalThis.fetch | undefined | false;
  policy: CodeModeFetchPolicy;
  signal?: AbortSignal;
}): Promise<HostFetchResponse> {
  if (!fetch) {
    throw new CodeModeFetchError(
      'fetch is not enabled for this code-mode tool.',
    );
  }

  throwIfAborted(signal);
  const { response, url } = await fetchWithPolicyRedirects({
    request: normalizeFetchRequest(request, policy),
    fetch,
    policy,
    signal,
    redirectsRemaining: policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
  });

  const maxResponseBytes = policy.maxResponseBytes ?? 1024 * 1024;
  validateContentLength(response, maxResponseBytes);
  const body = await readResponseBody(response, maxResponseBytes, signal);

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    url,
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
  };
}

async function fetchWithPolicyRedirects({
  request,
  fetch,
  policy,
  signal,
  redirectsRemaining,
}: {
  request: NormalizedFetchRequest;
  fetch: typeof globalThis.fetch;
  policy: CodeModeFetchPolicy;
  signal: AbortSignal | undefined;
  redirectsRemaining: number;
}): Promise<{ response: Response; url: string }> {
  const response = await fetchOnce(request, fetch, signal);
  const responseUrl = response.url || request.url;
  const url = validateUrl(responseUrl, policy);

  if (!REDIRECT_STATUSES.has(response.status)) {
    return { response, url };
  }

  if (policy.allowRedirects !== true) {
    return { response, url };
  }

  const location = response.headers.get('location');
  if (location === null) {
    return { response, url };
  }

  if (redirectsRemaining <= 0) {
    const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    throw new CodeModeFetchError(
      `fetch exceeded the ${maxRedirects} redirect limit.`,
      { maxRedirects },
    );
  }

  const nextUrl = new URL(location, url).href;
  const nextRequest = normalizeRedirectRequest(
    response.status,
    request,
    nextUrl,
    policy,
  );
  void response.body?.cancel().catch(() => undefined);
  return await fetchWithPolicyRedirects({
    request: nextRequest,
    fetch,
    policy,
    signal,
    redirectsRemaining: redirectsRemaining - 1,
  });
}

async function fetchOnce(
  request: NormalizedFetchRequest,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const requestInit: RequestInit = {
    method: request.method,
    redirect: 'manual',
    ...(request.headers !== undefined ? { headers: request.headers } : {}),
    ...(request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    request.body !== undefined
      ? { body: request.body }
      : {}),
    ...(signal !== undefined ? { signal } : {}),
  };

  try {
    return await fetch(request.url, requestInit);
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
}

function normalizeFetchRequest(
  request: HostFetchRequest,
  policy: CodeModeFetchPolicy,
): NormalizedFetchRequest {
  const url = validateUrl(request.url, policy);
  const method = (request.method ?? 'GET').toUpperCase();
  validateMethod(method, policy);
  return compactRequest({
    url,
    method,
    ...(request.headers !== undefined ? { headers: request.headers } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
  });
}

function normalizeRedirectRequest(
  status: number,
  request: NormalizedFetchRequest,
  url: string,
  policy: CodeModeFetchPolicy,
): NormalizedFetchRequest {
  let method = request.method;
  let body = request.body;
  let headers = request.headers;

  if (
    status === 303 ||
    ((status === 301 || status === 302) && method === 'POST')
  ) {
    method = 'GET';
    body = undefined;
    headers = removeBodyHeaders(headers);
  }

  return normalizeFetchRequest(
    compactRequest({
      url,
      method,
      ...(headers !== undefined ? { headers } : {}),
      ...(body !== undefined ? { body } : {}),
    }),
    policy,
  );
}

function validateMethod(method: string, policy: CodeModeFetchPolicy): void {
  const allowedMethods = policy.allowedMethods?.map(value =>
    value.toUpperCase(),
  ) ?? ['GET', 'HEAD'];
  if (!allowedMethods.includes(method)) {
    throw new CodeModeFetchError(`fetch method "${method}" is not allowed.`, {
      method,
      allowedMethods,
    });
  }
}

function removeBodyHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (headers === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) =>
        key.toLowerCase() !== 'content-length' &&
        key.toLowerCase() !== 'content-type',
    ),
  );
}

function compactRequest(
  request: NormalizedFetchRequest,
): NormalizedFetchRequest {
  return request;
}

function validateUrl(urlValue: string, policy: CodeModeFetchPolicy): string {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new CodeModeFetchError(`Invalid fetch URL: ${urlValue}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CodeModeFetchError(
      'Only http and https fetch URLs are allowed.',
      {
        url: urlValue,
      },
    );
  }

  if (url.username !== '' || url.password !== '') {
    throw new CodeModeFetchError(
      'Fetch URLs with embedded credentials are not allowed.',
      {
        url: url.href,
      },
    );
  }

  const allowedByOrigin =
    policy.allowedOrigins?.some(origin => origin === url.origin) ?? false;
  const allowedByPrefix =
    policy.allowedUrlPrefixes?.some(prefix =>
      urlMatchesPrefix(url, validateUrlPrefix(prefix)),
    ) ?? false;

  if (!allowedByOrigin && !allowedByPrefix) {
    throw new CodeModeFetchError(`fetch URL is not allowed: ${url.href}`, {
      url: url.href,
      allowedOrigins: policy.allowedOrigins,
      allowedUrlPrefixes: policy.allowedUrlPrefixes,
    });
  }

  return url.href;
}

function validateUrlPrefix(prefix: string): URL {
  let prefixUrl: URL;
  try {
    prefixUrl = new URL(prefix);
  } catch {
    throw new CodeModeFetchError(
      `Invalid allowedUrlPrefixes entry: ${prefix}`,
      {
        prefix,
      },
    );
  }

  if (prefixUrl.protocol !== 'http:' && prefixUrl.protocol !== 'https:') {
    throw new CodeModeFetchError(
      'allowedUrlPrefixes entries must use http or https.',
      { prefix },
    );
  }

  if (prefixUrl.username !== '' || prefixUrl.password !== '') {
    throw new CodeModeFetchError(
      'allowedUrlPrefixes entries with embedded credentials are not allowed.',
      { prefix },
    );
  }

  if (prefixUrl.search !== '' || prefixUrl.hash !== '') {
    throw new CodeModeFetchError(
      'allowedUrlPrefixes entries must not include query strings or fragments.',
      { prefix },
    );
  }

  return prefixUrl;
}

function urlMatchesPrefix(url: URL, prefixUrl: URL): boolean {
  if (url.origin !== prefixUrl.origin) {
    return false;
  }

  if (url.pathname === prefixUrl.pathname) {
    return true;
  }

  const prefixPath = prefixUrl.pathname.endsWith('/')
    ? prefixUrl.pathname
    : `${prefixUrl.pathname}/`;
  return url.pathname.startsWith(prefixPath);
}

function validateContentLength(
  response: Response,
  maxResponseBytes: number,
): void {
  const contentLength = response.headers.get('content-length');
  if (contentLength === null) {
    return;
  }

  const bytes = Number(contentLength);
  if (Number.isFinite(bytes) && bytes > maxResponseBytes) {
    throw new CodeModeFetchError(
      `fetch response exceeds the ${maxResponseBytes} byte size limit.`,
      { bytes, maxResponseBytes },
    );
  }
}

async function readResponseBody(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  throwIfAborted(signal);

  if (
    response.body !== null &&
    response.body !== undefined &&
    typeof response.body.getReader === 'function'
  ) {
    return await readStreamBody(response.body, maxResponseBytes, signal);
  }

  const body = await withAbort(response.text(), signal);
  const bytes = new TextEncoder().encode(body).byteLength;
  if (bytes > maxResponseBytes) {
    throw new CodeModeFetchError(
      `fetch response exceeds the ${maxResponseBytes} byte size limit.`,
      { bytes, maxResponseBytes },
    );
  }
  return body;
}

async function readStreamBody(
  stream: ReadableStream<Uint8Array>,
  maxResponseBytes: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await withAbort(reader.read(), signal);
      if (done) {
        break;
      }
      if (value === undefined) {
        continue;
      }

      bytes += value.byteLength;
      if (bytes > maxResponseBytes) {
        const error = new CodeModeFetchError(
          `fetch response exceeds the ${maxResponseBytes} byte size limit.`,
          { bytes, maxResponseBytes },
        );
        void reader.cancel(error).catch(() => undefined);
        throw error;
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) {
    return await promise;
  }

  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

function createAbortError(signal: AbortSignal): CodeModeFetchError {
  const reason = signal.reason;
  return new CodeModeFetchError('fetch was aborted.', {
    reason:
      reason instanceof Error
        ? { name: reason.name, message: reason.message }
        : String(reason ?? 'aborted'),
  });
}
