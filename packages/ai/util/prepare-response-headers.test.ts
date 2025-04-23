import { prepareResponseHeaders } from './prepare-response-headers';

it('should set Content-Type header if not present', () => {
  const headers = prepareResponseHeaders(
    {},
    { contentType: 'application/json' },
  );

  expect(headers.get('Content-Type')).toBe('application/json');
});

it('should not overwrite existing Content-Type header', () => {
  const headers = prepareResponseHeaders(
    { 'Content-Type': 'text/html' },
    { contentType: 'application/json' },
  );

  expect(headers.get('Content-Type')).toBe('text/html');
});

it('should handle undefined init', () => {
  const headers = prepareResponseHeaders(undefined, {
    contentType: 'application/json',
  });

  expect(headers.get('Content-Type')).toBe('application/json');
});

it('should handle init headers as Headers object', () => {
  const headers = prepareResponseHeaders(new Headers({ init: 'foo' }), {
    contentType: 'application/json',
  });

  expect(headers.get('init')).toBe('foo');
  expect(headers.get('Content-Type')).toBe('application/json');
});

it('should handle Response object headers', () => {
  const initHeaders = { init: 'foo' };
  const response = new Response(null, {
    headers: { ...initHeaders, extra: 'bar' },
  });

  const headers = prepareResponseHeaders(response.headers, {
    contentType: 'application/json',
  });

  expect(headers.get('init')).toBe('foo');
  expect(headers.get('extra')).toBe('bar');
  expect(headers.get('Content-Type')).toBe('application/json');
});
