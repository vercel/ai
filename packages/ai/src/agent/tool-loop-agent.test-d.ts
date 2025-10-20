import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Output } from '../generate-text';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { ToolLoopAgent } from './tool-loop-agent';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { DeepPartial } from '../util/deep-partial';

describe('ToolLoopAgent', () => {
  describe('generate', () => {
    it('should not allow system prompt', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
      });

      await agent.generate({
        // @ts-expect-error - system prompt is not allowed
        system: '123',
        prompt: 'Hello, world!',
      });
    });

    it('should infer output type', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
        experimental_output: Output.object({
          schema: z.object({ value: z.string() }),
        }),
      });

      const generateResult = await agent.generate({
        prompt: 'Hello, world!',
      });

      const output = generateResult.experimental_output;

      expectTypeOf<typeof output>().toEqualTypeOf<{ value: string }>();
    });
  });

  describe('stream', () => {
    it('should not allow system prompt', () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
      });

      agent.stream({
        // @ts-expect-error - system prompt is not allowed
        system: '123',
        prompt: 'Hello, world!',
      });
    });

    it('should infer output type', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
        experimental_output: Output.object({
          schema: z.object({ value: z.string() }),
        }),
      });

      const streamResult = agent.stream({
        prompt: 'Hello, world!',
      });

      const partialOutputStream = streamResult.experimental_partialOutputStream;

      expectTypeOf<typeof partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<DeepPartial<{ value: string }>>
      >();
    });
  });
});
