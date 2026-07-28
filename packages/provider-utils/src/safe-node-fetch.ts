import type { FetchFunction } from './fetch-function';
import { validateDownloadAddress } from './validate-download-url';

type LookupAddress = {
  address: string;
  family: number;
};

type LookupOptions = {
  all?: boolean;
  family?: number;
  hints?: number;
  order?: 'ipv4first' | 'ipv6first' | 'verbatim';
  verbatim?: boolean;
};

type Lookup = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: LookupAddress[],
  ) => void,
) => void;

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  addresses: LookupAddress[],
) => void;

/**
 * Creates a DNS lookup hook that validates every returned address before
 * returning those exact addresses to the HTTP connector. Because resolution
 * and validation happen inside the connector, the socket is pinned to the
 * validated result and DNS rebinding cannot introduce a second lookup.
 */
export function createSafeLookup(lookup: Lookup) {
  return (
    hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ): void => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }

      try {
        if (addresses.length === 0) {
          throw new Error(`Hostname ${hostname} did not resolve to an address`);
        }

        for (const { address, family } of addresses) {
          validateDownloadAddress({ address, family, hostname });
        }

        callback(null, addresses);
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)), []);
      }
    });
  };
}

let safeNodeFetchPromise: Promise<FetchFunction> | undefined;
const initialGlobalFetch = globalThis.fetch;
const initialGlobalFetchIsNodeDefault = isNodeDefaultFetch(initialGlobalFetch);

export function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.release?.name === 'node' &&
    process.versions?.bun == null
  );
}

export async function getDefaultDownloadFetch(): Promise<FetchFunction> {
  if (
    !isNodeRuntime() ||
    !initialGlobalFetchIsNodeDefault ||
    globalThis.fetch !== initialGlobalFetch
  ) {
    return globalThis.fetch;
  }

  return (safeNodeFetchPromise ??= createSafeNodeFetch());
}

function isNodeDefaultFetch(fetch: FetchFunction): boolean {
  const source = Function.prototype.toString.call(fetch);
  return (
    source.includes('internal/deps/undici') ||
    source.includes('lazy loading of undici')
  );
}

async function createSafeNodeFetch(): Promise<FetchFunction> {
  const [{ Agent, fetch }, { lookup }] = await Promise.all([
    import('undici'),
    import('node:dns'),
  ]);

  const dispatcher = new Agent({
    connect: {
      lookup: createSafeLookup(lookup as Lookup) as never,
    },
  });

  return ((input, init) =>
    fetch(
      input as Parameters<typeof fetch>[0],
      {
        ...init,
        dispatcher,
      } as Parameters<typeof fetch>[1],
    ) as unknown as Promise<Response>) satisfies FetchFunction;
}
