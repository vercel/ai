import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

describe('Google Vertex tool result files', () => {
  const baseURL = 'https://aiplatform.googleapis.com/v1/publishers/google';
  const requestUrl = `${baseURL}/models/*`;
  const fileUrl = 'https://example.com/report.pdf';
  const response = {
    candidates: [
      {
        content: { role: 'model', parts: [{ text: 'ok' }] },
        finishReason: 'STOP',
        index: 0,
      },
    ],
  };
  const server = createTestServer({
    [requestUrl]: { response: { type: 'json-value', body: response } },
    [fileUrl]: {
      response: {
        type: 'binary',
        body: Buffer.from('%PDF-demo'),
        headers: { 'content-type': 'application/pdf' },
      },
    },
  });

  function createModel(modelId = 'gemini-3.8-flash') {
    // Use the real Google model with the same URL capabilities as Vertex.
    return new GoogleGenerativeAILanguageModel(modelId, {
      provider: 'google.vertex.chat',
      baseURL,
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
      supportedUrls: () => ({ '*': [/^https?:\/\/.*$/, /^gs:\/\/.*$/] }),
    });
  }

  function createMessages(url: string, mediaType?: string): ModelMessage[] {
    return [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'view_files',
            output: {
              type: 'content',
              value: [{ type: 'file-url', url, mediaType }],
            },
          },
        ],
      },
    ];
  }

  describe.each(['generateText', 'streamText'] as const)('%s', method => {
    async function run(messages: ModelMessage[], modelId?: string) {
      server.urls[requestUrl].response =
        method === 'generateText'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [`data: ${JSON.stringify(response)}\n\n`],
            };
      const options = { model: createModel(modelId), messages, maxRetries: 0 };
      const result =
        method === 'generateText'
          ? await generateText(options)
          : streamText(options);
      expect(await result.text).toBe('ok');
      return (await server.calls.at(-1)!.requestBodyJson).contents[0].parts;
    }

    it.each([
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
      'text/plain',
    ])('forwards supported GCS files with MIME type %s', async mediaType => {
      const url = 'gs://example-bucket/My File';
      const parts = await run(createMessages(url, mediaType));
      expect(server.calls).toHaveLength(1);
      expect(parts[0].functionResponse.parts).toEqual([
        { fileData: { fileUri: url, mimeType: mediaType } },
      ]);
    });

    it.each(['gemini-3.8-flash', 'gemini-2.5-flash'])(
      'downloads HTTPS files with a MIME type for %s',
      async modelId => {
        const parts = await run(
          createMessages(fileUrl, 'application/pdf'),
          modelId,
        );
        expect(server.calls).toHaveLength(2);
        expect(server.calls[0].requestUrl).toBe(fileUrl);
        const fileParts = modelId.startsWith('gemini-3')
          ? parts[0].functionResponse.parts
          : parts.filter((part: { inlineData?: unknown }) => part.inlineData);
        expect(fileParts).toEqual([
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: 'JVBERi1kZW1v',
            },
          },
        ]);
      },
    );

    it('still downloads HTTPS files without a MIME type', async () => {
      const parts = await run(createMessages(fileUrl));
      expect(server.calls).toHaveLength(2);
      expect(parts[0].functionResponse.parts).toEqual([
        {
          inlineData: { mimeType: 'application/pdf', data: 'JVBERi1kZW1v' },
        },
      ]);
    });

    it('preserves inline data URLs', async () => {
      const parts = await run(
        createMessages('data:application/pdf;base64,JVBERi1kZW1v'),
      );
      expect(server.calls).toHaveLength(1);
      expect(parts[0].functionResponse.parts).toEqual([
        {
          inlineData: { mimeType: 'application/pdf', data: 'JVBERi1kZW1v' },
        },
      ]);
    });
  });

  it.each([
    'video/mp4',
    'image/*',
    'image',
    'image/png-not-supported',
    'application/pdf-not-supported',
    undefined,
  ])('does not forward unsupported GCS MIME type %s', async mediaType => {
    await expect(
      generateText({
        model: createModel(),
        messages: createMessages('gs://example-bucket/file', mediaType),
        maxRetries: 0,
      }),
    ).rejects.toThrow('URL scheme must be http, https, or data, got gs:');
    expect(server.calls).toHaveLength(0);
  });

  it('does not forward GCS files for older Gemini models', async () => {
    await expect(
      generateText({
        model: createModel('gemini-2.5-flash'),
        messages: createMessages('gs://example-bucket/file', 'image/png'),
        maxRetries: 0,
      }),
    ).rejects.toThrow('URL scheme must be http, https, or data, got gs:');
    expect(server.calls).toHaveLength(0);
  });
});
