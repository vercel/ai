import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { z } from 'zod/v4';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StructuredObject } from './structured-object.ng';

const server = createTestServer({
  '/api/object': {},
});

describe('text stream', () => {
  const schema = z.object({ content: z.string() });
  let structuredObject: StructuredObject<typeof schema>;

  beforeEach(() => {
    structuredObject = new StructuredObject({
      api: '/api/object',
      schema,
    });
  });

  describe('when the API returns "Hello, world!"', () => {
    beforeEach(async () => {
      server.urls['/api/object'].response = {
        type: 'stream-chunks',
        chunks: ['{ ', '"content": "Hello, ', 'world', '!"', ' }'],
      };
      await structuredObject.submit('test-input');
    });

    it('should render the stream', () => {
      expect(structuredObject.object).toEqual({ content: 'Hello, world!' });
    });

    it('should send the correct input to the API', async () => {
      expect(await server.calls[0].requestBodyJson).toBe('test-input');
    });

    it('should not have an error', () => {
      expect(structuredObject.error).toBeUndefined();
    });
  });

  describe('loading', () => {
    it('should be true while loading', async () => {
      const controller = new TestResponseController();
      server.urls['/api/object'].response = {
        type: 'controlled-stream',
        controller,
      };

      controller.write('{"content": ');
      const submitOperation = structuredObject.submit('test-input');

      await vi.waitFor(() => {
        expect(structuredObject.loading).toBe(true);
      });

      controller.write('"Hello, world!"}');
      controller.close();
      await submitOperation;

      expect(structuredObject.loading).toBe(false);
    });
  });

  describe('stop', () => {
    it('should abort the stream and not consume any more data', async () => {
      const controller = new TestResponseController();
      server.urls['/api/object'].response = {
        type: 'controlled-stream',
        controller,
      };

      controller.write('{"content": "h');
      const submitOperation = structuredObject.submit('test-input');

      await vi.waitFor(() => {
        expect(structuredObject.loading).toBe(true);
        expect(structuredObject.object).toStrictEqual({
          content: 'h',
        });
      });

      structuredObject.stop();

      await vi.waitFor(() => {
        expect(structuredObject.loading).toBe(false);
      });

      await expect(controller.write('ello, world!"}')).rejects.toThrow();
      await expect(controller.close()).rejects.toThrow();
      await submitOperation;

      expect(structuredObject.loading).toBe(false);
      expect(structuredObject.object).toStrictEqual({
        content: 'h',
      });
    });
  });

  describe('when the API returns a 404', () => {
    it('should produce the correct error state', async () => {
      server.urls['/api/object'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      await structuredObject.submit('test-input');
      expect(structuredObject.error).toBeInstanceOf(Error);
      expect(structuredObject.error?.message).toBe('Not found');
      expect(structuredObject.loading).toBe(false);
    });
  });

  describe('when the API returns an error with an empty body', () => {
    it('should use the fallback error message', async () => {
      server.urls['/api/object'].response = {
        type: 'error',
        status: 502,
        body: '',
      };

      await structuredObject.submit('test-input');
      expect(structuredObject.error).toBeInstanceOf(Error);
      expect(structuredObject.error?.message).toBe(
        'Failed to fetch the response.',
      );
      expect(structuredObject.loading).toBe(false);
    });
  });

  describe('onFinish', () => {
    it('should be called with an object when the stream finishes and the object matches the schema', async () => {
      server.urls['/api/object'].response = {
        type: 'stream-chunks',
        chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
      };

      const onFinish = vi.fn();
      const structuredObjectWithOnFinish = new StructuredObject({
        api: '/api/object',
        schema: z.object({ content: z.string() }),
        onFinish,
      });
      await structuredObjectWithOnFinish.submit('test-input');

      expect(onFinish).toHaveBeenCalledExactlyOnceWith({
        object: { content: 'Hello, world!' },
        error: undefined,
      });
    });

    it('should be called with an error when the stream finishes and the object does not match the schema', async () => {
      server.urls['/api/object'].response = {
        type: 'stream-chunks',
        chunks: ['{ ', '"content-wrong": "Hello, ', 'world', '!"', '}'],
      };

      const onFinish = vi.fn();
      const structuredObjectWithOnFinish = new StructuredObject({
        api: '/api/object',
        schema: z.object({ content: z.string() }),
        onFinish,
      });
      await structuredObjectWithOnFinish.submit('test-input');

      expect(onFinish).toHaveBeenCalledExactlyOnceWith({
        object: undefined,
        error: expect.any(Error),
      });
    });

    it('should wait for an async callback before submit resolves', async () => {
      server.urls['/api/object'].response = {
        type: 'stream-chunks',
        chunks: ['{"content":"Hello, world!"}'],
      };

      let resolveOnFinish!: () => void;
      const onFinishPromise = new Promise<void>(resolve => {
        resolveOnFinish = resolve;
      });
      const onFinish = vi.fn(() => onFinishPromise);
      const structuredObjectWithOnFinish = new StructuredObject({
        api: '/api/object',
        schema: z.object({ content: z.string() }),
        onFinish,
      });

      let submitResolved = false;
      const submitOperation = structuredObjectWithOnFinish
        .submit('test-input')
        .then(() => {
          submitResolved = true;
        });

      await vi.waitFor(() => {
        expect(onFinish).toHaveBeenCalledOnce();
      });
      expect(submitResolved).toBe(false);

      resolveOnFinish();
      await submitOperation;

      expect(submitResolved).toBe(true);
      expect(structuredObjectWithOnFinish.error).toBeUndefined();
    });

    it.each([
      {
        name: 'a matching object',
        chunks: ['{"content":"Hello, world!"}'],
        expectedEvent: {
          object: { content: 'Hello, world!' },
          error: undefined,
        },
      },
      {
        name: 'an object that fails validation',
        chunks: ['{"wrong":"value"}'],
        expectedEvent: {
          object: undefined,
          error: expect.any(Error),
        },
      },
    ])(
      'should route a rejected async callback for $name through error handling',
      async ({ chunks, expectedEvent }) => {
        server.urls['/api/object'].response = {
          type: 'stream-chunks',
          chunks,
        };

        const callbackError = new Error('callback failed');
        const onFinish = vi.fn(async () => {
          throw callbackError;
        });
        const onError = vi.fn();
        const structuredObjectWithOnFinish = new StructuredObject({
          api: '/api/object',
          schema: z.object({ content: z.string() }),
          onFinish,
          onError,
        });

        await structuredObjectWithOnFinish.submit('test-input');

        expect(onFinish).toHaveBeenCalledExactlyOnceWith(expectedEvent);
        expect(onError).toHaveBeenCalledExactlyOnceWith(callbackError);
        expect(structuredObjectWithOnFinish.error).toBe(callbackError);
        expect(structuredObjectWithOnFinish.loading).toBe(false);
      },
    );

    it('should not replace newer state when an older async callback rejects', async () => {
      let rejectOlderCallback!: (reason: unknown) => void;
      const olderCallback = new Promise<void>((_, reject) => {
        rejectOlderCallback = reject;
      });
      let markOlderCallbackStarted!: () => void;
      const olderCallbackStarted = new Promise<void>(resolve => {
        markOlderCallbackStarted = resolve;
      });
      const callbackError = new Error('older callback failed');
      const onError = vi.fn();
      const structuredObjectWithOnFinish = new StructuredObject({
        api: '/api/object',
        schema: z.object({ content: z.string() }),
        fetch: async (_input, init) => new Response(init?.body),
        onFinish: async ({ object }) => {
          if (object?.content === 'older') {
            markOlderCallbackStarted();
            await olderCallback;
          }
        },
        onError,
      });

      const olderSubmission = structuredObjectWithOnFinish.submit({
        content: 'older',
      });
      await olderCallbackStarted;

      await structuredObjectWithOnFinish.submit({ content: 'newer' });
      rejectOlderCallback(callbackError);
      await olderSubmission;

      expect(onError).toHaveBeenCalledExactlyOnceWith(callbackError);
      expect(structuredObjectWithOnFinish.object).toEqual({
        content: 'newer',
      });
      expect(structuredObjectWithOnFinish.error).toBeUndefined();
      expect(structuredObjectWithOnFinish.loading).toBe(false);
    });
  });

  it('should send custom headers', async () => {
    server.urls['/api/object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
    };

    const structuredObjectWithCustomHeaders = new StructuredObject({
      api: '/api/object',
      schema: z.object({ content: z.string() }),
      headers: {
        Authorization: 'Bearer TEST_TOKEN',
        'X-Custom-Header': 'CustomValue',
      },
    });

    await structuredObjectWithCustomHeaders.submit('test-input');

    expect(server.calls[0].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      authorization: 'Bearer TEST_TOKEN',
      'x-custom-header': 'CustomValue',
    });
  });

  it('should send custom credentials', async () => {
    server.urls['/api/object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
    };

    const structuredObjectWithCustomCredentials = new StructuredObject({
      api: '/api/object',
      schema: z.object({ content: z.string() }),
      credentials: 'include',
    });

    await structuredObjectWithCustomCredentials.submit('test-input');

    expect(server.calls[0].requestCredentials).toBe('include');
  });
});
