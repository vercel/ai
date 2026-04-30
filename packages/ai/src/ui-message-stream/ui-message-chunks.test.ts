import { describe, it, expect } from 'vitest';
import { uiMessageChunkSchema } from './ui-message-chunks';
import { validateTypes } from '@ai-sdk/provider-utils';

describe('uiMessageChunkSchema', () => {
  it('should validate a chunk with recognized fields', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        id: '1',
        delta: 'hello',
      },
    });

    expect(chunk).toEqual({
      type: 'text-delta',
      id: '1',
      delta: 'hello',
    });
  });

  it('should pass through unknown fields without error', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        id: '1',
        delta: 'hello',
        unknownField: 'value',
      },
    });

    expect(chunk).toEqual({
      type: 'text-delta',
      id: '1',
      delta: 'hello',
      unknownField: 'value',
    });
  });

  it('should pass through unknown fields on start-step chunk', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'start-step',
        futureField: 42,
      },
    });

    expect(chunk).toEqual({
      type: 'start-step',
      futureField: 42,
    });
  });

  it('should pass through unknown fields on finish chunk with enum field', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'finish',
        finishReason: 'stop',
        futureField: true,
      },
    });

    expect(chunk).toEqual({
      type: 'finish',
      finishReason: 'stop',
      futureField: true,
    });
  });

  it('should pass through providerMetadata on error chunk (issue #13733)', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'error',
        errorText: 'something went wrong',
        providerMetadata: { anthropic: { cacheControl: 'ephemeral' } },
      },
    });

    expect(chunk).toEqual({
      type: 'error',
      errorText: 'something went wrong',
      providerMetadata: { anthropic: { cacheControl: 'ephemeral' } },
    });
  });

  it('should pass through unknown fields on tool approval chunks', async () => {
    const chunks = [
      {
        type: 'tool-approval-request',
        approvalId: 'approval-1',
        toolCallId: 'tool-call-1',
        futureField: 'request',
      },
      {
        type: 'tool-approval-response',
        approvalId: 'approval-1',
        approved: true,
        futureField: 'response',
      },
      {
        type: 'tool-output-denied',
        toolCallId: 'tool-call-1',
        futureField: 'denied',
      },
    ];

    for (const value of chunks) {
      await expect(
        validateTypes({
          schema: uiMessageChunkSchema,
          value,
        }),
      ).resolves.toEqual(value);
    }
  });

  it('should reject a chunk with an invalid type', async () => {
    await expect(
      validateTypes({
        schema: uiMessageChunkSchema,
        value: {
          type: 'invalid-type',
        },
      }),
    ).rejects.toThrow();
  });
});
