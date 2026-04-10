import { DownloadError } from './download-error';

/**
 * Validates that a URL is safe to download from, blocking private/internal addresses
 * to prevent SSRF attacks.
 *
 * @param url - The URL string to validate.
 * @throws DownloadError if the URL is unsafe.
 */
export function validateDownloadUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DownloadError({
      url,
      message: `Invalid URL: ${url}`,
    });
  }

  // data: URLs are inline content, so they do not trigger a network fetch or SSRF risk.
  if (parsed.protocol === 'data:') {
    return;
  }

  // Only allow http and https network protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DownloadError({
      url,
      message: `URL scheme must be http, https, or data, got ${parsed.protocol}`,
    });
  }

  const hostname = parsed.hostname;

  // Block empty hostname
  if (!hostname) {
    throw new DownloadError({
      url,
      message: `URL must have a hostname`,
    });
  }

  // Block localhost, .local, .localhost, and .internal domains
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal')
  ) {
    throw new DownloadError({
      url,
      message: `URL with hostname ${hostname} is not allowed`,
    });
  }

  // Check for IPv6 addresses (enclosed in brackets in URLs)
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const ipv6 = hostname.slice(1, -1);
    if (isPrivateIPv6(ipv6)) {
      throw new DownloadError({
        url,
        message: `URL with IPv6 address ${hostname} is not allowed`,
      });
    }
    return;
  }

  // Check for IPv4 addresses
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new DownloadError({
        url,
        message: `URL with IP address ${hostname} is not allowed`,
      });
    }
    return;
  }
}

function isIPv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    const num = Number(part);
    return (
      Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === part
    );
  });
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10 - Shared Address Space (RFC 6598, used in cloud CGNAT/VPCs)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 - IETF Protocol Assignments (RFC 6890)
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 - Documentation (TEST-NET-1, RFC 5737)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 - Benchmarking (RFC 2544)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 - Documentation (TEST-NET-2, RFC 5737)
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 - Documentation (TEST-NET-3, RFC 5737)
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 240.0.0.0/4 - Reserved for future use (RFC 1112)
  if (a >= 240) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 (loopback)
  if (normalized === '::1') return true;
  // :: (unspecified)
  if (normalized === '::') return true;

  // Check for IPv4-mapped addresses (::ffff:x.x.x.x or ::ffff:HHHH:HHHH)
  if (normalized.startsWith('::ffff:')) {
    const mappedPart = normalized.slice(7);
    // Dotted-decimal form: ::ffff:127.0.0.1
    if (isIPv4(mappedPart)) {
      return isPrivateIPv4(mappedPart);
    }
    // Hex form: ::ffff:7f00:1 (URL parser normalizes to this)
    const hexParts = mappedPart.split(':');
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!isNaN(high) && !isNaN(low)) {
        const a = (high >> 8) & 0xff;
        const b = high & 0xff;
        const c = (low >> 8) & 0xff;
        const d = low & 0xff;
        return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
      }
    }
  }

  // fc00::/7 (unique local addresses - fc00:: and fd00::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // fe80::/10 (link-local)
  if (normalized.startsWith('fe80')) return true;

  return false;
}
