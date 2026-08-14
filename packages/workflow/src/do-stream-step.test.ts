import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

const finishPart: LanguageModelV4StreamPart = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: 'stop' },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 1,
      text: undefined,
      reasoning: 1,
    },
  },
};

describe('doStreamStep', () => {
  it('aggregates reasoning by id and keeps the latest provider metadata', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          {
            type: 'reasoning-start',
            id: 'reasoning-1',
            providerMetadata: {
              openai: { itemId: 'rs_initial' },
            },
          },
          {
            type: 'reasoning-delta',
            id: 'reasoning-1',
            delta: 'first ',
          },
          {
            type: 'reasoning-delta',
            id: 'reasoning-1',
            delta: 'second',
            providerMetadata: {
              openai: { itemId: 'rs_delta' },
            },
          },
          {
            type: 'reasoning-end',
            id: 'reasoning-1',
            providerMetadata: {
              openai: {
                itemId: 'rs_final',
                reasoningEncryptedContent: 'encrypted-final',
              },
            },
          },
          finishPart,
        ]),
      }),
    });

    const result = await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      model,
    );

    expect(result.raw.reasoning).toEqual([
      {
        text: 'first second',
        providerMetadata: {
          openai: {
            itemId: 'rs_final',
            reasoningEncryptedContent: 'encrypted-final',
          },
        },
      },
    ]);
  });

  it('retains ordered reasoning parts when encrypted reasoning has no deltas', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          {
            type: 'reasoning-start',
            id: 'reasoning-encrypted',
            providerMetadata: {
              openai: {
                itemId: 'rs_encrypted',
                reasoningEncryptedContent: 'encrypted-only',
              },
            },
          },
          { type: 'reasoning-end', id: 'reasoning-encrypted' },
          { type: 'reasoning-start', id: 'reasoning-visible' },
          {
            type: 'reasoning-delta',
            id: 'reasoning-visible',
            delta: 'visible',
          },
          { type: 'reasoning-end', id: 'reasoning-visible' },
          finishPart,
        ]),
      }),
    });

    const result = await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      model,
    );

    expect(result.raw.reasoning).toEqual([
      {
        text: '',
        providerMetadata: {
          openai: {
            itemId: 'rs_encrypted',
            reasoningEncryptedContent: 'encrypted-only',
          },
        },
      },
      { text: 'visible' },
    ]);
  });

  it('starts a new reasoning part when an id is reused after ending', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          { type: 'reasoning-start', id: 'reused' },
          {
            type: 'reasoning-delta',
            id: 'reused',
            delta: 'first',
          },
          { type: 'reasoning-end', id: 'reused' },
          {
            type: 'reasoning-start',
            id: 'reused',
            providerMetadata: {
              test: { sequence: 2 },
            },
          },
          {
            type: 'reasoning-delta',
            id: 'reused',
            delta: 'second',
          },
          { type: 'reasoning-end', id: 'reused' },
          finishPart,
        ]),
      }),
    });

    const result = await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      model,
    );

    expect(result.raw.reasoning).toEqual([
      { text: 'first' },
      {
        text: 'second',
        providerMetadata: { test: { sequence: 2 } },
      },
    ]);
  });

  it('keeps interleaved and orphan reasoning parts in first-seen order', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          { type: 'reasoning-delta', id: 'first', delta: 'A' },
          { type: 'reasoning-start', id: 'second' },
          { type: 'reasoning-delta', id: 'second', delta: 'B' },
          { type: 'reasoning-delta', id: 'first', delta: 'C' },
          { type: 'reasoning-end', id: 'second' },
          { type: 'reasoning-end', id: 'first' },
          {
            type: 'reasoning-end',
            id: 'orphan-end',
            providerMetadata: { test: { orphan: true } },
          },
          finishPart,
        ]),
      }),
    });

    const result = await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      model,
    );

    expect(result.raw.reasoning).toEqual([
      { text: 'AC' },
      { text: 'B' },
      {
        text: '',
        providerMetadata: { test: { orphan: true } },
      },
    ]);
  });

  it('records exact reasoning, reasoning-file, and tool-call order', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          { type: 'reasoning-start', id: 'reasoning-1' },
          {
            type: 'reasoning-delta',
            id: 'reasoning-1',
            delta: 'first',
          },
          { type: 'reasoning-end', id: 'reasoning-1' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{"query":"first"}',
          },
          {
            type: 'reasoning-file',
            data: { type: 'data', data: 'c2lnbmVkLXRob3VnaHQ=' },
            mediaType: 'application/octet-stream',
            providerMetadata: {
              google: { thoughtSignature: 'file-signature' },
            },
          },
          { type: 'reasoning-start', id: 'reasoning-2' },
          {
            type: 'reasoning-delta',
            id: 'reasoning-2',
            delta: 'second',
          },
          { type: 'reasoning-end', id: 'reasoning-2' },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'lookup',
            input: '{"query":"second"}',
          },
          {
            ...finishPart,
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          },
        ]),
      }),
    });

    const result = await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      model,
      undefined,
      {
        lookup: {
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
    );

    expect(result.raw.reasoning).toEqual([
      { text: 'first' },
      { text: 'second' },
    ]);
    expect(result.raw.reasoningFiles).toEqual([
      {
        data: 'c2lnbmVkLXRob3VnaHQ=',
        mediaType: 'application/octet-stream',
        providerMetadata: {
          google: { thoughtSignature: 'file-signature' },
        },
      },
    ]);
    expect(result.raw.reasoningAndToolCallOrder).toEqual([
      { type: 'reasoning', index: 0 },
      { type: 'tool-call', index: 0 },
      { type: 'reasoning-file', index: 0 },
      { type: 'reasoning', index: 1 },
      { type: 'tool-call', index: 1 },
    ]);
  });
});
