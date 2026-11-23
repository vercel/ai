import { describe, expect, it } from 'vitest';
import { getServerAttributes } from './server-attributes';

describe('getServerAttributes', () => {
  it.each([
    [
      'https://model.example.test:8443/private/v1?key=secret#fragment',
      'model.example.test',
      8443,
    ],
    ['https://user:password@model.example.test/v1', 'model.example.test', 443],
    ['http://model.example.test/v1', 'model.example.test', 80],
    ['https://[2001:db8::1]:8443/v1', '2001:db8::1', 8443],
  ] as const)('records only host and port from %s', (url, address, port) => {
    expect(getServerAttributes(url)).toEqual({
      'server.address': address,
      'server.port': port,
    });
  });

  it.each([
    undefined,
    '',
    '/relative/path',
    'not a URL',
    'file:///etc/passwd',
    'data:text/plain,secret',
  ])('omits unknown or non-HTTP endpoints (%s)', url => {
    expect(getServerAttributes(url)).toEqual({});
  });
});
