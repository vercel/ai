import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { smoothStream } from './smooth-stream';
import { streamText } from './stream-text';

const tools = {
  weather: tool({
    inputSchema: z.object({ city: z.string() }),
  }),
  upload: tool({
    inputSchema: z.object({ data: z.string() }),
  }),
};

describe('smoothStream types', () => {
  it('accepts tool input smoothing in streamText', () => {
    const result = streamText({
      model: new MockLanguageModelV4(),
      prompt: 'Test',
      tools,
      experimental_transform: smoothStream({
        toolInputSmoothing: {
          chunking: 'character',
          include: ['weather'],
          exclude: ['upload'],
        },
      }),
    });

    expectTypeOf(result).toBeObject();
  });

  it('accepts custom tool input chunk detectors', () => {
    smoothStream<typeof tools>({
      toolInputSmoothing: {
        chunking: buffer => buffer.match(/^.{1,5}/)?.[0],
      },
    });

    smoothStream<typeof tools>({
      toolInputSmoothing: {
        chunking: /[:,]/,
      },
    });
  });

  it('restricts tool selection to tool names', () => {
    smoothStream<typeof tools>({
      toolInputSmoothing: {
        // @ts-expect-error unknownTool is not part of the tool set
        include: ['unknownTool'],
      },
    });

    smoothStream<typeof tools>({
      toolInputSmoothing: {
        // @ts-expect-error unknownTool is not part of the tool set
        exclude: ['unknownTool'],
      },
    });
  });

  it('rejects text chunking strategies for tool inputs', () => {
    smoothStream<typeof tools>({
      toolInputSmoothing: {
        // @ts-expect-error tool inputs support character, RegExp, or ChunkDetector chunking
        chunking: 'word',
      },
    });
  });
});
