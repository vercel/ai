import type { LookupAddress, LookupAllOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { Readable } from 'node:stream';
import type { FetchFunction } from './fetch-function';
import { isNodeRuntime } from './is-node-runtime';
import { validateDownloadAddress } from './validate-download-url';

/** Validate every DNS result inside the connector, then connect to those same addresses. */
export function createSafeLookup(
  lookup: (
    hostname: string,
    options: LookupAllOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      addresses: LookupAddress[],
    ) => void,
  ) => void,
): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }

      const firstAddress = addresses[0];
      try {
        if (firstAddress == null) {
          throw new Error(`Hostname ${hostname} did not resolve to an address`);
        }
        for (const { address, family } of addresses) {
          validateDownloadAddress({ address, family, hostname });
        }
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)), []);
        return;
      }

      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, firstAddress.address, firstAddress.family);
      }
    });
  };
}

let safeNodeFetchPromise: Promise<FetchFunction> | undefined;

export async function getDefaultDownloadFetch(): Promise<FetchFunction> {
  if (!isNodeRuntime()) {
    return globalThis.fetch;
  }

  // Global fetch wrappers cannot be relied on to preserve the agent
  // that pins connections to validated DNS results.
  return (safeNodeFetchPromise ??= createSafeNodeFetch());
}

async function createSafeNodeFetch(): Promise<FetchFunction> {
  const { lookup } = process.getBuiltinModule('node:dns');
  const http = process.getBuiltinModule('node:http');
  const https = process.getBuiltinModule('node:https');
  const { Readable, pipeline } = process.getBuiltinModule('node:stream');
  const { createGunzip, createInflate, createBrotliDecompress } =
    process.getBuiltinModule('node:zlib');
  const safeLookup = createSafeLookup(lookup);
  const httpAgent = new http.Agent({ keepAlive: true, lookup: safeLookup });
  const httpsAgent = new https.Agent({ keepAlive: true, lookup: safeLookup });

  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const signal = init?.signal ?? request.signal;
    signal.throwIfAborted();

    // Inline data cannot initiate a network connection. Delegate its parsing to
    // the runtime rather than implementing a second data-URL parser.
    if (url.protocol === 'data:') {
      return globalThis.fetch(request);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError(`Unsupported download protocol: ${url.protocol}`);
    }
    if (request.integrity) {
      throw new TypeError(
        'The download transport does not support integrity checks',
      );
    }

    const headers = new Headers(request.headers);
    if (!headers.has('accept')) headers.set('accept', '*/*');
    if (!headers.has('accept-encoding'))
      headers.set('accept-encoding', 'gzip, deflate, br');

    return new Promise<Response>((resolve, reject) => {
      let body: Readable | undefined;
      let upload: Readable | undefined;
      const transport = url.protocol === 'https:' ? https : http;
      const outgoing = transport.request(
        url,
        {
          method: request.method,
          headers: Object.fromEntries(headers),
          agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
          signal,
        },
        incoming => {
          try {
            const status = incoming.statusCode;
            if (status == null)
              throw new TypeError('Missing HTTP response status');
            // The SDK validates each redirect itself. Never follow a hop here,
            // including when a caller accidentally leaves the default "follow".
            if (
              [301, 302, 303, 307, 308].includes(status) &&
              request.redirect !== 'manual'
            ) {
              throw new TypeError(
                'Download redirects must be handled by the validated redirect loop',
              );
            }
            const responseHeaders = new Headers();
            for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
              responseHeaders.append(
                incoming.rawHeaders[i],
                incoming.rawHeaders[i + 1],
              );
            }

            const hasBody =
              request.method !== 'HEAD' && ![204, 205, 304].includes(status);
            if (hasBody) {
              body = incoming;
              const encoding = responseHeaders
                .get('content-encoding')
                ?.trim()
                .toLowerCase();
              const decoder =
                encoding === 'gzip' || encoding === 'x-gzip'
                  ? createGunzip()
                  : encoding === 'deflate' || encoding === 'x-deflate'
                    ? createInflate()
                    : encoding === 'br'
                      ? createBrotliDecompress()
                      : undefined;
              if (decoder) {
                // pipeline propagates decoding errors and cancellation in both
                // directions, so cancelling the Web Stream closes the socket.
                body = decoder;
                pipeline(incoming, decoder, error => {
                  if (error) outgoing.destroy(error);
                });
              }
            } else {
              incoming.resume();
            }
            // Node and DOM declarations disagree on Web Stream iterator methods.
            const response = new Response(
              body == null ? null : (Readable.toWeb(body) as ReadableStream),
              {
                status,
                statusText: incoming.statusMessage,
                headers: responseHeaders,
              },
            );
            resolve(withResponseUrl(response, request.url));
          } catch (error) {
            incoming.destroy();
            outgoing.destroy();
            reject(error);
          }
        },
      );
      outgoing.once('close', () => upload?.destroy());
      outgoing.on('error', error => {
        const failure = signal.aborted ? signal.reason : error;
        upload?.destroy(error);
        body?.destroy(failure);
        reject(failure);
      });
      if (request.body == null) {
        outgoing.end();
      } else {
        upload = Readable.fromWeb(request.body as NodeReadableStream);
        upload.on('error', error => outgoing.destroy(error));
        upload.pipe(outgoing);
      }
    });
  };
}

function withResponseUrl(response: Response, url: string): Response {
  const clone = response.clone.bind(response);
  Object.defineProperties(response, {
    url: { value: url },
    type: { value: 'basic' },
    clone: { value: () => withResponseUrl(clone(), url) },
  });
  return response;
}
