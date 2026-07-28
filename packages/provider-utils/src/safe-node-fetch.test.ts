import { describe, expect, it, vi } from 'vitest';
import { DownloadError } from './download-error';
import { createSafeLookup } from './safe-node-fetch';

type Address = { address: string; family: number };

function runLookup(addresses: Address[]) {
  const lookup = vi.fn((_hostname, options, callback) => {
    callback(null, addresses);
  });
  const safeLookup = createSafeLookup(lookup);

  return {
    lookup,
    result: new Promise<Address[]>((resolve, reject) => {
      safeLookup('files.example.com', {}, (error, result) => {
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
