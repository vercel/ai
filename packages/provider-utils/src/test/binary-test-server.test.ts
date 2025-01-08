import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { BinaryTestServer } from './binary-test-server';

describe('BinaryTestServer', () => {
  let server: BinaryTestServer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with a single URL', () => {
      const server = new BinaryTestServer('http://example.com');
      expect(server.server).toBeDefined();
    });

    it('should initialize with multiple URLs', () => {
      const server = new BinaryTestServer([
        'http://example.com',
        'http://test.com',
      ]);
      expect(server.server).toBeDefined();
    });
  });

  describe('setResponseFor', () => {
    beforeAll(() => {
      server = new BinaryTestServer('http://example.com');
      server.server.listen();
    });

    afterAll(() => {
      server.server.close();
    });

    it('should set response options for a valid URL', () => {
      const buffer = Buffer.from('test data');
      server.setResponseFor('http://example.com/', {
        body: buffer,
        headers: { 'content-type': 'application/octet-stream' },
        status: 201,
      });
    });

    it('should throw error for invalid URL', () => {
      expect(() =>
        server.setResponseFor('http://invalid.com', { status: 200 }),
      ).toThrow('No endpoint configured for URL');
    });
  });

  describe('request handling', () => {
    beforeAll(() => {
      server = new BinaryTestServer('http://example.com');
      server.server.listen();
    });

    afterAll(() => {
      server.server.close();
    });

    beforeEach(() => {
      server.server.resetHandlers();
    });

    it('should handle JSON requests', async () => {
      const testData = { test: 'data' };
      const fetchSpy = vi.spyOn(global, 'fetch');

      await fetch('http://example.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(testData),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        }),
      );

      const requestData = await server.getRequestDataFor('http://example.com/');
      const bodyJson = await requestData.bodyJson();
      expect(bodyJson).toEqual(testData);
    });

    it('should handle form data requests', async () => {
      const formData = new FormData();
      formData.append('field', 'value');
      const fetchSpy = vi.spyOn(global, 'fetch');

      await fetch('http://example.com', {
        method: 'POST',
        body: formData,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );

      const requestData = await server.getRequestDataFor('http://example.com');
      const formDataReceived = await requestData.bodyFormData();
      expect(formDataReceived.get('field')).toBe('value');
    });

    it('should handle custom response configurations', async () => {
      const responseBuffer = Buffer.from('test response');
      const fetchSpy = vi.spyOn(global, 'fetch');

      server.setResponseFor('http://example.com', {
        body: responseBuffer,
        headers: { 'x-custom': 'test' },
        status: 201,
      });

      const response = await fetch('http://example.com', { method: 'POST' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({ method: 'POST' }),
      );

      expect(response.status).toBe(201);
      expect(response.headers.get('x-custom')).toBe('test');
      const responseData = await response.arrayBuffer();
      expect(Buffer.from(responseData)).toEqual(responseBuffer);
    });
  });

  describe('URL handling', () => {
    let server: BinaryTestServer;

    beforeEach(() => {
      server = new BinaryTestServer('http://example.com');
      server.server.listen();
      // Set default response
      server.setResponseFor('http://example.com', {
        status: 200,
        body: null,
      });
    });

    afterEach(() => {
      server.server.resetHandlers();
      server.server.close();
    });

    it('should handle search params', async () => {
      const response = await fetch('http://example.com?param=value', {
        method: 'POST',
        body: JSON.stringify({ test: true }),
      });

      expect(response.status).toBe(200);

      const requestData = await server.getRequestDataFor('http://example.com');
      expect(requestData.urlSearchParams().get('param')).toBe('value');
    });

    it('should handle relative URLs', () => {
      const server = new BinaryTestServer('/api/endpoint');
      expect(server.server).toBeDefined();
    });
  });
});
