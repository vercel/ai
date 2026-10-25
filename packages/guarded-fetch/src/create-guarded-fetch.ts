import dns from 'node:dns';
import {
  validateDownloadUrl,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import {
  Agent,
  FormData as UndiciFormData,
  fetch as undiciFetch,
  type RequestInit,
} from 'undici';
import { createGuardedLookup } from './guarded-lookup';

export type GuardedFetchOptions = {
  /**
   * Developer-configured origins allowed to reach private addresses. Never
   * derive these from model output or provider responses. Paths are ignored;
   * the exemption covers the entire exact origin (scheme, host, and port).
   */
  trustedOrigins?: readonly string[];
};

export type GuardedFetch = FetchFunction & {
  /** Close owned connection pools after all responses have been consumed. */
  close(): Promise<void>;
};

/**
 * Creates a Node.js fetch transport that checks URL targets and validates all
 * DNS results inside the connector, pinning sockets to the checked addresses.
 * Uses its own Undici fetch and agents, independently of global fetch wrappers.
 *
 * Automatic redirects are disabled: `follow` is treated as `error`. Use
 * `manual` with the SDK's redirect helpers to validate each hop and strip
 * credentials. This transport alone does not sanitize request headers.
 */
export function createGuardedFetch({
  trustedOrigins = [],
}: GuardedFetchOptions = {}): GuardedFetch {
  const origins = new Set(
    trustedOrigins.map(origin => {
      const url = new URL(origin);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username !== '' ||
        url.password !== ''
      ) {
        throw new TypeError(
          'Trusted origins must be HTTP(S) URLs without credentials',
        );
      }
      return url.origin;
    }),
  );
  const guardedAgent = new Agent({
    connect: { lookup: createGuardedLookup(dns.lookup) },
  });
  const trustedAgent = origins.size === 0 ? undefined : new Agent();
  let closePromise: Promise<void> | undefined;

  const guardedFetch: FetchFunction = async (input, init) => {
    // Normalize native Request objects before crossing into npm Undici, whose
    // Request class has a different brand from Node's built-in Request.
    const request =
      typeof input === 'string' || input instanceof URL
        ? undefined
        : new Request(input, init);
    const url = request?.url ?? input.toString();
    const trusted = origins.has(new URL(url).origin);
    if (!trusted) {
      validateDownloadUrl(url);
    }

    // Keep original body types for URL inputs so Undici can calculate content
    // lengths and encode FormData itself instead of turning every upload into
    // a chunked stream. Native Request inputs already contain an encoded body.
    let body = init?.body as RequestInit['body'];
    if (init?.body instanceof FormData) {
      const formData = new UndiciFormData();
      for (const [key, value] of init.body) {
        if (typeof value === 'string') {
          formData.append(key, value);
        } else {
          formData.append(key, value, value.name);
        }
      }
      body = formData;
    }
    const requestInit: RequestInit =
      request == null
        ? {
            ...init,
            headers:
              init?.headers == null
                ? undefined
                : [...new Headers(init.headers)],
            body,
          }
        : {
            method: request.method,
            headers: [...request.headers],
            body:
              request.keepalive && request.body != null
                ? await request.arrayBuffer()
                : (request.body as RequestInit['body']),
            signal: request.signal,
            cache: request.cache,
            credentials: request.credentials,
            integrity: request.integrity,
            keepalive: request.keepalive,
            mode: request.mode,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            duplex: 'half',
            redirect: request.redirect,
          };

    return (await undiciFetch(url, {
      ...requestInit,
      redirect: requestInit.redirect === 'manual' ? 'manual' : 'error',
      // Never accept a caller-supplied dispatcher that could bypass the guard.
      dispatcher: trusted ? trustedAgent : guardedAgent,
    })) as unknown as Response;
  };

  return Object.assign(guardedFetch, {
    close() {
      return (closePromise ??= Promise.all([
        guardedAgent.close(),
        trustedAgent?.close(),
      ]).then(() => undefined));
    },
  });
}
