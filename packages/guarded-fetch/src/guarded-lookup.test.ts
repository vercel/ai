import { describe, expect, it, vi } from 'vitest';
import { DownloadError } from '@ai-sdk/provider-utils';
import { createGuardedLookup } from './guarded-lookup';
type Address = { address: string; family: number };

function createLookup(addresses: Address[]) {
  const lookup = vi.fn((_hostname, options, callback) => {
    callback(null, addresses);
  });

  return {
    lookup,
    safeLookup: createGuardedLookup(lookup),
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

describe('createGuardedLookup', () => {
  it.each(
    [
      [],
      [{ address: 'not-an-ip', family: 4 }],
      [{ address: '8.8.8.8', family: 6 }],
      [{ address: '8.8.8.8', family: 0 }],
      [{ address: '::ffff:127.0.0.1', family: 6 }],
      [{ address: '64:ff9b::a00:1', family: 6 }],
    ].map(addresses => ({ addresses })),
  )(
    'fails closed for empty or invalid DNS results $addresses',
    async ({ addresses }) => {
      await expect(runLookup(addresses).result).rejects.toThrow(DownloadError);
    },
  );

  it('forwards lookup failures exactly once', () => {
    const error = Object.assign(new Error('DNS unavailable'), {
      code: 'ENOTFOUND',
    });
    const callback = vi.fn();
    createGuardedLookup((_hostname, _options, cb) => cb(error, []))(
      'files.example.com',
      { all: true },
      callback,
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith(error);
  });

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

    await expect(result).rejects.toThrow(DownloadError);
  });

  it('blocks private IPv6 DNS results', async () => {
    const { result } = runLookup([{ address: '::1', family: 6 }]);

    await expect(result).rejects.toThrow(DownloadError);
  });
});
