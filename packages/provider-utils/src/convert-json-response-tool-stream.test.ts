import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertJsonResponseToolStream } from './convert-json-response-tool-stream';
import { createNullLanguageModelUsage } from './create-null-language-model-usage';
import { convertArrayToReadableStream } from './test/convert-array-to-readable-stream';
import { convertReadableStreamToArray } from './test/convert-readable-stream-to-array';

const metadata = { google: { thoughtSignature: 'signature' } };
const finish: LanguageModelV4StreamPart = {
  type: 'finish',
  finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
  usage: createNullLanguageModelUsage(),
};
const responseParts: LanguageModelV4StreamPart[] = [
  {
    type: 'tool-input-start',
    id: 'response',
    toolName: 'json',
    providerMetadata: metadata,
  },
  { type: 'tool-input-delta', id: 'response', delta: '{"date":' },
  { type: 'tool-input-delta', id: 'response', delta: '"2031-06-17"}' },
  { type: 'tool-input-end', id: 'response' },
  {
    type: 'tool-call',
    toolCallId: 'response',
    toolName: 'json',
    input: '{"date":"2031-06-17"}',
    providerMetadata: metadata,
  },
];

async function convert(parts: LanguageModelV4StreamPart[]) {
  return convertReadableStreamToArray(
    convertArrayToReadableStream(parts).pipeThrough(
      convertJsonResponseToolStream('json'),
    ),
  );
}

describe('convertJsonResponseToolStream', () => {
  it('converts streamed arguments and preserves metadata and usage', async () => {
    expect(await convert([...responseParts, finish])).toEqual([
      { type: 'text-start', id: 'response', providerMetadata: metadata },
      { type: 'text-delta', id: 'response', delta: '{"date":' },
      { type: 'text-delta', id: 'response', delta: '"2031-06-17"}' },
      { type: 'text-end', id: 'response', providerMetadata: metadata },
      { ...finish, finishReason: { unified: 'stop', raw: 'tool_calls' } },
    ]);
  });

  it('uses complete input when the provider emits no argument deltas', async () => {
    expect(
      await convert([
        { type: 'tool-input-start', id: 'response', toolName: 'json' },
        { type: 'tool-input-delta', id: 'response', delta: '' },
        { type: 'tool-input-end', id: 'response' },
        {
          type: 'tool-call',
          toolCallId: 'response',
          toolName: 'json',
          input: '{}',
        },
      ]),
    ).toEqual([
      { type: 'text-start', id: 'response' },
      { type: 'text-delta', id: 'response', delta: '' },
      { type: 'text-delta', id: 'response', delta: '{}' },
      { type: 'text-end', id: 'response' },
    ]);
  });

  it.each(['before', 'after'])(
    'preserves an application call %s the response call',
    async order => {
      const applicationParts: LanguageModelV4StreamPart[] = [
        {
          type: 'tool-input-start',
          id: 'application',
          toolName: 'resolveDate',
        },
        { type: 'tool-input-delta', id: 'application', delta: '{}' },
        { type: 'tool-input-end', id: 'application' },
        {
          type: 'tool-call',
          toolCallId: 'application',
          toolName: 'resolveDate',
          input: '{}',
        },
      ];
      const parts = await convert([
        ...(order === 'before'
          ? [...applicationParts, ...responseParts]
          : [...responseParts, ...applicationParts]),
        finish,
      ]);
      expect(parts.filter(part => part.type.startsWith('tool-'))).toEqual(
        applicationParts,
      );
      expect(parts.at(-1)).toEqual(finish);
      expect(
        parts
          .filter(part => part.type === 'text-delta')
          .map(part => part.delta)
          .join(''),
      ).toBe('{"date":"2031-06-17"}');
    },
  );

  it('preserves an incomplete finish reason', async () => {
    const incomplete: LanguageModelV4StreamPart = {
      ...finish,
      finishReason: { unified: 'length', raw: 'MAX_TOKENS' },
    };
    expect((await convert([...responseParts, incomplete])).at(-1)).toEqual(
      incomplete,
    );
  });

  it('omits conversational text and passes through reasoning and errors', async () => {
    const reasoning: LanguageModelV4StreamPart = {
      type: 'reasoning-delta',
      id: 'reasoning',
      delta: 'Thinking.',
    };
    const error: LanguageModelV4StreamPart = {
      type: 'error',
      error: new Error('provider error'),
    };
    expect(
      await convert([
        { type: 'text-start', id: 'conversation' },
        {
          type: 'text-delta',
          id: 'conversation',
          delta: 'Here is the answer.',
        },
        { type: 'text-end', id: 'conversation' },
        reasoning,
        error,
      ]),
    ).toEqual([reasoning, error]);
  });
});
