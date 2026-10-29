import { InvalidArgumentError } from 'ai';

/**
 * Normalizes a hostname for domain matching: lowercase, punycode (via the
 * WHATWG URL parser), and without a trailing dot so `example.com.` cannot
 * bypass a filter for `example.com`.
 */
function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '');
}

export function normalizeDomains({
  parameter,
  domains,
}: {
  parameter: string;
  domains: string[];
}): string[] {
  return domains.map(domain => {
    const trimmed = domain.trim();

    // Entries are bare domains: no scheme, port, path, credentials, or wildcards.
    if (trimmed === '' || /[\s/\\:*@?#[\]]/.test(trimmed)) {
      throw new InvalidArgumentError({
        parameter,
        value: domains,
        message: `Invalid domain "${domain}". Use bare domains such as "example.com"; subdomains are included automatically.`,
      });
    }

    let hostname: string;
    try {
      hostname = new URL(`https://${trimmed}`).hostname;
    } catch {
      throw new InvalidArgumentError({
        parameter,
        value: domains,
        message: `Invalid domain "${domain}".`,
      });
    }

    return normalizeHostname(hostname);
  });
}

export function createDomainFilter({
  allowedDomains,
  blockedDomains,
}: {
  allowedDomains: string[] | undefined;
  blockedDomains: string[] | undefined;
}): (url: URL) => boolean {
  const matches = (hostname: string, domains: string[]) =>
    domains.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`),
    );

  return url => {
    const hostname = normalizeHostname(url.hostname);

    if (allowedDomains !== undefined) {
      return matches(hostname, allowedDomains);
    }

    if (blockedDomains !== undefined) {
      return !matches(hostname, blockedDomains);
    }

    return true;
  };
}
