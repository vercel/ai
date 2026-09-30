import { describe, expect, it } from 'vitest';
import { isValidDnsLabel } from './is-valid-dns-label';

describe('isValidDnsLabel', () => {
  it.each(['a', '0', 'us-east-1', 'MY-resource', 'global', 'a'.repeat(63)])(
    'accepts %j',
    value => expect(isValidDnsLabel(value)).toBe(true),
  );
  it.each([
    '',
    'a'.repeat(64),
    '-a',
    'a-',
    'a.b',
    'a_b',
    'é',
    'user@internal:8080/#',
    'evil.example.com/#',
    '169.254.169.254:80/x#',
    'us-east-1/../..',
    'us east 1',
    'a\n',
    'a\r',
    'a\t',
    'a\0',
    '%61',
  ])('rejects %j', value => expect(isValidDnsLabel(value)).toBe(false));
});
