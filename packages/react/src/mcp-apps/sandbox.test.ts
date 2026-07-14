import { describe, expect, it } from 'vitest';
import { getMCPAppCSP } from './sandbox';

describe('getMCPAppCSP', () => {
  it('returns undefined when no csp is provided', () => {
    expect(getMCPAppCSP()).toBeUndefined();
  });

  it('includes valid domains in their directives', () => {
    const csp = getMCPAppCSP({
      connectDomains: ['https://api.example.com'],
      resourceDomains: ['https://cdn.example.com'],
      frameDomains: ['https://frame.example.com'],
    });

    expect(csp).toContain("connect-src 'self' https://api.example.com");
    expect(csp).toContain(
      "img-src 'self' data: https://cdn.example.com",
    );
    expect(csp).toContain("frame-src 'self' https://frame.example.com");
  });

  it('drops domains that would break out of their directive', () => {
    const csp = getMCPAppCSP({
      connectDomains: [
        'https://api.example.test; script-src-elem https://attacker.example',
      ],
      resourceDomains: ['https://ok.example.com'],
      frameDomains: ['https://frame.example, https://evil.example'],
    });

    expect(csp).not.toContain('attacker.example');
    expect(csp).not.toContain('evil.example');
    expect(csp).not.toContain('script-src-elem');
    // policy still has exactly its seven intended directives
    expect(csp!.split(';')).toHaveLength(7);
    // untainted values are unaffected
    expect(csp).toContain('https://ok.example.com');
  });
});
