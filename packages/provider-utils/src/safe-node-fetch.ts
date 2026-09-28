import type { LookupAddress, LookupAllOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
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
  const { Agent: HttpAgent } = process.getBuiltinModule('node:http');
  const { Agent: HttpsAgent } = process.getBuiltinModule('node:https');
  const { Readable } = process.getBuiltinModule('node:stream');
  // Keep this literal import visible to deployment bundlers, and out of the
  // portable build. Using our own transport also bypasses patched global fetch.
  const { default: fetch } = await import('node-fetch');
  const safeLookup = createSafeLookup(lookup);
  const httpAgent = new HttpAgent({ keepAlive: true, lookup: safeLookup });
  const httpsAgent = new HttpsAgent({ keepAlive: true, lookup: safeLookup });

  return async (input, init) => {
    // Normalize native Request/Headers/body inputs before crossing into
    // node-fetch, which uses its own Fetch classes and Node streams.
    // The request stream assertion bridges the same Node/DOM type mismatch.
    const request = new Request(input, init);
    const response = await fetch(request.url, {
      method: request.method,
      headers: [...request.headers],
      body:
        request.body == null
          ? undefined
          : Readable.fromWeb(request.body as NodeReadableStream),
      signal: init?.signal ?? request.signal,
      redirect: request.redirect,
      agent: url => (url.protocol === 'https:' ? httpsAgent : httpAgent),
    });

    // node-fetch types its body as the broader NodeJS.ReadableStream interface.
    // Verify it is a Readable before using Node's Web Stream adapter.
    if (response.body != null && !(response.body instanceof Readable)) {
      throw new TypeError('Expected node-fetch to return a Node Readable');
    }
    // SDK consumers require Web Streams (getReader/cancel), not Node streams.
    const body =
      response.body == null ||
      request.method === 'HEAD' ||
      [204, 205, 304].includes(response.status)
        ? null
        : Readable.toWeb(response.body);
    if (body == null) {
      response.body?.resume();
    }
    // Node and DOM declarations disagree on Web Stream iterator methods;
    // both adapters use the same native Web Streams at runtime.
    const result = new Response(body as ReadableStream | null, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.entries(response.headers.raw()).flatMap(
        ([name, values]) =>
          values.map<[string, string]>(value => [name, value]),
      ),
    });
    // Response's constructor cannot set fetch metadata. Preserve it on clones
    // too, without replacing the native body consumption implementation.
    function withMetadata(value: Response): Response {
      const clone = value.clone.bind(value);
      Object.defineProperties(value, {
        url: { value: response.url },
        redirected: { value: response.redirected },
        type: { value: 'basic' },
        clone: { value: () => withMetadata(clone()) },
      });
      return value;
    }
    return withMetadata(result);
  };
}
