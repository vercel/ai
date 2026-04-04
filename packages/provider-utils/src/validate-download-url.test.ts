import { describe, it, expect } from 'vitest';
import { validateDownloadUrl } from './validate-download-url';
import { DownloadError } from './download-error';

describe('validateDownloadUrl', () => {
  describe('allowed URLs', () => {
    it('should allow https URLs', () => {
      expect(() =>
        validateDownloadUrl('https://example.com/image.png'),
      ).not.toThrow();
    });

    it('should allow http URLs', () => {
      expect(() =>
        validateDownloadUrl('http://example.com/image.png'),
      ).not.toThrow();
    });

    it('should allow public IP addresses', () => {
      expect(() =>
        validateDownloadUrl('https://203.0.113.1/file'),
      ).not.toThrow();
    });

    it('should allow URLs with ports', () => {
      expect(() =>
        validateDownloadUrl('https://example.com:8080/file'),
      ).not.toThrow();
    });

    it('should allow data URLs', () => {
      expect(() =>
        validateDownloadUrl('data:text/plain;base64,aGVsbG8='),
      ).not.toThrow();
    });
  });

  describe('blocked protocols', () => {
    it('should block file:// URLs', () => {
      expect(() => validateDownloadUrl('file:///etc/passwd')).toThrow(
        DownloadError,
      );
    });

    it('should block ftp:// URLs', () => {
      expect(() => validateDownloadUrl('ftp://example.com/file')).toThrow(
        DownloadError,
      );
    });

    it('should block javascript: URLs', () => {
      expect(() => validateDownloadUrl('javascript:alert(1)')).toThrow(
        DownloadError,
      );
    });
  });

  describe('malformed URLs', () => {
    it('should block invalid URLs', () => {
      expect(() => validateDownloadUrl('not-a-url')).toThrow(DownloadError);
    });
  });

  describe('blocked hostnames', () => {
    it('should block localhost', () => {
      expect(() => validateDownloadUrl('http://localhost/file')).toThrow(
        DownloadError,
      );
    });

    it('should block localhost with port', () => {
      expect(() => validateDownloadUrl('http://localhost:3000/file')).toThrow(
        DownloadError,
      );
    });

    it('should block .local domains', () => {
      expect(() => validateDownloadUrl('http://myhost.local/file')).toThrow(
        DownloadError,
      );
    });

    it('should block .localhost domains', () => {
      expect(() => validateDownloadUrl('http://app.localhost/file')).toThrow(
        DownloadError,
      );
    });

    it('should block .internal domains (cloud metadata)', () => {
      expect(() =>
        validateDownloadUrl('http://metadata.google.internal/computeMetadata/v1'),
      ).toThrow(DownloadError);
    });

    it('should block nested .internal domains', () => {
      expect(() =>
        validateDownloadUrl('http://service.namespace.svc.cluster.internal/api'),
      ).toThrow(DownloadError);
    });
  });

  describe('blocked IPv4 addresses', () => {
    it('should block 127.0.0.1 (loopback)', () => {
      expect(() => validateDownloadUrl('http://127.0.0.1/file')).toThrow(
        DownloadError,
      );
    });

    it('should block 127.x.x.x range', () => {
      expect(() => validateDownloadUrl('http://127.255.0.1/file')).toThrow(
        DownloadError,
      );
    });

    it('should block 10.x.x.x (private)', () => {
      expect(() => validateDownloadUrl('http://10.0.0.1/file')).toThrow(
        DownloadError,
      );
    });

    it('should block 172.16.x.x - 172.31.x.x (private)', () => {
      expect(() => validateDownloadUrl('http://172.16.0.1/file')).toThrow(
        DownloadError,
      );
      expect(() => validateDownloadUrl('http://172.31.255.255/file')).toThrow(
        DownloadError,
      );
    });

    it('should allow 172.15.x.x and 172.32.x.x (public)', () => {
      expect(() => validateDownloadUrl('http://172.15.0.1/file')).not.toThrow();
      expect(() => validateDownloadUrl('http://172.32.0.1/file')).not.toThrow();
    });

    it('should block 192.168.x.x (private)', () => {
      expect(() => validateDownloadUrl('http://192.168.1.1/file')).toThrow(
        DownloadError,
      );
    });

    it('should block 169.254.x.x (link-local / cloud metadata)', () => {
      expect(() =>
        validateDownloadUrl('http://169.254.169.254/latest/meta-data/'),
      ).toThrow(DownloadError);
    });

    it('should block 0.0.0.0', () => {
      expect(() => validateDownloadUrl('http://0.0.0.0/file')).toThrow(
        DownloadError,
      );
    });

    it('should block 100.64.0.0/10 (Shared/CGNAT - RFC 6598)', () => {
      expect(() => validateDownloadUrl('http://100.64.0.1/file')).toThrow(
        DownloadError,
      );
      expect(() => validateDownloadUrl('http://100.100.100.1/file')).toThrow(
        DownloadError,
      );
      expect(() => validateDownloadUrl('http://100.127.255.255/file')).toThrow(
        DownloadError,
      );
    });

    it('should allow 100.63.x.x and 100.128.x.x (outside CGNAT)', () => {
      expect(() =>
        validateDownloadUrl('http://100.63.255.255/file'),
      ).not.toThrow();
      expect(() =>
        validateDownloadUrl('http://100.128.0.1/file'),
      ).not.toThrow();
    });

    it('should block 198.18.0.0/15 (Benchmarking - RFC 2544)', () => {
      expect(() => validateDownloadUrl('http://198.18.0.1/file')).toThrow(
        DownloadError,
      );
      expect(() => validateDownloadUrl('http://198.19.255.255/file')).toThrow(
        DownloadError,
      );
    });

    it('should allow 198.17.x.x and 198.20.x.x (outside benchmarking)', () => {
      expect(() =>
        validateDownloadUrl('http://198.17.0.1/file'),
      ).not.toThrow();
      expect(() =>
        validateDownloadUrl('http://198.20.0.1/file'),
      ).not.toThrow();
    });

    it('should block 192.0.0.0/24 (IETF Protocol Assignments - RFC 6890)', () => {
      expect(() => validateDownloadUrl('http://192.0.0.1/file')).toThrow(
        DownloadError,
      );
    });

    it('should block 240.0.0.0/4 (Reserved - RFC 1112)', () => {
      expect(() => validateDownloadUrl('http://240.0.0.1/file')).toThrow(
        DownloadError,
      );
      expect(() => validateDownloadUrl('http://255.255.255.255/file')).toThrow(
        DownloadError,
      );
    });
  });

  describe('blocked IPv6 addresses', () => {
    it('should block ::1 (loopback)', () => {
      expect(() => validateDownloadUrl('http://[::1]/file')).toThrow(
        DownloadError,
      );
    });

    it('should block :: (unspecified)', () => {
      expect(() => validateDownloadUrl('http://[::]/file')).toThrow(
        DownloadError,
      );
    });

    it('should block fc00::/7 (unique local)', () => {
      expect(() => validateDownloadUrl('http://[fc00::1]/file')).toThrow(
        DownloadError,
      );
      expect(() => validateDownloadUrl('http://[fd12::1]/file')).toThrow(
        DownloadError,
      );
    });

    it('should block fe80::/10 (link-local)', () => {
      expect(() => validateDownloadUrl('http://[fe80::1]/file')).toThrow(
        DownloadError,
      );
    });
  });

  describe('IPv4-mapped IPv6 addresses', () => {
    it('should block ::ffff:127.0.0.1', () => {
      expect(() =>
        validateDownloadUrl('http://[::ffff:127.0.0.1]/file'),
      ).toThrow(DownloadError);
    });

    it('should block ::ffff:10.0.0.1', () => {
      expect(() =>
        validateDownloadUrl('http://[::ffff:10.0.0.1]/file'),
      ).toThrow(DownloadError);
    });

    it('should block ::ffff:169.254.169.254', () => {
      expect(() =>
        validateDownloadUrl('http://[::ffff:169.254.169.254]/file'),
      ).toThrow(DownloadError);
    });

    it('should allow ::ffff: with public IP', () => {
      expect(() =>
        validateDownloadUrl('http://[::ffff:203.0.113.1]/file'),
      ).not.toThrow();
    });

    it('should block ::ffff: mapped 100.64.x.x (CGNAT via IPv6)', () => {
      expect(() =>
        validateDownloadUrl('http://[::ffff:100.64.0.1]/file'),
      ).toThrow(DownloadError);
    });
  });
});
