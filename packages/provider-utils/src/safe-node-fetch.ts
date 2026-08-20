import type * as nodeDnsModule from 'node:dns';
import type * as nodeModule from 'node:module';
import type * as undiciModule from 'undici';
import type { FetchFunction } from './fetch-function';
import { validateDownloadAddress } from './validate-download-url';

type NodeDns = typeof nodeDnsModule;
type NodeModule = typeof nodeModule;
type Undici = typeof undiciModule;

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

type LookupAllCallback = (
  error: NodeJS.ErrnoException | null,
  addresses: LookupAddress[],
) => void;

type LookupOneCallback = (
  error: NodeJS.ErrnoException | null,
  address: string,
  family: number,
) => void;

type SafeLookup = {
  (
    hostname: string,
    options: LookupOptions & { all: true },
    callback: LookupAllCallback,
  ): void;
  (
    hostname: string,
    options: LookupOptions & { all?: false },
    callback: LookupOneCallback,
  ): void;
};

/**
 * Creates a DNS lookup hook that validates every returned address before
 * returning the callback shape requested by the HTTP connector. Because
 * resolution and validation happen inside the connector, the socket is pinned
 * to the validated result and DNS rebinding cannot introduce a second lookup.
 */
export function createSafeLookup(lookup: Lookup): SafeLookup {
  return ((
    hostname: string,
    options: LookupOptions,
    callback: LookupAllCallback | LookupOneCallback,
  ): void => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        (callback as (error: Error) => void)(error);
        return;
      }

      try {
        const [firstAddress] = addresses;

        if (firstAddress == null) {
          throw new Error(`Hostname ${hostname} did not resolve to an address`);
        }

        for (const { address, family } of addresses) {
          validateDownloadAddress({ address, family, hostname });
        }

        if (options.all === true) {
          (callback as LookupAllCallback)(null, addresses);
        } else {
          (callback as LookupOneCallback)(
            null,
            firstAddress.address,
            firstAddress.family,
          );
        }
      } catch (error) {
        (callback as (error: Error) => void)(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
  }) as SafeLookup;
}

let safeNodeFetchPromise: Promise<FetchFunction> | undefined;
const initialGlobalFetch = globalThis.fetch;
const initialGlobalFetchIsNodeDefault = isNodeDefaultFetch(initialGlobalFetch);

export function isNodeRuntime(): boolean {
  const runtimeProcess = globalThis.process as
    | {
        release?: { name?: string };
        versions?: { bun?: string };
      }
    | undefined;

  return (
    runtimeProcess?.release?.name === 'node' &&
    runtimeProcess.versions?.bun == null
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
  // Load Node-only modules indirectly so browser bundlers do not pull undici
  // and Node built-ins into the browser-facing provider-utils entry point.
  const [{ createRequire }, { lookup }] = await Promise.all([
    loadNodeModule<NodeModule>('node:module'),
    loadNodeModule<NodeDns>('node:dns'),
  ]);
  const { Agent, fetch } = createRequire(getCurrentModulePath())(
    'undici',
  ) as Undici;

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

async function loadNodeModule<T>(id: string): Promise<T> {
  const processWithBuiltins = globalThis.process as
    | {
        getBuiltinModule?: (id: string) => unknown;
      }
    | undefined;
  const builtinModule = processWithBuiltins?.getBuiltinModule?.(id);

  if (builtinModule == null) {
    // There is no bundle-safe way to load Node built-ins without
    // process.getBuiltinModule (Node <20.16): Metro rejects non-static
    // import() expressions while parsing, and Next.js Edge Runtime rejects
    // the Function-constructor shim during static analysis. Throw rather
    // than ship either, matching the v7 implementation. See #18545, #18559.
    throw new Error(`Node.js built-in module ${id} is unavailable`);
  }

  return builtinModule as T;
}

function getCurrentModulePath(): string {
  // `import.meta.url` breaks when provider-utils is rebundled as CommonJS.
  // The caller frame points at this package when loaded directly and at the
  // consuming bundle when inlined, giving createRequire the correct base path.
  const originalPrepareStackTrace = Error.prepareStackTrace;

  try {
    Error.prepareStackTrace = (_error, callSites) => callSites as never;

    const error = new Error('Capture current module path');
    Error.captureStackTrace(error, getCurrentModulePath);
    const [caller] = error.stack as unknown as NodeJS.CallSite[];
    const fileName = caller?.getFileName();

    if (fileName == null) {
      throw new Error('Unable to determine the current module path');
    }

    return fileName;
  } finally {
    Error.prepareStackTrace = originalPrepareStackTrace;
  }
}
