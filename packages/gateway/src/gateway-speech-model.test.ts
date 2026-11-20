import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  GatewayInternalServerError,
  GatewayInvalidRequestError,
  GatewayResponseError,
} from './errors';
import type { GatewayConfig } from './gateway-config';
import { GatewaySpeechModel } from './gateway-speech-model';

const server = createTestServer({
  'https://api.test.com/speech-model': {},
});

const createTestModel = (
  config: Partial<
    GatewayConfig & { o11yHeaders?: Record<string, string> }
  > = {},
) =>
  new GatewaySpeechModel('openai/tts-1', {
    provider: 'gateway',
    baseURL: 'https://api.test.com',
    headers: () => ({
      Authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
    }),
    fetch: globalThis.fetch,
    o11yHeaders: config.o11yHeaders || {},
    ...config,
  });

describe('GatewaySpeechModel', () => {
  function prepareJsonResponse({
    audio = 'base64-audio',
    headers,
    usage,
  }: {
    audio?: string;
    headers?: Record<string, string>;
    usage?: Record<string, unknown>;
  } = {}) {
    server.urls['https://api.test.com/speech-model'].response = {
      type: 'json-value',
      headers,
      body: { audio, usage },
    };
  }

  describe('doGenerate', () => {
    it('should pass headers correctly', async () => {
      prepareJsonResponse();

      await createTestModel().doGenerate({
        text: 'Hello world',
        headers: { 'Custom-Header': 'test-value' },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-token',
        'custom-header': 'test-value',
        'ai-speech-model-specification-version': '4',
        'ai-model-id': 'openai/tts-1',
      });
    });

    it('should include o11y headers', async () => {
      prepareJsonResponse();

      const o11yHeaders = {
        'ai-o11y-deployment-id': 'deployment-1',
        'ai-o11y-environment': 'production',
        'ai-o11y-region': 'iad1',
      } as const;

      await createTestModel({ o11yHeaders }).doGenerate({
        text: 'Hello world',
      });

      expect(server.calls[0].requestHeaders).toMatchObject(o11yHeaders);
    });

    it('should send speech options in request body', async () => {
      prepareJsonResponse();

      await createTestModel().doGenerate({
        text: 'Hello world',
        voice: 'alloy',
        outputFormat: 'mp3',
        instructions: 'Speak clearly',
        speed: 1.25,
        language: 'en',
        providerOptions: { openai: { style: 'friendly' } },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello world',
        voice: 'alloy',
        outputFormat: 'mp3',
        instructions: 'Speak clearly',
        speed: 1.25,
        language: 'en',
        providerOptions: { openai: { style: 'friendly' } },
      });
    });

    it('should omit optional speech options when not provided', async () => {
      prepareJsonResponse();

      await createTestModel().doGenerate({ text: 'Hello world' });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello world',
      });
    });

    it('should extract audio and metadata from response', async () => {
      server.urls['https://api.test.com/speech-model'].response = {
        type: 'json-value',
        headers: { 'x-request-id': 'req-123' },
        body: {
          audio: 'base64-audio',
          warnings: [{ type: 'other', message: 'test warning' }],
          usage: { characters: 11 },
          providerMetadata: { gateway: { cost: '0.002' } },
        },
      };

      const result = await createTestModel().doGenerate({
        text: 'Hello world',
      });

      expect(result.audio).toBe('base64-audio');
      expect(result.warnings).toStrictEqual([
        { type: 'other', message: 'test warning' },
      ]);
      expect(result.usage).toStrictEqual({ characters: 11 });
      expect(result.providerMetadata).toStrictEqual({
        gateway: { cost: '0.002' },
      });
      expect(result.response.headers?.['x-request-id']).toBe('req-123');
      expect(result.response.modelId).toBe('openai/tts-1');
    });

    describe('large audio with experimental streaming decoding', () => {
      const callOptions = {
        text: 'Hello world',
        providerOptions: {
          gateway: { experimental_streamingAudioDecoding: true },
        },
      };

      function bytesOf(length: number, seed = 1) {
        const bytes = new Uint8Array(length);
        let state = seed;
        for (let index = 0; index < length; index++) {
          state = (state * 1103515245 + 12345) >>> 0;
          bytes[index] = state >>> 24;
        }
        return bytes;
      }

      function sameBytes(actual: unknown, expected: Uint8Array) {
        if (
          !(actual instanceof Uint8Array) ||
          actual.length !== expected.length
        ) {
          return false;
        }
        for (let index = 0; index < expected.length; index++) {
          if (actual[index] !== expected[index]) return false;
        }
        return true;
      }

      const large = bytesOf(70_000, 1);
      const largeBase64 = convertUint8ArrayToBase64(large);
      const small = bytesOf(1_000, 2);
      const smallBase64 = convertUint8ArrayToBase64(small);

      function respondWith(body: unknown) {
        server.urls['https://api.test.com/speech-model'].response = {
          type: 'json-value',
          body: body as Record<string, unknown>,
        };
      }

      it.each([undefined, false])(
        'should preserve the base64 string and the raw body when the option is %s',
        async enabled => {
          respondWith({ audio: largeBase64 });

          const result = await createTestModel().doGenerate({
            text: 'Hello world',
            providerOptions:
              enabled === undefined
                ? {}
                : { gateway: { experimental_streamingAudioDecoding: enabled } },
          });

          expect(result.audio).toBe(largeBase64);
          expect(result.response.body).toEqual({ audio: largeBase64 });
        },
      );

      it.each([true, false])(
        'should remove the client option set to %s while preserving service options',
        async enabled => {
          respondWith({ audio: smallBase64 });
          const providerOptions = {
            gateway: {
              experimental_streamingAudioDecoding: enabled,
              tags: ['speech'],
            },
            openai: { style: 'friendly' },
          };

          await createTestModel().doGenerate({
            text: 'Hello world',
            providerOptions,
          });

          expect(
            (await server.calls[0].requestBodyJson).providerOptions,
          ).toEqual({
            gateway: { tags: ['speech'] },
            openai: { style: 'friendly' },
          });
          expect(
            providerOptions.gateway.experimental_streamingAudioDecoding,
          ).toBe(enabled);
        },
      );

      it.each([true, false])(
        'should omit providerOptions when the client option set to %s is its only entry',
        async enabled => {
          respondWith({ audio: smallBase64 });

          await createTestModel().doGenerate({
            text: 'Hello world',
            providerOptions: {
              gateway: { experimental_streamingAudioDecoding: enabled },
            },
          });

          expect(
            (await server.calls[0].requestBodyJson).providerOptions,
          ).toBeUndefined();
        },
      );

      it.each([true, false])(
        'should omit an empty gateway object when the client option is %s',
        async enabled => {
          respondWith({ audio: smallBase64 });

          await createTestModel().doGenerate({
            text: 'Hello world',
            providerOptions: {
              gateway: { experimental_streamingAudioDecoding: enabled },
              openai: { style: 'friendly' },
            },
          });

          expect(
            (await server.calls[0].requestBodyJson).providerOptions,
          ).toEqual({ openai: { style: 'friendly' } });
        },
      );

      it('should return audio of 64 KiB and more as Uint8Array', async () => {
        respondWith({ audio: largeBase64 });

        const result = await createTestModel().doGenerate(callOptions);

        expect(result.audio).toBeInstanceOf(Uint8Array);
        expect(result.audio).toEqual(large);
      });

      it('should keep audio below 64 KiB as a base64 string', async () => {
        respondWith({ audio: smallBase64 });

        const result = await createTestModel().doGenerate(callOptions);

        expect(result.audio).toBe(smallBase64);
      });

      it('should keep a large string that is not canonical base64 as a string', async () => {
        const base64Url = largeBase64.replace(/\+/g, '-').replace(/\//g, '_');
        respondWith({ audio: base64Url });

        const result = await createTestModel().doGenerate(callOptions);

        expect(result.audio).toBe(base64Url);
      });

      it('should not change the other fields of the result and keep the raw response body small', async () => {
        server.urls['https://api.test.com/speech-model'].response = {
          type: 'json-value',
          headers: { 'x-request-id': 'req-123' },
          body: {
            audio: largeBase64,
            warnings: [{ type: 'other', message: 'careful' }],
            usage: { characters: 11 },
            providerMetadata: { gateway: { cost: '0.002' } },
          },
        };

        const result = await createTestModel().doGenerate(callOptions);

        expect(result.audio).toEqual(large);
        expect(result.warnings).toEqual([
          { type: 'other', message: 'careful' },
        ]);
        expect(result.usage).toEqual({ characters: 11 });
        expect(result.providerMetadata).toEqual({
          gateway: { cost: '0.002' },
        });
        expect(result.response.headers?.['x-request-id']).toBe('req-123');
        expect(result.response.modelId).toBe('openai/tts-1');
        const rawBody = JSON.stringify(result.response.body);
        expect(rawBody).toContain('[binary data: 70000 bytes');
        expect(rawBody.length).toBeLessThan(2000);
      });

      it('should read a body that arrives in small chunks', async () => {
        const body = JSON.stringify({ audio: largeBase64 });
        server.urls['https://api.test.com/speech-model'].response = {
          type: 'stream-chunks',
          headers: { 'Content-Type': 'application/json' },
          chunks: body.match(/[\s\S]{1,1999}/g) ?? [],
        };

        const result = await createTestModel().doGenerate(callOptions);

        expect(result.audio).toEqual(large);
      });

      it('should decode a response of several MiB', async () => {
        const longAudio = bytesOf(6 * 1024 * 1024, 3);
        const body = JSON.stringify({
          audio: convertUint8ArrayToBase64(longAudio),
          usage: { characters: 11 },
        });
        server.urls['https://api.test.com/speech-model'].response = {
          type: 'stream-chunks',
          headers: { 'Content-Type': 'application/json' },
          chunks: body.match(/[\s\S]{1,65536}/g) ?? [],
        };

        const result = await createTestModel().doGenerate(callOptions);

        expect(sameBytes(result.audio, longAudio)).toBe(true);
        expect(result.usage).toEqual({ characters: 11 });
      });

      it('should not put the audio into the error of an invalid response', async () => {
        respondWith({ audio: largeBase64, usage: 5 });

        const error = await createTestModel()
          .doGenerate(callOptions)
          .then(
            () => undefined,
            (caught: unknown) => caught,
          );

        expect(GatewayResponseError.isInstance(error)).toBe(true);
        // The error does not carry the audio, only a placeholder.
        const { responseBody } = (error as GatewayResponseError).cause as {
          responseBody?: string;
        };
        expect(responseBody).toContain('[binary data: 70000 bytes');
        expect(String(responseBody).length).toBeLessThan(2000);
      });

      it('should reject a response whose audio is not a string', async () => {
        respondWith({ audio: 5 });

        const error = await createTestModel()
          .doGenerate(callOptions)
          .then(
            () => undefined,
            (caught: unknown) => caught,
          );

        expect(GatewayResponseError.isInstance(error)).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    it('should throw GatewayInvalidRequestError on 400', async () => {
      server.urls['https://api.test.com/speech-model'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid text format',
            type: 'invalid_request_error',
          },
        }),
      };

      await expect(
        createTestModel().doGenerate({ text: 'Hello world' }),
      ).rejects.toSatisfy(
        err =>
          GatewayInvalidRequestError.isInstance(err) && err.statusCode === 400,
      );
    });

    it('should throw GatewayInternalServerError on 500', async () => {
      server.urls['https://api.test.com/speech-model'].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            type: 'internal_server_error',
          },
        }),
      };

      await expect(
        createTestModel().doGenerate({ text: 'Hello world' }),
      ).rejects.toSatisfy(
        err =>
          GatewayInternalServerError.isInstance(err) && err.statusCode === 500,
      );
    });
  });

  describe('URL construction', () => {
    it('should post to /speech-model endpoint', async () => {
      prepareJsonResponse();

      await createTestModel().doGenerate({ text: 'Hello world' });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.test.com/speech-model',
      );
    });
  });
});

describe('gateway.experimental_speech', () => {
  const serverOnlyIt = typeof globalThis.window === 'undefined' ? it : it.skip;
  const MODEL = 'elevenlabs/eleven-flash-v2.5';

  serverOnlyIt('creates a streaming speech model from a model id', async () => {
    const { createGateway } = await import('./gateway-provider');
    const model = createGateway({
      apiKey: 'vck_test-token',
    }).experimental_speech(MODEL);
    expect(model.specificationVersion).toBe('v4');
    expect(model.modelId).toBe(MODEL);
    expect(typeof model.doStream).toBe('function');
  });

  serverOnlyIt(
    'mints a speech-bound vcst_ client secret and returns it with the wss url',
    async () => {
      const { createGateway } = await import('./gateway-provider');
      const fetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) =>
          new Response(
            JSON.stringify({ token: 'vcst_minted', expiresAt: 1_700_000_060 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );
      const result = await createGateway({
        apiKey: 'vck_test-token',
        fetch,
      }).experimental_speech.getToken({
        model: MODEL,
        expiresAfterSeconds: 120,
      });

      expect(result).toEqual({
        token: 'vcst_minted',
        expiresAt: 1_700_000_060,
        url: 'wss://ai-gateway.vercel.sh/v4/ai/speech-model?ai-model-id=elevenlabs%2Feleven-flash-v2.5',
      });
      const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(url.toString()).toBe(
        'https://ai-gateway.vercel.sh/v1/realtime/client-secrets',
      );
      expect(JSON.parse(init.body as string)).toMatchObject({
        model: MODEL,
        routeKind: 'speech',
        expiresIn: 120,
      });
      expect(new Headers(init.headers).get('authorization')).toBe(
        'Bearer vck_test-token',
      );
    },
  );

  it('rejects minting (getToken) in browsers', async () => {
    const { createGateway } = await import('./gateway-provider');
    const gateway = createGateway({ apiKey: 'vck_test-token' });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    try {
      await expect(
        gateway.experimental_speech.getToken({ model: MODEL }),
      ).rejects.toThrow(/must be minted server-side/);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'window', descriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
