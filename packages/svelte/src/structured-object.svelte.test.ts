import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { render } from '@testing-library/svelte';
import { z } from 'zod/v4';
import { StructuredObject } from './structured-object.svelte.js';
import StructuredObjectSynchronization from './tests/structured-object-synchronization.svelte';
import { vi, describe, beforeEach, expect, it } from 'vitest';

const server = createTestServer({
  '/api/object': {},
});

type ControlledRequest = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  signal: AbortSignal;
};

function createControlledObject() {
  const requests: ControlledRequest[] = [];

  const object = new StructuredObject({
    api: '/mock',
    schema: z.object({ value: z.string() }),
    fetch: async (_input, init) => {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const signal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      });

      signal.addEventListener(
        'abort',
        () => {
          try {
            controller.error(new DOMException('Request aborted', 'AbortError'));
          } catch {
            // The stream may already be closed.
          }
        },
        { once: true },
      );

      requests.push({ controller, signal });
      return new Response(body);
    },
  });

  return { object, requests };
}

function finish(request: ControlledRequest, value: string) {
  request.controller.enqueue(
    new TextEncoder().encode(JSON.stringify({ value })),
  );
  request.controller.close();
}

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

    it('should stop and clear the object state after a call to submit then clear', async () => {
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

      structuredObject.clear();

      await vi.waitFor(() => {
        expect(structuredObject.loading).toBe(false);
      });

      await expect(controller.write('ello, world!"}')).rejects.toThrow();
      await expect(controller.close()).rejects.toThrow();
      await submitOperation;

      expect(structuredObject.loading).toBe(false);
      expect(structuredObject.error).toBeUndefined();
      expect(structuredObject.object).toBeUndefined();
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

  it('should clear the object state after a call to clear', async () => {
    server.urls['/api/object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
    };

    const structuredObjectWithOnFinish = new StructuredObject({
      api: '/api/object',
      schema: z.object({ content: z.string() }),
    });

    await structuredObjectWithOnFinish.submit('test-input');

    expect(structuredObjectWithOnFinish.object).toBeDefined();

    structuredObjectWithOnFinish.clear();

    expect(structuredObjectWithOnFinish.object).toBeUndefined();
    expect(structuredObjectWithOnFinish.error).toBeUndefined();
    expect(structuredObjectWithOnFinish.loading).toBe(false);
  });
});

describe('overlapping requests', () => {
  it('keeps the newer completed object when an older request finishes late', async () => {
    const { object, requests } = createControlledObject();
    const older = object.submit('older');
    const newer = object.submit('newer');

    await vi.waitFor(() => expect(requests).toHaveLength(2));

    finish(requests[1], 'newer');
    await newer;
    expect(object.object).toEqual({ value: 'newer' });

    finish(requests[0], 'older');
    await older;

    expect(object.object).toEqual({ value: 'newer' });
  });

  it('keeps newer request state when an older request fails while it is active', async () => {
    const { object, requests } = createControlledObject();
    const older = object.submit('older');
    const newer = object.submit('newer');

    await vi.waitFor(() => expect(requests).toHaveLength(2));

    requests[0].controller.error(new Error('older request failed'));
    await older;

    expect(object.loading).toBe(true);
    expect(object.error).toBeUndefined();

    object.stop();
    await newer;
  });

  it('does not surface an older failure after the newer request completes', async () => {
    const { object, requests } = createControlledObject();
    const older = object.submit('older');
    const newer = object.submit('newer');

    await vi.waitFor(() => expect(requests).toHaveLength(2));

    finish(requests[1], 'newer');
    await newer;
    requests[0].controller.error(new Error('older request failed'));
    await older;

    expect(object.object).toEqual({ value: 'newer' });
    expect(object.error).toBeUndefined();
  });

  it('can still stop the newer request after the older request completes', async () => {
    const { object, requests } = createControlledObject();
    const older = object.submit('older');
    const newer = object.submit('newer');

    await vi.waitFor(() => expect(requests).toHaveLength(2));

    requests[0].controller.close();
    await older;

    expect(object.loading).toBe(true);
    object.stop();
    expect(requests[1].signal.aborted).toBe(true);
    await newer;
  });
});

describe('synchronization', () => {
  it('correctly synchronizes content between hook instances', async () => {
    server.urls['/api/object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
    };

    const {
      component: { object1, object2 },
    } = render(StructuredObjectSynchronization, {
      id: crypto.randomUUID(),
      api: '/api/object',
      schema: z.object({ content: z.string() }),
    });

    await object1.submit('hi');

    expect(object1.object).toStrictEqual({ content: 'Hello, world!' });
    expect(object2.object).toStrictEqual(object1.object);
  });

  it('correctly synchronizes loading and error state between hook instances', async () => {
    const controller = new TestResponseController();
    server.urls['/api/object'].response = {
      type: 'controlled-stream',
      controller,
    };

    const {
      component: { object1, object2 },
    } = render(StructuredObjectSynchronization, {
      id: crypto.randomUUID(),
      api: '/api/object',
      schema: z.object({ content: z.string() }),
    });

    const submitOperation = object1.submit('hi');

    await vi.waitFor(() => {
      expect(object1.loading).toBe(true);
      expect(object2.loading).toBe(true);
    });

    controller.write('{ "content": "Hello"');
    await vi.waitFor(() => {
      expect(object1.object).toStrictEqual({ content: 'Hello' });
      expect(object2.object).toStrictEqual(object1.object);
    });

    controller.error(new Error('Failed to be cool enough'));
    await submitOperation;

    expect(object1.loading).toBe(false);
    expect(object2.loading).toBe(false);
    expect(object1.error).toBeInstanceOf(Error);
    expect(object1.error?.message).toBe('Failed to be cool enough');
    expect(object2.error).toBeInstanceOf(Error);
    expect(object2.error?.message).toBe('Failed to be cool enough');
  });
});
