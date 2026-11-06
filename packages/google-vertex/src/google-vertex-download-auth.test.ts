import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['custom', 'global'] as const)('%s fetch', transport => {
  it.each(['generate', 'stream'] as const)(
    'keeps the Express Mode API key off tool-result downloads during %s',
    async mode => {
      const response = {
        candidates: [
          {
            content: { parts: [{ text: 'done' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      };
      const fetch = vi.fn<FetchFunction>(async input => {
        const url = String(input);
        if (url === 'https://files.example.com/image.png') {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.example.com/image.png' },
          });
        }
        if (url === 'https://cdn.example.com/image.png') {
          return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            headers: { 'content-type': 'image/png' },
          });
        }
        return mode === 'generate'
          ? new Response(JSON.stringify(response), {
              headers: { 'content-type': 'application/json' },
            })
          : new Response(`data: ${JSON.stringify(response)}\n\n`, {
              headers: { 'content-type': 'text/event-stream' },
            });
      });
      vi.stubGlobal(
        'fetch',
        transport === 'global'
          ? fetch
          : vi.fn(() => {
              throw new Error('Expected the custom fetch transport');
            }),
      );
      const provider = createGoogleVertex({
        apiKey: 'vertex-api-key',
        fetch: transport === 'custom' ? fetch : undefined,
      });
      const model = provider('gemini-3.7-flash');
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tool-call-id',
              toolName: 'get-image',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'file',
                    mediaType: 'image/png',
                    data: {
                      type: 'url',
                      url: new URL('https://files.example.com/image.png'),
                    },
                  },
                ],
              },
            },
          ],
        },
      ];

      if (mode === 'generate') {
        await model.doGenerate({ prompt });
      } else {
        const { stream } = await model.doStream({ prompt });
        await convertReadableStreamToArray(stream);
      }

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch.mock.calls.slice(0, 2).map(([url]) => String(url))).toEqual([
        'https://files.example.com/image.png',
        'https://cdn.example.com/image.png',
      ]);
      for (const [, init] of fetch.mock.calls.slice(0, 2)) {
        const headers = new Headers(init?.headers);
        expect(headers.has('x-goog-api-key')).toBe(false);
        expect(headers.has('authorization')).toBe(false);
        expect(init?.redirect).toBe('manual');
      }

      const [apiUrl, apiInit] = fetch.mock.calls[2];
      expect(String(apiUrl)).toBe(
        `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.7-flash:${mode === 'generate' ? 'generateContent' : 'streamGenerateContent?alt=sse'}`,
      );
      expect(new Headers(apiInit?.headers).get('x-goog-api-key')).toBe(
        'vertex-api-key',
      );
    },
  );
});
