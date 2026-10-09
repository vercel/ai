import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { simulateStreamingMiddleware } from '../middleware/simulate-streaming-middleware';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import type { Citation } from '../types/citation';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { validateUIMessages } from '../ui/validate-ui-messages';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

const citations: Array<Citation> = [
  {
    source: {
      type: 'source',
      sourceType: 'url',
      id: 'cited',
      url: 'https://example.com/cited',
      title: 'Cited reference',
    },
    startIndex: 0,
    endIndex: 6,
  },
  {
    source: {
      type: 'source',
      sourceType: 'document',
      id: 'document',
      mediaType: 'application/pdf',
      title: 'Report',
      filename: 'report.pdf',
      providerMetadata: {
        anthropic: { start_page_number: 1, end_page_number: 2 },
      },
    },
    citedText: 'Supporting passage',
  },
];
const retrievedSource = {
  type: 'source',
  sourceType: 'url',
  id: 'retrieved',
  url: 'https://example.com/retrieved',
} as const;
const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe('citations', () => {
  it.each(['Answer', ''])(
    'preserves citations when simulating streaming for text %j',
    async text => {
      const result = streamText({
        model: wrapLanguageModel({
          model: new MockLanguageModelV4({
            doGenerate: {
              content: [{ type: 'text', text, citations }],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
              warnings: [],
            },
          }),
          middleware: simulateStreamingMiddleware(),
        }),
        prompt: 'Question',
      });
      await result.consumeStream();
      expect(
        (await result.content).find(part => part.type === 'text'),
      ).toMatchObject({ text, citations });
    },
  );
  it('preserves citations on generated text independently of retrieved sources', async () => {
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            retrievedSource,
            { type: 'text', text: 'Answer', citations },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        },
      }),
      prompt: 'Question',
    });
    expect(result.content.find(part => part.type === 'text')).toMatchObject({
      text: 'Answer',
      citations,
    });
    expect(result.sources).toEqual([retrievedSource]);
  });

  it('preserves text-end citations in core results and validated UI messages', async () => {
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            retrievedSource,
            { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: 'Answer' },
            { type: 'text-end', id: 'text', citations },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
        },
      }),
      prompt: 'Question',
    });
    const messages = await convertReadableStreamToArray(
      readUIMessageStream({
        stream: result.toUIMessageStream(),
      }),
    );
    const finalMessage = messages.at(-1)!;
    expect(finalMessage.parts.find(part => part.type === 'text')).toMatchObject(
      { text: 'Answer', citations },
    );
    expect(
      (await result.content).find(part => part.type === 'text'),
    ).toMatchObject({ text: 'Answer', citations });
    expect(await result.sources).toEqual([retrievedSource]);
    expect(await validateUIMessages({ messages: [finalMessage] })).toEqual([
      finalMessage,
    ]);
    // Output citations are presentation data; a follow-up sends the text and
    // provider metadata, without injecting normalized references into the prompt.
    expect(await convertToModelMessages([finalMessage])).toMatchObject([
      { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
    ]);
  });

  it('rejects malformed citations in persisted UI messages', async () => {
    await expect(
      validateUIMessages({
        messages: [
          {
            id: 'message',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: 'Answer',
                citations: [
                  {
                    source: {
                      type: 'source',
                      sourceType: 'url',
                      id: 'citation',
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
