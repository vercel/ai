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

  describe('context', () => {
    it('should accept no context', async () => {
      new ToolLoopAgent({
        model: new MockLanguageModelV4(),
      });
    });

    it('should allow empty context', async () => {
      new ToolLoopAgent({
        model: new MockLanguageModelV4(),
        context: {},
      });
    });

    it('should accept user context', async () => {
      new ToolLoopAgent<never, {}, { telemetryId: string }>({
        model: new MockLanguageModelV4(),
        context: { telemetryId: '123' },
      });
    });

    describe('prepareStep', () => {
      it('should expose default context type', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept empty context', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          context: {},
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<{}>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept arbitrary context', async () => {
        new ToolLoopAgent<never, {}, { someValue: string }>({
          model: new MockLanguageModelV4(),
          context: { someValue: 'value' },
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toMatchObjectType<{
              someValue: string;
            }>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });

      it('should accept user context', async () => {
        const agent = new ToolLoopAgent<never, {}, { telemetryId: string }>({
          model: new MockLanguageModelV4(),
          context: { telemetryId: '123' },
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });

        await agent.stream({
          prompt: 'Hello',
          onFinish: ({ context, toolsContext }) => {
            expectTypeOf(context).toMatchObjectType<{
              telemetryId: string;
            }>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();
          },
        });
      });
    });
  });

  describe('toolsContext', () => {
    describe('no tools', () => {
      it('should reject toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          // @ts-expect-error toolsContext is not accepted when no tools are provided
          toolsContext: {},
        });
      });
    });

    describe('single tool without contextSchema', () => {
      it('should reject toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: toolWithoutContext,
          // @ts-expect-error toolsContext is not accepted when no tools require it
          toolsContext: {},
        });
      });
    });

    describe('two tools with contextSchema', () => {
      it('should reject no toolsContext', async () => {
        // @ts-expect-error toolsContext is required when tools have contextSchema
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
        });
      });

      it('should reject empty toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weather and db tool contexts
          toolsContext: {},
        });
      });

      it('should reject wrong toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          // @ts-expect-error missing required weather and db tool contexts
          toolsContext: { wrong: 'value' },
        });
      });

      it('should accept valid toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: twoToolsWithContext,
          toolsContext: {
            weather: { weatherApiKey: 'key' },
            db: { dbUrl: 'url' },
          },
        });
      });
    });

    describe('mixed tools', () => {
      it('should reject no toolsContext', async () => {
        // @ts-expect-error toolsContext is required when at least one tool has contextSchema
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
        });
      });

      it('should reject empty toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weather tool context
          toolsContext: {},
        });
      });

      it('should reject wrong toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weather tool context
          toolsContext: { wrong: 'value' },
        });
      });

      it('should accept valid toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          toolsContext: { weather: { weatherApiKey: 'key' } },
        });
      });
    });

    describe('prepareStep', () => {
      it('should expose toolsContext separately in prepareStep', async () => {
        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          toolsContext: { weather: { weatherApiKey: 'key' } },
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();

            return {};
          },
        });

        await agent.generate({
          prompt: 'Hello',
          onFinish: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();
          },
        });
      });

      it('should reject empty toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weather tool context
          toolsContext: {},
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();

            return {};
          },
        });
      });

      it('should reject wrong toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          tools: mixedTools,
          // @ts-expect-error missing required weather.weatherApiKey
          toolsContext: { weather: { wrong: 'value' } },
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{
              weather: {
                weatherApiKey: string;
              };
            }>();

            return {};
          },
        });
      });
    });

    describe('no tools with prepareStep', () => {
      it('should reject toolsContext', async () => {
        new ToolLoopAgent({
          model: new MockLanguageModelV4(),
          // @ts-expect-error toolsContext is not accepted when no tools are provided
          toolsContext: {},
          prepareStep: ({ context, toolsContext }) => {
            expectTypeOf(context).toEqualTypeOf<Context>();
            expectTypeOf(toolsContext).toEqualTypeOf<{}>();

            return {};
          },
        });
      });
    });
  });
});
