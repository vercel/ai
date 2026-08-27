import type { JSONValue } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
<<<<<<< HEAD
import { z } from 'zod';
import { Output, streamText } from '../generate-text';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
=======
import { z } from 'zod/v4';
import {
  Output,
  streamText,
  type StreamTextEndEvent,
  type StreamTextOnEndCallback,
} from '../generate-text';
import type { Instructions } from '../prompt';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import type { ProviderMetadata } from '../types';
import type { UIMessage } from '../ui';
import type {
  UIMessageStreamOnEndCallback,
  UIMessageStreamOnFinishCallback,
} from '../ui-message-stream';
>>>>>>> 6669d691c7 (fix: include parsed structured output in streamText end callbacks (#17717))
import type { AsyncIterableStream } from '../util';
import type { DeepPartial } from '../util/deep-partial';

describe('streamText types', () => {
<<<<<<< HEAD
=======
  describe('onLanguageModelCallEnd', () => {
    it('should expose provider metadata', () => {
      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        onLanguageModelCallEnd: event => {
          expectTypeOf(event.providerMetadata).toEqualTypeOf<
            ProviderMetadata | undefined
          >();
        },
      });
    });
  });

  describe('experimental_toolCallers', () => {
    it('should accept caller-capable tool names', () => {
      const codeMode = experimental_toolCaller(
        tool({
          inputSchema: z.object({}),
          execute: async () => undefined,
        }),
        {
          type: 'local',
          bind: () =>
            tool({
              inputSchema: z.object({}),
              execute: async () => undefined,
            }),
        },
      );

      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        tools: {
          code_mode: codeMode,
          getInventory: tool({
            inputSchema: z.object({ sku: z.string() }),
            execute: async ({ sku }) => ({ sku }),
          }),
        },
        experimental_toolCallers: {
          getInventory: ['AI_SDK_DIRECT_TOOL_CALL', 'code_mode'],
        },
      });
    });
  });

  describe('timeout', () => {
    it('should accept a first chunk timeout', () => {
      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        timeout: { firstChunkMs: 1000 },
      });
    });
  });

  describe('onEnd', () => {
    it('should expose end event properties', () => {
      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        onEnd: event => {
          expectTypeOf(event).toMatchTypeOf<GenerateTextEndEvent>();
          expectTypeOf(event.totalUsage).toEqualTypeOf<
            GenerateTextEndEvent['usage']
          >();
          expectTypeOf(event.reasoning).toEqualTypeOf<
            StepResult<any>['reasoning']
          >();
          expectTypeOf(event.reasoningText).toEqualTypeOf<string | undefined>();
          expectTypeOf(event.request).toEqualTypeOf<
            StepResult<any>['request']
          >();
          expectTypeOf(event.response).toEqualTypeOf<
            StepResult<any>['response']
          >();
          expectTypeOf(event.providerMetadata).toEqualTypeOf<
            StepResult<any>['providerMetadata']
          >();
        },
      });
    });

    it('should infer structured output for reusable callbacks', () => {
      const output = Output.object({
        schema: z.object({ value: z.string() }),
      });
      const onEnd: StreamTextOnEndCallback<
        {},
        Context,
        typeof output
      > = event => {
        expectTypeOf(event).toEqualTypeOf<
          StreamTextEndEvent<{}, Context, typeof output>
        >();
        expectTypeOf(event.output).toEqualTypeOf<
          { value: string } | undefined
        >();
      };

      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        output,
        onEnd,
      });
    });
  });

  describe('onFinish compatibility', () => {
    it('should expose deprecated AI SDK 6 properties', () => {
      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        onFinish: event => {
          expectTypeOf(event).toMatchTypeOf<GenerateTextEndEvent>();
          expectTypeOf(event.totalUsage).toEqualTypeOf<
            GenerateTextEndEvent['usage']
          >();
          expectTypeOf(event.reasoning).toEqualTypeOf<
            StepResult<any>['reasoning']
          >();
          expectTypeOf(event.reasoningText).toEqualTypeOf<string | undefined>();
          expectTypeOf(event.request).toEqualTypeOf<
            StepResult<any>['request']
          >();
          expectTypeOf(event.response).toEqualTypeOf<
            StepResult<any>['response']
          >();
          expectTypeOf(event.providerMetadata).toEqualTypeOf<
            StepResult<any>['providerMetadata']
          >();
        },
      });
    });

    it('should infer structured output', () => {
      streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
        output: Output.object({
          schema: z.object({ value: z.string() }),
        }),
        onFinish: event => {
          expectTypeOf(event.output).toEqualTypeOf<
            { value: string } | undefined
          >();
        },
      });
    });
  });

  describe('toUIMessageStream options', () => {
    it('should support onEnd and deprecated onFinish', () => {
      const result = streamText({
        model: new MockLanguageModelV4(),
        prompt: 'Hello',
      });

      result.toUIMessageStream({
        onEnd: event => {
          expectTypeOf(event).toMatchTypeOf<
            Parameters<UIMessageStreamOnEndCallback<UIMessage>>[0]
          >();
        },
      });

      result.toUIMessageStream({
        onFinish: event => {
          expectTypeOf(event).toMatchTypeOf<
            Parameters<UIMessageStreamOnFinishCallback<UIMessage>>[0]
          >();
        },
      });
    });
  });

>>>>>>> 6669d691c7 (fix: include parsed structured output in streamText end callbacks (#17717))
  describe('output', () => {
    it('should infer text output type (default)', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<PromiseLike<string>>();
    });

    it('should infer text output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<PromiseLike<string>>();
    });

    it('should infer object output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<{ value: string }>
      >();
    });

    it('should infer array output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<string[]>
      >();
    });

    it('should infer choice output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<JSONValue>
      >();
    });
  });

  describe('partialOutputStream', () => {
    it('should infer text partial output type (default)', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string>
      >();
    });

    it('should infer text partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string>
      >();
    });

    it('should infer object partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<DeepPartial<{ value: string }>>
      >();
    });

    it('should infer array partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string[]>
      >();
    });

    it('should infer choice partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<JSONValue>
      >();
    });
  });

  describe('elementStream', () => {
    it('should infer element type for array output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<{ value: string }>
      >();
    });

    it('should infer never for text output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });

    it('should infer never for object output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });

    it('should infer never for default output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });
  });

  it('should support model call settings in prepareStep', () => {
    streamText({
      model: new MockLanguageModelV3(),
      prompt: 'Hello, world!',
      prepareStep: async () => ({
        maxOutputTokens: 100,
        temperature: 0,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0,
        frequencyPenalty: -0.2,
        stopSequences: [],
        seed: 0,
      }),
    });
  });
});
