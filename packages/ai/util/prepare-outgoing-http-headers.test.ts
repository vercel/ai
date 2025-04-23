import { prepareOutgoingHttpHeaders } from './prepare-outgoing-http-headers';

it('should set Content-Type header if not present', () => {
  const headers = prepareOutgoingHttpHeaders(
    {},
    { contentType: 'application/json' },
  );

  expect(headers['Content-Type']).toBe('application/json');
});

it('should not overwrite existing Content-Type header', () => {
  const headers = prepareOutgoingHttpHeaders(
    { 'Content-Type': 'text/html' },
    { contentType: 'application/json' },
  );

  expect(headers['Content-Type']).toBe('text/html');
});

it('should handle undefined init', () => {
  const headers = prepareOutgoingHttpHeaders(undefined, {
    contentType: 'application/json',
  });

  expect(headers['Content-Type']).toBe('application/json');
});

it('should handle init headers as object', () => {
  const headers = prepareOutgoingHttpHeaders(
    { init: 'foo' },
    { contentType: 'application/json' },
  );

  expect(headers['init']).toBe('foo');
  expect(headers['Content-Type']).toBe('application/json');
});

it('should set X-Vercel-AI-Data-Stream header when dataStreamVersion is provided', () => {
  const headers = prepareOutgoingHttpHeaders(
    {},
    { contentType: 'application/json', dataStreamVersion: 'v1' },
  );

  expect(headers['Content-Type']).toBe('application/json');
  expect(headers['X-Vercel-AI-Data-Stream']).toBe('v1');
});

it('should not set X-Vercel-AI-Data-Stream header when dataStreamVersion is undefined', () => {
  const headers = prepareOutgoingHttpHeaders(
    {},
    { contentType: 'application/json' },
  );

  expect(headers['Content-Type']).toBe('application/json');
  expect(headers['X-Vercel-AI-Data-Stream']).toBeUndefined();
});
