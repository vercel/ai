import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Output, type StreamTextOnFinishCallback } from '../generate-text';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import type { AsyncIterableStream } from '../util/async-iterable-stream';
import type { DeepPartial } from '../util/deep-partial';
import type { AgentCallParameters, AgentStreamParameters } from './agent';
import { ToolLoopAgent } from './tool-loop-agent';
import type { ToolLoopAgentOnFinishCallback } from './tool-loop-agent-settings';

describe('ToolLoopAgent', () => {
  it('should support model call settings in prepareStep', () => {
    new ToolLoopAgent({
      model: new MockLanguageModelV3(),
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

  describe('onFinish callback type compatibility', () => {
    it('should allow StreamTextOnFinishCallback where ToolLoopAgentOnFinishCallback is expected', () => {
      const streamTextCallback: StreamTextOnFinishCallback<{}> =
        async event => {
          const context: unknown = event.experimental_context;
          context;
        };

      expectTypeOf(streamTextCallback).toMatchTypeOf<
        ToolLoopAgentOnFinishCallback<{}>
      >();
    });

    it('should allow ToolLoopAgentOnFinishCallback where StreamTextOnFinishCallback is expected', () => {
      const agentCallback: ToolLoopAgentOnFinishCallback<{}> = async event => {
        const context: unknown = event.experimental_context;
        context;
      };

      expectTypeOf(agentCallback).toMatchTypeOf<
        StreamTextOnFinishCallback<{}>
      >();
    });
  });

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

    it('should require options when call options are provided', async () => {
      const agent = new ToolLoopAgent<{ callOption: string }>({
        model: new MockLanguageModelV3(),
      });

      expectTypeOf<Parameters<typeof agent.generate>[0]>().toEqualTypeOf<
        AgentCallParameters<{ callOption: string }>
      >();
    });

    it('should not require options when call options are not provided', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
      });

      expectTypeOf<Parameters<typeof agent.generate>[0]>().toEqualTypeOf<
        AgentCallParameters<never>
      >();
    });

    it('should infer output type', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
        output: Output.object({
          schema: z.object({ value: z.string() }),
        }),
      });

      const generateResult = await agent.generate({
        prompt: 'Hello, world!',
      });

      const output = generateResult.output;

      expectTypeOf<typeof output>().toEqualTypeOf<{ value: string }>();
    });
<<<<<<< HEAD
=======

    it('should type toolApproval in settings and prepareCall', () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
        }),
      };

      new ToolLoopAgent({
        model: new MockLanguageModelV4(),
        tools,
        toolApproval: {
          testTool: (input, options) => {
            expectTypeOf(input).toEqualTypeOf<{ value: string }>();
            expectTypeOf(options.toolCallId).toEqualTypeOf<string>();
            expectTypeOf(options.messages).toMatchTypeOf<Array<any>>();
            expectTypeOf(options.runtimeContext).toEqualTypeOf<Context>();

            return 'user-approval';
          },
        },
        experimental_refineToolInput: {
          testTool: input => {
            expectTypeOf(input).toEqualTypeOf<{ value: string }>();
            return { value: input.value.trim() };
          },
        },
        prepareCall: options => {
          expectTypeOf(options.toolApproval).toEqualTypeOf<
            ToolApprovalConfiguration<typeof tools, Context> | undefined
          >();
          expectTypeOf(options.experimental_refineToolInput).toEqualTypeOf<
            ToolInputRefinement<typeof tools> | undefined
          >();

          return {
            ...options,
            prompt: 'Hello, world!',
          };
        },
      });
    });

    it('should type experimental_toolCallers in settings and prepareCall', () => {
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
      const tools = {
        code_mode: codeMode,
        getInventory: tool({
          inputSchema: z.object({ sku: z.string() }),
          execute: async ({ sku }) => ({ sku }),
        }),
      };

      new ToolLoopAgent({
        model: new MockLanguageModelV4(),
        tools,
        experimental_toolCallers: {
          getInventory: ['code_mode'],
        },
        prepareCall: options => {
          expectTypeOf(options.experimental_toolCallers).toEqualTypeOf<
            Experimental_ToolCallers<typeof tools> | undefined
          >();

          return {
            ...options,
            prompt: 'Hello, world!',
          };
        },
      });
    });

    it('should type experimental_toolApprovalSecret in settings and prepareCall', () => {
      type PrepareCall = NonNullable<ToolLoopAgentSettings['prepareCall']>;

      expectTypeOf<
        Parameters<PrepareCall>[0]['experimental_toolApprovalSecret']
      >().toEqualTypeOf<string | Uint8Array | undefined>();
      expectTypeOf<
        Awaited<ReturnType<PrepareCall>>['experimental_toolApprovalSecret']
      >().toEqualTypeOf<string | Uint8Array | undefined>();

      const stringSecret = {
        model: new MockLanguageModelV4(),
        experimental_toolApprovalSecret: 'secret',
      } satisfies ToolLoopAgentSettings;

      const byteSecret = {
        model: new MockLanguageModelV4(),
        experimental_toolApprovalSecret: new Uint8Array(32),
      } satisfies ToolLoopAgentSettings;

      new ToolLoopAgent({
        ...stringSecret,
        prepareCall: options => {
          expectTypeOf(options.experimental_toolApprovalSecret).toEqualTypeOf<
            string | Uint8Array | undefined
          >();

          return {
            ...options,
            experimental_toolApprovalSecret:
              byteSecret.experimental_toolApprovalSecret,
            prompt: 'Hello, world!',
          };
        },
      });
    });

    it('should support stable start callbacks', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
        onStart: event => {
          expectTypeOf(event.runtimeContext).toEqualTypeOf<Context>();
        },
        onStepStart: event => {
          expectTypeOf(event.runtimeContext).toEqualTypeOf<Context>();
        },
      });

      await agent.generate({
        prompt: 'Hello, world!',
        onStart: event => {
          expectTypeOf(event.runtimeContext).toEqualTypeOf<Context>();
        },
        onStepStart: event => {
          expectTypeOf(event.runtimeContext).toEqualTypeOf<Context>();
        },
      });
    });

    it('should support deprecated tool call callbacks', async () => {
      const tools = {
        calculator: tool({
          inputSchema: z.object({ expression: z.string() }),
          execute: async () => 'result',
        }),
      };
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
        tools,
      });

      await agent.generate({
        prompt: 'Hello, world!',
        experimental_onToolCallStart: event => {
          expectTypeOf(event.callId).toEqualTypeOf<string>();
        },
        experimental_onToolCallFinish: event => {
          expectTypeOf(event.callId).toEqualTypeOf<string>();
        },
      });
    });
>>>>>>> a6463ca0d7 (fix: ToolLoopAgent types reject supported tool approval secrets (#19883))
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

    it('should require options when call options are provided', async () => {
      const agent = new ToolLoopAgent<{ callOption: string }>({
        model: new MockLanguageModelV3(),
      });

      expectTypeOf<Parameters<typeof agent.stream>[0]>().toEqualTypeOf<
        AgentStreamParameters<{ callOption: string }, {}>
      >();
    });

    it('should not require options when call options are not provided', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
      });

      expectTypeOf<Parameters<typeof agent.stream>[0]>().toEqualTypeOf<
        AgentStreamParameters<never, {}>
      >();
    });

    it('should infer output type', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV3(),
        output: Output.object({
          schema: z.object({ value: z.string() }),
        }),
      });

      const streamResult = await agent.stream({
        prompt: 'Hello, world!',
      });

      const partialOutputStream = streamResult.partialOutputStream;

      expectTypeOf<typeof partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<DeepPartial<{ value: string }>>
      >();
    });
  });
});
