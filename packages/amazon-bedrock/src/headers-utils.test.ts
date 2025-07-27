import { extractHeaders, convertHeadersToRecord } from './headers-utils';

describe('extractHeaders', () => {
  it('should handle undefined headers', () => {
    const result = extractHeaders(undefined);
    expect(result).toEqual({});
  });

  it('should handle Headers instance', () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('X-Custom-Header', 'test-value');

    const result = extractHeaders(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
    });
  });

  it('should handle array of header tuples', () => {
    const headers: [string, string][] = [
      ['Content-Type', 'application/json'],
      ['X-Custom-Header', 'test-value'],
    ];

    const result = extractHeaders(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
    });
  });

  it('should handle plain object headers', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'test-value',
    };

    const result = extractHeaders(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
    });
  });
});

describe('convertHeadersToRecord', () => {
  it('should convert Headers to Record object', () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('X-Custom-Header', 'test-value');

    const result = convertHeadersToRecord(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
    });
  });

  it('should handle empty Headers', () => {
    const headers = new Headers();
    const result = convertHeadersToRecord(headers);
    expect(result).toEqual({});
  });

  it('should convert headers to lowercase keys', () => {
    const headers = new Headers();
    headers.append('CONTENT-TYPE', 'application/json');
    headers.append('X-CUSTOM-HEADER', 'test-value');

    const result = convertHeadersToRecord(headers);
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
    });
  });
});
