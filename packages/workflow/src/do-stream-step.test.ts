import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { Experimental_LanguageModelStreamPart, LanguageModel } from 'ai';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import type * as AiModule from 'ai';

const { getStepMetadata, streamModelCall } = vi.hoisted(() => ({
  getStepMetadata: vi.fn(),
  streamModelCall: vi.fn(),
}));

vi.mock('workflow', () => ({ getStepMetadata }));
vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof AiModule>();
  return {
    ...actual,
    experimental_streamLanguageModelCall: streamModelCall,
  };
});

const { doStreamStep } = await import('./do-stream-step.js');

describe('doStreamStep', () => {
  it('does not emit an invalidation boundary for direct initial calls', async () => {
    getStepMetadata.mockImplementationOnce(() => {
      throw new Error(
        '`getStepMetadata()` can only be called inside a step function',
      );
    });
    streamModelCall.mockResolvedValueOnce({
      stream: convertArrayToReadableStream([]),
    });

    const chunks: unknown[] = [];
    const writable = new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    await doStreamStep(
      [] as unknown as LanguageModelV4Prompt,
      {} as LanguageModel,
      writable as WritableStream<
        Experimental_LanguageModelStreamPart<Record<string, never>>
      >,
    );

    expect(chunks).toEqual([]);
  });

  it('writes an invalidation boundary before a retried model stream', async () => {
    getStepMetadata.mockReturnValue({ attempt: 2 });
    streamModelCall.mockResolvedValueOnce({
      stream: convertArrayToReadableStream([]),
    });

    const chunks: unknown[] = [];
    const writable = new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    await doStreamStep(
      [] as unknown as LanguageModelV4Prompt,
      {} as LanguageModel,
      writable as WritableStream<
        Experimental_LanguageModelStreamPart<Record<string, never>>
      >,
    );

    expect(chunks).toEqual([
      { type: 'finish-step' },
      { type: 'reload' },
      { type: 'start-step' },
    ]);
  });
});
