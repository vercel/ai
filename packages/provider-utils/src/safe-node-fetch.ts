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

// Exported for transport tests, not from the package entrypoint.
export async function createSafeNodeFetch({
  connectTimeout = 10_000,
  idleTimeout = 300_000,
  headersTimeout = 300_000,
} = {}): Promise<FetchFunction> {
  const { lookup } = process.getBuiltinModule('node:dns');
  const http = process.getBuiltinModule('node:http');
  const https = process.getBuiltinModule('node:https');
  const { Readable, PassThrough, pipeline, addAbortSignal } =
    process.getBuiltinModule('node:stream');
  const {
    createGunzip,
    createInflate,
    createInflateRaw,
    createBrotliDecompress,
  } = process.getBuiltinModule('node:zlib');
  const safeLookup = createSafeLookup(lookup);
  const httpAgent = new http.Agent({ keepAlive: true, lookup: safeLookup });
  const httpsAgent = new https.Agent({ keepAlive: true, lookup: safeLookup });

  async function* decode(
    source: AsyncIterable<Uint8Array>,
    encoding: string,
    signal: AbortSignal,
  ): AsyncGenerator<Uint8Array> {
    const iterator = source[Symbol.asyncIterator]();
    const first = await iterator.next();
    // Some servers label an empty response as compressed without writing a
    // compression header. Peek without buffering the rest of the download.
    if (first.done) return;
    const decoder =
      encoding === 'br'
        ? createBrotliDecompress()
        : encoding === 'gzip' || encoding === 'x-gzip'
          ? createGunzip()
          : // Legacy servers also send raw DEFLATE under the "deflate" coding.
            (first.value[0] & 0x0f) === 8
            ? createInflate()
            : createInflateRaw();
    const compressed = Readable.from(
      (async function* () {
        yield first.value;
        for (
          let next = await iterator.next();
          !next.done;
          next = await iterator.next()
        ) {
          yield next.value;
        }
      })(),
    );
    addAbortSignal(signal, compressed);
    addAbortSignal(signal, decoder);
    pipeline(compressed, decoder, () => {});
    try {
      yield* decoder;
    } finally {
      compressed.destroy();
      decoder.destroy();
      await iterator.return?.();
    }
  }

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

    if (
      request.cache !== 'default' ||
      (request.referrer !== '' && request.referrer !== 'about:client') ||
      request.keepalive
    ) {
      throw new TypeError(
        'Unsupported download cache, referrer, or keepalive option',
      );
    }

    const headers = new Headers(request.headers);
    const requestBody = init?.body;
    const length =
      typeof requestBody === 'string'
        ? new TextEncoder().encode(requestBody).byteLength
        : requestBody instanceof URLSearchParams
          ? new TextEncoder().encode(requestBody.toString()).byteLength
          : requestBody instanceof Blob
            ? requestBody.size
            : requestBody instanceof ArrayBuffer ||
                ArrayBuffer.isView(requestBody)
              ? requestBody.byteLength
              : undefined;
    if (headers.has('transfer-encoding')) {
      throw new TypeError('The download transport manages Transfer-Encoding');
    }
    const declaredLength = headers.get('content-length');
    if (
      declaredLength != null &&
      (!/^\d+$/.test(declaredLength) ||
        !Number.isSafeInteger(Number(declaredLength)) ||
        (length != null && Number(declaredLength) !== length) ||
        (request.body == null && Number(declaredLength) !== 0))
    ) {
      throw new TypeError('Invalid download request Content-Length');
    }
    // A stream has no known length; reject a supplied length instead of risking
    // truncation or writing excess bytes into a reused HTTP connection.
    if (request.body != null && length == null && declaredLength != null) {
      throw new TypeError(
        'Content-Length requires a known download request body size',
      );
    }
    if (length != null && !headers.has('content-length')) {
      headers.set('content-length', String(length));
    }
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
          clearTimeout(headersTimer);
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
              const encodings =
                responseHeaders
                  .get('content-encoding')
                  ?.toLowerCase()
                  .split(',')
                  .map(value => value.trim()) ?? [];
              // An unknown coding makes the entire stack opaque, like fetch.
              if (
                encodings.length &&
                encodings.every(encoding =>
                  ['gzip', 'x-gzip', 'deflate', 'x-deflate', 'br'].includes(
                    encoding,
                  ),
                )
              ) {
                const decodedBody = new PassThrough();
                body = decodedBody;
                const decoding = new AbortController();
                body.once('close', () => {
                  decoding.abort();
                  if (!incoming.complete) incoming.destroy();
                });
                pipeline(
                  incoming,
                  async function* (source) {
                    let decoded: AsyncIterable<Uint8Array> = source;
                    for (const encoding of encodings.reverse()) {
                      decoded = decode(decoded, encoding, decoding.signal);
                    }
                    yield* decoded;
                  },
                  decodedBody,
                  error => {
                    if (error) outgoing.destroy(error);
                  },
                );
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
      // Cover DNS/TCP/TLS setup separately from socket inactivity. The latter
      // also bounds header waits, but permits arbitrarily long active streams.
      const timer = setTimeout(
        () => outgoing.destroy(new Error('Download connection timed out')),
        connectTimeout,
      );
      timer.unref();
      const headersTimer = setTimeout(
        () =>
          outgoing.destroy(new Error('Download response headers timed out')),
        headersTimeout,
      );
      headersTimer.unref();
      outgoing.once('socket', socket => {
        if (!socket.connecting) clearTimeout(timer);
        else
          socket.once(
            url.protocol === 'https:' ? 'secureConnect' : 'connect',
            () => clearTimeout(timer),
          );
      });
      outgoing.setTimeout(idleTimeout, () =>
        outgoing.destroy(new Error('Download socket timed out')),
      );
      outgoing.once('upgrade', (_response, socket) => {
        socket.destroy();
        const error = new TypeError(
          'Download protocol upgrades are unsupported',
        );
        outgoing.destroy(error);
        reject(error);
      });
      outgoing.once('close', () => {
        clearTimeout(timer);
        clearTimeout(headersTimer);
        upload?.destroy();
      });
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
