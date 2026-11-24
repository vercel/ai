import { InvalidArgumentError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createFal } from './fal-provider';
import { FalTranscriptionModel } from './fal-transcription-model';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createFal({ apiKey: 'test-api-key' });
const model = provider.transcription('wizper');

const server = createTestServer({
  'https://queue.fal.run/fal-ai/wizper': {},
  'https://queue.fal.run/fal-ai/wizper/requests/test-id': {},
  'https://queue.fal.run/fal-ai/wizper/requests/abc%2F..%2F..%2Finternal': {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://queue.fal.run/fal-ai/wizper'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync('src/__fixtures__/fal-transcription-queue.json', 'utf8'),
    ),
  };
  server.urls['https://queue.fal.run/fal-ai/wizper/requests/test-id'].response =
    {
      type: 'json-value',
      headers,
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/fal-transcription-result.json',
          'utf8',
        ),
      ),
    };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should encode the request ID as a single URL path segment', async () => {
      const requestId = 'abc/../../internal';

      server.urls['https://queue.fal.run/fal-ai/wizper'].response = {
        type: 'json-value',
        body: {
          status: 'IN_QUEUE',
          request_id: requestId,
          response_url: `https://queue.fal.run/fal-ai/wizper/requests/${requestId}/result`,
          status_url: `https://queue.fal.run/fal-ai/wizper/requests/${requestId}`,
          cancel_url: `https://queue.fal.run/fal-ai/wizper/requests/${requestId}/cancel`,
          logs: null,
          metrics: {},
          queue_position: 0,
        },
      };
      server.urls[
        'https://queue.fal.run/fal-ai/wizper/requests/abc%2F..%2F..%2Finternal'
      ].response = {
        type: 'json-value',
        body: {
          text: 'Hello from the Versal AISDK.',
          chunks: [
            { timestamp: [0, 2.508], text: 'Hello from the Versal AISDK.' },
          ],
          languages: ['en'],
        },
      };

      await model.doGenerate({ audio: audioData, mediaType: 'audio/wav' });

      expect(server.calls[1].requestUrl).toBe(
        `https://queue.fal.run/fal-ai/wizper/requests/${encodeURIComponent(
          requestId,
        )}`,
      );
    });

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        audio_url: expect.stringMatching(/^data:audio\//),
        task: 'transcribe',
        diarize: true,
        chunk_level: 'word',
      });
    });

    it('should pass headers', async () => {
      const provider = createFal({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('wizper').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Key test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"Hello from the Versal AISDK."`,
      );
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      });

      const testDate = new Date(0);
      const customModel = new FalTranscriptionModel('wizper', {
        provider: 'test-provider',
        url: ({ path }) => path,
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.response).toMatchSnapshot();
    });
  });

  describe('response metadata', () => {
    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonFixtureResponse();

      const testDate = new Date(0);
      const customModel = new FalTranscriptionModel('wizper', {
        provider: 'test-provider',
        url: ({ path }) => path,
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      });

      const result = await customModel.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.response.timestamp.getTime()).toEqual(testDate.getTime());
      expect(result.response.modelId).toBe('wizper');
    });
  });

  describe('polling timeout', () => {
    function prepareInProgressResponse(onPoll: () => void) {
      server.urls[
        'https://queue.fal.run/fal-ai/wizper/requests/test-id'
      ].response = () => {
        onPoll();
        return {
          type: 'error',
          status: 400,
          body: JSON.stringify({ detail: 'Request is still in progress' }),
        };
      };
    }

    it('throws TranscriptionRequestTimedOut after the configured pollTimeoutMs', async () => {
      prepareJsonFixtureResponse();

      let pollCount = 0;
      prepareInProgressResponse(() => {
        pollCount++;
      });

      const shortTimeoutProvider = createFal({
        apiKey: 'test-api-key',
        pollTimeoutMs: 20,
      });

      await expect(
        shortTimeoutProvider.transcription('wizper').doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
        }),
      ).rejects.toMatchObject({
        name: 'TranscriptionRequestTimedOut',
        message: 'Transcription request timed out after 20 ms',
      });

      expect(pollCount).toBe(1);
    });

    it('resolves pollTimeoutMs from providerOptions.fal before provider settings', async () => {
      prepareJsonFixtureResponse();

      let pollCount = 0;
      prepareInProgressResponse(() => {
        pollCount++;
      });

      const longTimeoutProvider = createFal({
        apiKey: 'test-api-key',
        pollTimeoutMs: 600000,
      });

      await expect(
        longTimeoutProvider.transcription('wizper').doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
          providerOptions: {
            fal: {
              pollTimeoutMs: 20,
            },
          },
        }),
      ).rejects.toMatchObject({
        name: 'TranscriptionRequestTimedOut',
        message: 'Transcription request timed out after 20 ms',
      });

      expect(pollCount).toBe(1);
    });

    it('keeps polling within a raised pollTimeoutMs', async () => {
      prepareJsonFixtureResponse();

      let pollCount = 0;
      server.urls[
        'https://queue.fal.run/fal-ai/wizper/requests/test-id'
      ].response = () => {
        pollCount++;
        return pollCount < 2
          ? {
              type: 'error',
              status: 400,
              body: JSON.stringify({
                detail: 'Request is still in progress',
              }),
            }
          : {
              type: 'json-value',
              body: JSON.parse(
                fs.readFileSync(
                  'src/__fixtures__/fal-transcription-result.json',
                  'utf8',
                ),
              ),
            };
      };

      const longTimeoutProvider = createFal({
        apiKey: 'test-api-key',
        pollTimeoutMs: 600000,
      });

      const result = await longTimeoutProvider
        .transcription('wizper')
        .doGenerate({ audio: audioData, mediaType: 'audio/wav' });

      expect(pollCount).toBe(2);
      expect(result.text).toBeTruthy();
    });

    it('keeps polling when pollTimeoutMs exceeds the timer limit', async () => {
      prepareJsonFixtureResponse();

      let pollCount = 0;
      server.urls[
        'https://queue.fal.run/fal-ai/wizper/requests/test-id'
      ].response = () => {
        pollCount++;
        return pollCount < 2
          ? {
              type: 'error',
              status: 400,
              body: JSON.stringify({
                detail: 'Request is still in progress',
              }),
            }
          : {
              type: 'json-value',
              body: JSON.parse(
                fs.readFileSync(
                  'src/__fixtures__/fal-transcription-result.json',
                  'utf8',
                ),
              ),
            };
      };

      const result = await createFal({
        apiKey: 'test-api-key',
        pollTimeoutMs: Number.MAX_SAFE_INTEGER,
      })
        .transcription('wizper')
        .doGenerate({ audio: audioData, mediaType: 'audio/wav' });

      expect(pollCount).toBe(2);
      expect(result.text).toBeTruthy();
    });

    it('uses the 60000 ms default when no override is configured', async () => {
      prepareJsonFixtureResponse();
      prepareInProgressResponse(() => {});
      vi.useFakeTimers({ shouldAdvanceTime: true });

      try {
        const result = model.doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
        });
        const assertion = expect(result).rejects.toMatchObject({
          name: 'TranscriptionRequestTimedOut',
          message: 'Transcription request timed out after 60000 ms',
        });

        await vi.advanceTimersByTimeAsync(59000);
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    describe('when a poll request stalls', () => {
      function createStallingFal(
        settings: Parameters<typeof createFal>[0] = {},
      ) {
        const pollSignals: (AbortSignal | null | undefined)[] = [];
        const fetch: FetchFunction = async (input, init) => {
          const url = input instanceof Request ? input.url : input.toString();

          if (url === 'https://queue.fal.run/fal-ai/wizper') {
            return new Response(JSON.stringify({ request_id: 'test-id' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          const signal = init?.signal;
          pollSignals.push(signal);
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          });
        };

        return {
          pollSignals,
          provider: createFal({ apiKey: 'test-api-key', fetch, ...settings }),
        };
      }

      it('aborts the pending poll once pollTimeoutMs elapses', async () => {
        const { provider, pollSignals } = createStallingFal({
          pollTimeoutMs: 25,
        });

        await expect(
          provider.transcription('wizper').doGenerate({
            audio: audioData,
            mediaType: 'audio/wav',
          }),
        ).rejects.toMatchObject({
          name: 'TranscriptionRequestTimedOut',
          message: 'Transcription request timed out after 25 ms',
        });

        expect(pollSignals).toHaveLength(1);
        expect(pollSignals[0]?.aborted).toBe(true);
      });

      it('rethrows the caller abort reason instead of a timeout', async () => {
        const { provider, pollSignals } = createStallingFal({
          pollTimeoutMs: 600000,
        });
        const controller = new AbortController();
        const reason = new Error('caller cancelled');

        const result = provider.transcription('wizper').doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
          abortSignal: controller.signal,
        });
        await vi.waitFor(() => expect(pollSignals).toHaveLength(1));
        controller.abort(reason);

        await expect(result).rejects.toBe(reason);
        expect(pollSignals[0]?.aborted).toBe(true);
      });
    });

    it('does not send pollTimeoutMs to the fal.ai API', async () => {
      prepareJsonFixtureResponse();

      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          fal: {
            pollTimeoutMs: 20,
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('pollTimeoutMs');
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects provider pollTimeoutMs = %s',
      value => {
        expect(() =>
          createFal({ apiKey: 'test-api-key', pollTimeoutMs: value }),
        ).toThrow(InvalidArgumentError);
      },
    );

    it('rejects invalid per-call pollTimeoutMs', async () => {
      prepareJsonFixtureResponse();

      await expect(
        model.doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
          providerOptions: {
            fal: {
              pollTimeoutMs: 0,
            },
          },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
    });
  });
});
