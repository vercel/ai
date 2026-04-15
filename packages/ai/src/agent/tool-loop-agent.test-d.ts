import { Context, tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  Output,
  StreamTextOnFinishCallback,
  ToolNeedsApprovalConfiguration,
} from '../generate-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { DeepPartial } from '../util/deep-partial';
import { AgentCallParameters, AgentStreamParameters } from './agent';
import { ToolLoopAgent } from './tool-loop-agent';
import type { ToolLoopAgentOnFinishCallback } from './tool-loop-agent-settings';

describe('ToolLoopAgent', () => {
  describe('onFinish callback type compatibility', () => {
    it('should allow StreamTextOnFinishCallback where ToolLoopAgentOnFinishCallback is expected', () => {
      const streamTextCallback: StreamTextOnFinishCallback<
        {},
        {}
      > = async event => {
        const context: unknown = event.context;
        context;
      };

      expectTypeOf(streamTextCallback).toMatchTypeOf<
        ToolLoopAgentOnFinishCallback<{}>
      >();
    });

    it('should allow ToolLoopAgentOnFinishCallback where StreamTextOnFinishCallback is expected', () => {
      const agentCallback: ToolLoopAgentOnFinishCallback<{}> = async event => {
        const context: unknown = event.context;
        context;
      };

      expectTypeOf(agentCallback).toMatchTypeOf<
        StreamTextOnFinishCallback<{}, {}>
      >();
    });
  });

  describe('generate', () => {
    it('should not allow system prompt', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
      });

      await agent.generate({
        // @ts-expect-error - system prompt is not allowed
        system: '123',
        prompt: 'Hello, world!',
      });
    });

    it('should require options when call options are provided', async () => {
      const agent = new ToolLoopAgent<{ callOption: string }>({
        model: new MockLanguageModelV4(),
      });

      expectTypeOf<Parameters<typeof agent.generate>[0]>().toEqualTypeOf<
        AgentCallParameters<{ callOption: string }>
      >();
    });

    it('should not require options when call options are not provided', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
      });

      expectTypeOf<Parameters<typeof agent.generate>[0]>().toEqualTypeOf<
        AgentCallParameters<never>
      >();
    });

    it('should infer output type', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
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

    it('should type toolNeedsApproval in settings and prepareCall', () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
        }),
      };

      new ToolLoopAgent({
        model: new MockLanguageModelV4(),
        tools,
        toolNeedsApproval: {
          testTool: (input, options) => {
            expectTypeOf(input).toEqualTypeOf<{ value: string }>();
            expectTypeOf(options.toolCallId).toEqualTypeOf<string>();
            expectTypeOf(options.messages).toMatchTypeOf<Array<any>>();

            return true;
          },
        },
        prepareCall: options => {
          expectTypeOf(options.toolNeedsApproval).toEqualTypeOf<
            ToolNeedsApprovalConfiguration<typeof tools> | undefined
          >();

          return {
            ...options,
            prompt: 'Hello, world!',
          };
        },
      });
    });
  });

  describe('stream', () => {
    it('should not allow system prompt', () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
      });

      agent.stream({
        // @ts-expect-error - system prompt is not allowed
        system: '123',
        prompt: 'Hello, world!',
      });
    });

    it('should require options when call options are provided', async () => {
      const agent = new ToolLoopAgent<{ callOption: string }>({
        model: new MockLanguageModelV4(),
      });

      expectTypeOf<Parameters<typeof agent.stream>[0]>().toEqualTypeOf<
        AgentStreamParameters<{ callOption: string }, {}>
      >();
    });

    it('should not require options when call options are not provided', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
      });

      expectTypeOf<Parameters<typeof agent.stream>[0]>().toEqualTypeOf<
        AgentStreamParameters<never, {}>
      >();
    });

    it('should infer output type', async () => {
      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4(),
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

  describe('context', () => {
    const toolWithoutContext = {
      calculator: tool({
        inputSchema: z.object({ expression: z.string() }),
        execute: async () => 'result',
      }),
    };

    const twoToolsWithContext = {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        contextSchema: z.object({ weatherApiKey: z.string() }),
        execute: async ({ location }, { context: { weatherApiKey } }) => {
          return { location, weatherApiKey };
        },
      }),
      db: tool({
        inputSchema: z.object({ query: z.string() }),
        contextSchema: z.object({ dbUrl: z.string() }),
        execute: async ({ query }, { context: { dbUrl } }) => {
          return { query, dbUrl };
        },
      }),
    };

    const mixedTools = {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        contextSchema: z.object({ weatherApiKey: z.string() }),
        execute: async ({ location }, { context: { weatherApiKey } }) => {
          return { location, weatherApiKey };
        },
      }),
      calculator: tool({
        inputSchema: z.object({ expression: z.string() }),
        execute: async () => 'result',
      }),
    };

    describe('no tools', () => {
      it('should accept no context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
        });
      });

      it('should reject empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          // @ts-expect-error context is not accepted when no tools require it
          context: {},
        });
      });

      it('should accept user context', async () => {
        const agent = new ToolLoopAgent<never, {}, { telemetryId: string }>({
          model: new MockLanguageModelV4(),
          context: { telemetryId: '123' },
        });

        await agent.generate({
          prompt: 'Hello',
          onFinish: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();
          },
        });
      });
    });

    describe('single tool without contextSchema', () => {
      it('should accept no context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: toolWithoutContext,
        });
      });

      it('should reject empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: toolWithoutContext,
          // @ts-expect-error context is not accepted when no tools require it
          context: {},
        });
      });

      it('should accept user context', async () => {
        const agent = new ToolLoopAgent<
          never,
          typeof toolWithoutContext,
          { telemetryId: string }
        >({
          model: new MockLanguageModelV4(),
          tools: toolWithoutContext,
          context: { telemetryId: '123' },
        });

        await agent.stream({
          prompt: 'Hello',
          onFinish: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();
          },
        });
      });
    });

    describe('two tools with contextSchema', () => {
      it('should reject no context', async () => {
        // @ts-expect-error context is required when tools have contextSchema
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
        });
      });

      it('should reject empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weatherApiKey and dbUrl
          context: {},
        });
      });

      it('should reject wrong context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weatherApiKey and dbUrl
          context: { wrong: 'value' },
        });
      });

      it('should accept valid context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          context: { weatherApiKey: 'key', dbUrl: 'url' },
        });
      });

      it('should accept valid context with extra user properties', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          context: {
            weatherApiKey: 'key',
            dbUrl: 'url',
            telemetryId: '123',
          },
        });
      });
    });

    describe('mixed tools', () => {
      it('should reject no context', async () => {
        // @ts-expect-error context is required when at least one tool has contextSchema
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
        });
      });

      it('should reject empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: {},
        });
      });

      it('should reject wrong context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: { wrong: 'value' },
        });
      });

      it('should accept valid context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          context: { weatherApiKey: 'key' },
        });
      });

      it('should accept valid context with extra user properties', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          context: { weatherApiKey: 'key', telemetryId: '123' },
        });
      });
    });

    describe('mixed tools with user context in prepareStep', () => {
      it('should reject no context', async () => {
        // @ts-expect-error context is required when at least one tool has contextSchema
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<
              {
                weatherApiKey: string;
              } & Context
            >();

            return {};
          },
        });
      });

      it('should reject empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: {},
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<{
              weatherApiKey: string;
            }>();

            return {};
          },
        });
      });

      it('should reject wrong context with only user properties', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weatherApiKey
          context: { telemetryId: '123' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              weatherApiKey: string;
              telemetryId: string;
            }>();

            return {};
          },
        });
      });

      it('should accept valid context and expose combined type in prepareStep', async () => {
        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          context: { weatherApiKey: 'key', telemetryId: '123' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              weatherApiKey: string;
              telemetryId: string;
            }>();

            return {};
          },
        });

        await agent.generate({
          prompt: 'Hello',
          onFinish: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              weatherApiKey: string;
              telemetryId: string;
            }>();
          },
        });
      });
    });

    describe('no tools with prepareStep', () => {
      it('should accept no context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();

            return {};
          },
        });
      });

      it('should reject empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          // @ts-expect-error context is not accepted when no tools require it
          context: {},
          prepareStep: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept arbitrary context', async () => {
        new ToolLoopAgent<never, {}, { someValue: string }>({
          model: new MockLanguageModelV4(),
          context: { someValue: 'value' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              someValue: string;
            }>();

            return {};
          },
        });
      });

      it('should accept user context', async () => {
        const agent = new ToolLoopAgent<never, {}, { telemetryId: string }>({
          model: new MockLanguageModelV4(),
          context: { telemetryId: '123' },
          prepareStep: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();

            return {};
          },
        });

        await agent.stream({
          prompt: 'Hello',
          onFinish: ({ context }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();
          },
        });
      });
    });
  });
});
