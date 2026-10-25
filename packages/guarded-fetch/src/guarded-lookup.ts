import { isIP } from 'node:net';
import { DownloadError, validateDownloadUrl } from '@ai-sdk/provider-utils';

type LookupAddress = {
  address: string;
  family: number;
};

type LookupOptions = {
  all?: boolean;
  family?: number | 'IPv4' | 'IPv6';
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

type GuardedLookup = {
  (
    hostname: string,
    options: LookupOptions & { all: true },
    callback: LookupAllCallback,
  ): void;
  (
    hostname: string,
    options: LookupOptions,
    callback: LookupOneCallback | LookupAllCallback,
  ): void;
};

/**
 * Creates a DNS lookup hook that validates every returned address before
 * returning the callback shape requested by the HTTP connector. Because
 * resolution and validation happen inside the connector, the socket is pinned
 * to the validated result and DNS rebinding cannot introduce a second lookup.
 */
export function createGuardedLookup(lookup: Lookup): GuardedLookup {
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
          if (isIP(address) !== family || (family !== 4 && family !== 6)) {
            throw new Error('Invalid DNS address');
          }
          validateDownloadUrl(
            `http://${family === 6 ? `[${address}]` : address}/`,
          );
        }
      } catch (cause) {
        (callback as (error: Error) => void)(
          new DownloadError({
            url: hostname,
            message: `Hostname ${hostname} resolved to a disallowed or invalid address`,
            cause,
          }),
        );
        return;
      }

      const [firstAddress] = addresses;
      if (options.all === true) {
        (callback as LookupAllCallback)(null, addresses);
      } else {
        (callback as LookupOneCallback)(
          null,
          firstAddress.address,
          firstAddress.family,
        );
      }
    });
  }) as GuardedLookup;
}
