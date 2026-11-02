import { describe, expect, it, vi } from 'vitest';
import { DownloadError } from './download-error';
import { createSafeLookup } from './safe-node-fetch';

type Address = { address: string; family: number };

describe('module initialization', () => {
  it('succeeds when the global fetch function is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', undefined);

    try {
      await expect(import('./safe-node-fetch')).resolves.toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('getDefaultDownloadFetch outside Node.js', () => {
  it.each([
    { runtime: 'browser', process: undefined },
    { runtime: 'edge', process: { versions: {} } },
    {
      runtime: 'framework edge with a Node-compatible process',
      process: { release: { name: 'node' }, versions: { node: '24.0.0' } },
      edgeRuntime: 'edge-runtime',
    },
    {
      runtime: 'bun',
      process: { release: { name: 'node' }, versions: { bun: '1.3.0' } },
    },
    {
      runtime: 'deno with a Node-compatible process',
      process: {
        release: { name: 'node' },
        versions: { node: '24.0.0', deno: '2.4.0', uv: '1.51.0' },
      },
    },
    {
      runtime: 'Workers process-v2 without navigator',
      process: {
        title: 'workerd',
        release: { name: 'node', lts: true, sourceUrl: '', headersUrl: '' },
        versions: { node: '24.0.0', uv: '', v8: '', undici: '' },
      },
    },
  ])('uses global fetch in $runtime', async ({ process, edgeRuntime }) => {
    const { getDefaultDownloadFetch } = await import('./safe-node-fetch');
    const fetchMock = vi.fn().mockResolvedValue(new Response('content'));
    const getBuiltinModule = vi.fn(() => {
      throw new Error('Unexpected Node-only module load');
    });
    vi.stubGlobal('EdgeRuntime', edgeRuntime);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal(
      'process',
      process == null ? undefined : { ...process, getBuiltinModule },
    );

    try {
      const fetch = await getDefaultDownloadFetch();
      const response = await fetch('https://files.example.com/file');
      await expect(response.text()).resolves.toBe('content');
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        'https://files.example.com/file',
      );
      expect(getBuiltinModule).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function createLookup(addresses: Address[]) {
  const lookup = vi.fn((_hostname, options, callback) => {
    callback(null, addresses);
  });

  return {
    lookup,
    safeLookup: createSafeLookup(lookup),
  };
}

function runLookup(addresses: Address[]) {
  const { lookup, safeLookup } = createLookup(addresses);

  return {
    lookup,
    result: new Promise<Address[]>((resolve, reject) => {
      safeLookup('files.example.com', { all: true }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    }),
  };
}

describe('createSafeLookup', () => {
  it('returns the validated addresses to the connector', async () => {
    const addresses = [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
    const { lookup, result } = runLookup(addresses);

    await expect(result).resolves.toEqual(addresses);
    expect(lookup).toHaveBeenCalledWith(
      'files.example.com',
      { all: true },
      expect.any(Function),
    );
  });

  it('returns one address when the connector does not request all', async () => {
    const addresses = [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
    const { lookup, safeLookup } = createLookup(addresses);
    const result = new Promise<Address>((resolve, reject) => {
      safeLookup('files.example.com', {}, (error, address, family) => {
        if (error) {
          reject(error);
        } else {
          resolve({ address, family });
        }
      });
    });

    await expect(result).resolves.toEqual(addresses[0]);
    expect(lookup).toHaveBeenCalledWith(
      'files.example.com',
      { all: true },
      expect.any(Function),
    );
  });

  it('blocks a hostname that resolves to a private address', async () => {
    const { result } = runLookup([{ address: '127.0.0.1', family: 4 }]);

    await expect(result).rejects.toThrow(DownloadError);
  });

  it('blocks mixed DNS results when any address is private', async () => {
    const { result } = runLookup([
      { address: '8.8.8.8', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(result).rejects.toThrow(
      'resolved to disallowed IP address 169.254.169.254',
    );
  });

  it('blocks private IPv6 DNS results', async () => {
    const { result } = runLookup([{ address: '::1', family: 6 }]);

    await expect(result).rejects.toThrow(
      'resolved to disallowed IP address ::1',
    );
  });
});
