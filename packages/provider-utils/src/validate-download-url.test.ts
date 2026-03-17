import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateDownloadUrl } from './validate-download-url';
import { DownloadError } from './download-error';
import dns from 'node:dns';

// Mock dns.promises.lookup for DNS resolution tests
vi.mock('node:dns', () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

const mockLookup = dns.promises.lookup as ReturnType<typeof vi.fn>;

beforeEach(() => {
  // By default, resolve to a public IP so non-DNS tests pass
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateDownloadUrl', () => {
  describe('allowed URLs', () => {
    it('should allow https URLs', async () => {
      await expect(
        validateDownloadUrl('https://example.com/image.png'),
      ).resolves.not.toThrow();
    });

    it('should allow http URLs', async () => {
      await expect(
        validateDownloadUrl('http://example.com/image.png'),
      ).resolves.not.toThrow();
    });

    it('should allow public IP addresses', async () => {
      await expect(
        validateDownloadUrl('https://203.0.113.1/file'),
      ).resolves.not.toThrow();
    });

    it('should allow URLs with ports', async () => {
      await expect(
        validateDownloadUrl('https://example.com:8080/file'),
      ).resolves.not.toThrow();
    });
  });

  describe('blocked protocols', () => {
    it('should block file:// URLs', async () => {
      await expect(validateDownloadUrl('file:///etc/passwd')).rejects.toThrow(
        DownloadError,
      );
    });

    it('should block ftp:// URLs', async () => {
      await expect(
        validateDownloadUrl('ftp://example.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block javascript: URLs', async () => {
      await expect(validateDownloadUrl('javascript:alert(1)')).rejects.toThrow(
        DownloadError,
      );
    });

    it('should block data: URLs', async () => {
      await expect(
        validateDownloadUrl('data:text/plain,hello'),
      ).rejects.toThrow(DownloadError);
    });
  });

  describe('malformed URLs', () => {
    it('should block invalid URLs', async () => {
      await expect(validateDownloadUrl('not-a-url')).rejects.toThrow(
        DownloadError,
      );
    });
  });

  describe('blocked hostnames', () => {
    it('should block localhost', async () => {
      await expect(
        validateDownloadUrl('http://localhost/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block localhost with port', async () => {
      await expect(
        validateDownloadUrl('http://localhost:3000/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block .local domains', async () => {
      await expect(
        validateDownloadUrl('http://myhost.local/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block .localhost domains', async () => {
      await expect(
        validateDownloadUrl('http://app.localhost/file'),
      ).rejects.toThrow(DownloadError);
    });
  });

  describe('blocked IPv4 addresses', () => {
    it('should block 127.0.0.1 (loopback)', async () => {
      await expect(
        validateDownloadUrl('http://127.0.0.1/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block 127.x.x.x range', async () => {
      await expect(
        validateDownloadUrl('http://127.255.0.1/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block 10.x.x.x (private)', async () => {
      await expect(validateDownloadUrl('http://10.0.0.1/file')).rejects.toThrow(
        DownloadError,
      );
    });

    it('should block 172.16.x.x - 172.31.x.x (private)', async () => {
      await expect(
        validateDownloadUrl('http://172.16.0.1/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('http://172.31.255.255/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should allow 172.15.x.x and 172.32.x.x (public)', async () => {
      await expect(
        validateDownloadUrl('http://172.15.0.1/file'),
      ).resolves.not.toThrow();
      await expect(
        validateDownloadUrl('http://172.32.0.1/file'),
      ).resolves.not.toThrow();
    });

    it('should block 192.168.x.x (private)', async () => {
      await expect(
        validateDownloadUrl('http://192.168.1.1/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block 169.254.x.x (link-local / cloud metadata)', async () => {
      await expect(
        validateDownloadUrl('http://169.254.169.254/latest/meta-data/'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block 0.0.0.0', async () => {
      await expect(validateDownloadUrl('http://0.0.0.0/file')).rejects.toThrow(
        DownloadError,
      );
    });

    it('should block 100.64.0.0/10 (Carrier-Grade NAT)', async () => {
      await expect(
        validateDownloadUrl('http://100.64.0.1/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('http://100.127.255.255/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should allow 100.63.x.x and 100.128.x.x (outside CGNAT)', async () => {
      await expect(
        validateDownloadUrl('http://100.63.0.1/file'),
      ).resolves.not.toThrow();
      await expect(
        validateDownloadUrl('http://100.128.0.1/file'),
      ).resolves.not.toThrow();
    });

    it('should block 198.18.0.0/15 (benchmarking)', async () => {
      await expect(
        validateDownloadUrl('http://198.18.0.1/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('http://198.19.255.255/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should allow 198.17.x.x and 198.20.x.x (outside benchmarking)', async () => {
      await expect(
        validateDownloadUrl('http://198.17.0.1/file'),
      ).resolves.not.toThrow();
      await expect(
        validateDownloadUrl('http://198.20.0.1/file'),
      ).resolves.not.toThrow();
    });

    it('should block 240.0.0.0/4 (reserved)', async () => {
      await expect(
        validateDownloadUrl('http://240.0.0.1/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('http://255.255.255.255/file'),
      ).rejects.toThrow(DownloadError);
    });
  });

  describe('blocked IPv6 addresses', () => {
    it('should block ::1 (loopback)', async () => {
      await expect(validateDownloadUrl('http://[::1]/file')).rejects.toThrow(
        DownloadError,
      );
    });

    it('should block :: (unspecified)', async () => {
      await expect(validateDownloadUrl('http://[::]/file')).rejects.toThrow(
        DownloadError,
      );
    });

    it('should block fc00::/7 (unique local)', async () => {
      await expect(
        validateDownloadUrl('http://[fc00::1]/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('http://[fd12::1]/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block fe80::/10 (link-local)', async () => {
      await expect(
        validateDownloadUrl('http://[fe80::1]/file'),
      ).rejects.toThrow(DownloadError);
    });
  });

  describe('IPv4-mapped IPv6 addresses', () => {
    it('should block ::ffff:127.0.0.1', async () => {
      await expect(
        validateDownloadUrl('http://[::ffff:127.0.0.1]/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block ::ffff:10.0.0.1', async () => {
      await expect(
        validateDownloadUrl('http://[::ffff:10.0.0.1]/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block ::ffff:169.254.169.254', async () => {
      await expect(
        validateDownloadUrl('http://[::ffff:169.254.169.254]/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should allow ::ffff: with public IP', async () => {
      await expect(
        validateDownloadUrl('http://[::ffff:203.0.113.1]/file'),
      ).resolves.not.toThrow();
    });
  });

  describe('DNS rebinding protection', () => {
    it('should block hostnames that resolve to private IPv4 addresses', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://evil.example.com/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('https://evil.example.com/file'),
      ).rejects.toThrow(/resolves to private/);
    });

    it('should block hostnames resolving to 169.254.169.254 (cloud metadata)', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
      await expect(
        validateDownloadUrl('https://metadata.attacker.com/latest/meta-data/'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to 10.x.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://internal.attacker.com/secret'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to 192.168.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://lan.attacker.com/admin'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to 172.16-31.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '172.16.0.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://docker.attacker.com/api'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to private IPv6 addresses', async () => {
      mockLookup.mockResolvedValue([{ address: '::1', family: 6 }]);
      await expect(
        validateDownloadUrl('https://ipv6-evil.example.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to link-local IPv6', async () => {
      mockLookup.mockResolvedValue([{ address: 'fe80::1', family: 6 }]);
      await expect(
        validateDownloadUrl('https://linklocal.attacker.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block if any resolved address is private (multiple A records)', async () => {
      mockLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]);
      await expect(
        validateDownloadUrl('https://dual.attacker.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should allow hostnames resolving to public IPs', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      await expect(
        validateDownloadUrl('https://safe.example.com/file'),
      ).resolves.not.toThrow();
    });

    it('should block when DNS resolution fails', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(
        validateDownloadUrl('https://nonexistent.example.com/file'),
      ).rejects.toThrow(DownloadError);
      await expect(
        validateDownloadUrl('https://nonexistent.example.com/file'),
      ).rejects.toThrow(/Failed to resolve/);
    });

    it('should block hostnames resolving to CGNAT range (100.64.0.0/10)', async () => {
      mockLookup.mockResolvedValue([{ address: '100.100.0.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://cgnat.attacker.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to benchmarking range (198.18.0.0/15)', async () => {
      mockLookup.mockResolvedValue([{ address: '198.18.0.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://bench.attacker.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block hostnames resolving to reserved range (240.0.0.0/4)', async () => {
      mockLookup.mockResolvedValue([{ address: '240.0.0.1', family: 4 }]);
      await expect(
        validateDownloadUrl('https://reserved.attacker.com/file'),
      ).rejects.toThrow(DownloadError);
    });

    it('should block nip.io style DNS rebinding for cloud metadata', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
      await expect(
        validateDownloadUrl('https://169.254.169.254.nip.io/latest/meta-data/'),
      ).rejects.toThrow(DownloadError);
    });
  });
});
