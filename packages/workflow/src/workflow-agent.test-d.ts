import { expectTypeOf, describe, it } from 'vitest';
import { z } from 'zod/v4';
import {
  dynamicTool,
  tool,
  type Experimental_SandboxSession as SandboxSession,
  type InferUITools,
  type Instructions,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from 'ai';
import type { ModelCallStreamPart } from './do-stream-step.js';
import type {
  WorkflowAgentToolExecutionEndEvent as PublicWorkflowAgentToolExecutionEndEvent,
  WorkflowAgentToolExecutionStartEvent as PublicWorkflowAgentToolExecutionStartEvent,
} from './index.js';
import {
  Output,
  WorkflowAgent,
  type InferWorkflowAgentUIMessage,
  type ToolCall,
  type WorkflowAgentOnToolExecutionEndCallback,
  type WorkflowAgentOnToolExecutionStartCallback,
  type WorkflowAgentOptions,
  type WorkflowAgentStreamOptions,
} from './workflow-agent.js';

const model = 'anthropic/claude-sonnet-4-6';

type IsAny<T> = 0 extends 1 & T ? true : false;

describe('WorkflowAgent types', () => {
  it('infers UI message tool parts from configured tools', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({
          city: z.string(),
        }),
        execute: async ({ city }) => ({
          city,
          temperature: 72,
        }),
      }),
    };

    const agent = new WorkflowAgent({
      model,
      tools,
    });

    expectTypeOf<InferWorkflowAgentUIMessage<typeof agent>>().toEqualTypeOf<
      UIMessage<unknown, never, InferUITools<typeof tools>>
    >();
  });

  it('infers runtimeContext in prepareStep and onEnd', () => {
    new WorkflowAgent({
      model,
      runtimeContext: { userId: 'user-123' },
      prepareStep: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
        return {
          runtimeContext: { userId: runtimeContext.userId },
        };
      },
      onEnd: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
      },
    });
  });

  it('infers constructor output in stream results', async () => {
    const agent = new WorkflowAgent({
      model,
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    });

    const result = await agent.stream({ prompt: 'answer' });

    expectTypeOf(result.output).toEqualTypeOf<{ answer: string }>();
  });

  it('infers stream output when overriding constructor output', async () => {
    const agent = new WorkflowAgent({
      model,
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    });

    const result = await agent.stream({
      prompt: 'rate the answer',
      output: Output.object({
        schema: z.object({ score: z.number() }),
      }),
    });

    expectTypeOf(result.output).toEqualTypeOf<{ score: number }>();
  });

  it('accepts constructor output with the original public generic arguments', async () => {
    const options = {
      model,
      runtimeContext: { userId: 'user-123' },
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    } satisfies WorkflowAgentOptions<Record<string, never>, { userId: string }>;

    const agent: WorkflowAgent<
      Record<string, never>,
      { userId: string }
    > = new WorkflowAgent<Record<string, never>, { userId: string }>(options);
    const result = await agent.stream({ prompt: 'answer' });

    expectTypeOf(result.output).toEqualTypeOf<never>();
  });

  it('preserves tool and runtime context types in stop conditions', () => {
    const tools = {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        execute: async () => ({ count: 1 }),
      }),
    };

    const agent = new WorkflowAgent({
      model,
      runtimeContext: { tenantId: 'tenant-1' },
      tools,
      stopWhen: ({ steps }) => {
        const last = steps[0]!;
        expectTypeOf<
          IsAny<typeof last.runtimeContext>
        >().toEqualTypeOf<false>();
        expectTypeOf(last.runtimeContext).toEqualTypeOf<{
          tenantId: string;
        }>();

        const toolCall = last.staticToolCalls[0]!;
        expectTypeOf(toolCall.toolName).toEqualTypeOf<'lookup'>();
        expectTypeOf<IsAny<typeof toolCall.input>>().toEqualTypeOf<false>();
        expectTypeOf(toolCall.input).toEqualTypeOf<{ query: string }>();

        const toolResult = last.staticToolResults[0]!;
        expectTypeOf<IsAny<typeof toolResult.output>>().toEqualTypeOf<false>();
        expectTypeOf(toolResult.output).toEqualTypeOf<{ count: number }>();
        return false;
      },
    });

    agent.stream({
      prompt: 'Look something up.',
      stopWhen: ({ steps }) => {
        const last = steps[0]!;
        expectTypeOf<
          IsAny<typeof last.runtimeContext>
        >().toEqualTypeOf<false>();
        expectTypeOf(last.runtimeContext).toEqualTypeOf<{
          tenantId: string;
        }>();

        const toolCall = last.staticToolCalls[0]!;
        expectTypeOf(toolCall.toolName).toEqualTypeOf<'lookup'>();
        expectTypeOf<IsAny<typeof toolCall.input>>().toEqualTypeOf<false>();
        expectTypeOf(toolCall.input).toEqualTypeOf<{ query: string }>();

        const toolResult = last.staticToolResults[0]!;
        expectTypeOf<IsAny<typeof toolResult.output>>().toEqualTypeOf<false>();
        expectTypeOf(toolResult.output).toEqualTypeOf<{ count: number }>();
        return false;
      },
    });
  });

  it('exposes experimental_sandbox in prepareStep', () => {
    new WorkflowAgent({
      model,
      prepareStep: ({ experimental_sandbox }) => {
        expectTypeOf(experimental_sandbox).toEqualTypeOf<
          SandboxSession | undefined
        >();
        return { experimental_sandbox };
      },
    });
  });

  it('exposes initial instructions and messages in prepareStep', () => {
    new WorkflowAgent({
      model,
      prepareStep: ({ initialInstructions, initialMessages }) => {
        expectTypeOf(initialInstructions).toEqualTypeOf<
          Instructions | undefined
        >();
        expectTypeOf(initialMessages).toEqualTypeOf<Array<ModelMessage>>();
        return {};
      },
    });
  });

  it('restricts prepareStep activeTools to configured tool names', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async () => 'sunny',
      }),
    };

    new WorkflowAgent({
      model,
      tools,
      prepareStep: () => ({
        activeTools: ['weather'],
      }),
    });

    new WorkflowAgent({
      model,
      tools,
      // @ts-expect-error activeTools only accepts configured tool names
      prepareStep: () => ({
        activeTools: ['weahter'],
      }),
    });
  });

  it('accepts stream-level instructions', () => {
    const agent = new WorkflowAgent({ model });

    agent.stream({
      prompt: 'hello',
      instructions: {
        role: 'system',
        content: 'Be concise.',
      },
    });
  });

  it('accepts stable lifecycle callbacks in constructor and stream options', () => {
    const constructorOptions = {
      model,
      runtimeContext: { userId: 'user-123' },
      onStart: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
      },
      onStepStart: ({ runtimeContext, stepNumber }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
        expectTypeOf(stepNumber).toEqualTypeOf<number>();
      },
    } satisfies WorkflowAgentOptions<Record<string, never>, { userId: string }>;

    const streamOptions = {
      prompt: 'hello',
      onStart: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
      },
      onStepStart: ({ runtimeContext, stepNumber }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
        expectTypeOf(stepNumber).toEqualTypeOf<number>();
      },
    } satisfies WorkflowAgentStreamOptions<
      Record<string, never>,
      { userId: string }
    >;

    const agent = new WorkflowAgent(constructorOptions);
    agent.stream(streamOptions);
  });

  it('accepts tool approval secrets in constructor and stream options', () => {
    const constructorOptions = {
      model,
      experimental_toolApprovalSecret: {
        environmentVariable: 'TOOL_APPROVAL_SECRET',
      },
    } satisfies WorkflowAgentOptions;
    const streamOptions = {
      prompt: 'hello',
      experimental_toolApprovalSecret: {
        environmentVariable: 'OTHER_TOOL_APPROVAL_SECRET',
      },
    } satisfies WorkflowAgentStreamOptions;

    const agent = new WorkflowAgent(constructorOptions);
    agent.stream(streamOptions);

    new WorkflowAgent({
      model,
      // @ts-expect-error raw secrets can cross workflow boundaries
      experimental_toolApprovalSecret: 'secret',
    });
  });

  it('includes signed approval requests in the durable stream type', () => {
    const part = {
      type: 'tool-approval-request',
      approvalId: 'approval-call-1',
      toolCallId: 'call-1',
      signature: 'signature',
    } satisfies ModelCallStreamPart;

    expectTypeOf(part.signature).toEqualTypeOf<string>();
  });

  it('supports onFinish as a deprecated alias', () => {
    new WorkflowAgent({
      model,
      runtimeContext: { userId: 'user-123' },
      onFinish: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toMatchObjectType<{ userId: string }>();
      },
    });
  });

  it('requires toolsContext when a tool declares contextSchema', () => {
    const tools = {
      weather: {
        inputSchema: z.object({ city: z.string() }),
        contextSchema: z.object({ apiKey: z.string() }),
        execute: async () => 'sunny',
      },
    };

    new WorkflowAgent({
      model,
      tools,
      toolsContext: { weather: { apiKey: 'secret' } },
    });

    new WorkflowAgent({
      model,
      tools,
      // @ts-expect-error toolsContext is required for tools with contextSchema
      toolsContext: {},
    });

    // @ts-expect-error toolsContext is required for tools with contextSchema
    new WorkflowAgent({
      model,
      tools,
    });
  });

  it('correlates tool callback input, context, and output by tool name', () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        outputSchema: z.object({
          value: z.number(),
          temperature: z.number(),
        }),
        contextSchema: z.object({ units: z.enum(['c', 'f']) }),
        execute: async () => ({ value: 20, temperature: 20 }),
      }),
      stocks: tool({
        inputSchema: z.object({ symbol: z.string() }),
        outputSchema: z.object({ value: z.string(), price: z.number() }),
        contextSchema: z.object({
          exchange: z.enum(['nasdaq', 'nyse']),
        }),
        execute: async () => ({ value: '$100', price: 100 }),
      }),
      isHealthy: tool({
        inputSchema: z.object({}),
        outputSchema: z.boolean(),
        execute: async () => true,
      }),
    };

    type StartEvent = Parameters<
      WorkflowAgentOnToolExecutionStartCallback<typeof tools>
    >[0];
    type EndEvent = Parameters<
      WorkflowAgentOnToolExecutionEndCallback<typeof tools>
    >[0];

    expectTypeOf<StartEvent>().toEqualTypeOf<
      PublicWorkflowAgentToolExecutionStartEvent<typeof tools>
    >();
    expectTypeOf<EndEvent>().toEqualTypeOf<
      PublicWorkflowAgentToolExecutionEndEvent<typeof tools>
    >();

    type WeatherStartEvent = Extract<
      StartEvent,
      { toolCall: { toolName: 'weather' } }
    >;
    type WeatherSuccessEvent = Extract<
      EndEvent,
      { toolCall: { toolName: 'weather' }; success: true }
    >;
    type StocksSuccessEvent = Extract<
      EndEvent,
      { toolCall: { toolName: 'stocks' }; success: true }
    >;
    type HealthSuccessEvent = Extract<
      EndEvent,
      { toolCall: { toolName: 'isHealthy' }; success: true }
    >;
    type WeatherFailureEvent = Extract<
      EndEvent,
      { toolCall: { toolName: 'weather' }; success: false }
    >;

    expectTypeOf<WeatherStartEvent['toolCall']['input']>().toEqualTypeOf<{
      city: string;
    }>();
    expectTypeOf<WeatherStartEvent['toolContext']>().toEqualTypeOf<{
      units: 'c' | 'f';
    }>();
    expectTypeOf<WeatherSuccessEvent['output']>().toEqualTypeOf<{
      value: number;
      temperature: number;
    }>();
    expectTypeOf<StocksSuccessEvent['output']>().toEqualTypeOf<{
      value: string;
      price: number;
    }>();
    expectTypeOf<
      HealthSuccessEvent['toolContext']
    >().toEqualTypeOf<undefined>();
    expectTypeOf<HealthSuccessEvent['output']>().toEqualTypeOf<boolean>();
    expectTypeOf<WeatherFailureEvent['toolContext']>().toEqualTypeOf<{
      units: 'c' | 'f';
    }>();
    expectTypeOf<WeatherFailureEvent['error']>().toEqualTypeOf<unknown>();
    expectTypeOf<WeatherFailureEvent['output']>().toEqualTypeOf<undefined>();

    const checkWeatherEvent = (event: WeatherSuccessEvent) => {
      event.toolCall.input.city;
      event.toolContext.units;
      event.output.temperature;
      // @ts-expect-error weather input does not contain a stock symbol
      event.toolCall.input.symbol;
      // @ts-expect-error weather context does not contain a stock exchange
      event.toolContext.exchange;
      // @ts-expect-error weather output does not contain a stock price
      event.output.price;
    };

    expectTypeOf(checkWeatherEvent).toBeFunction();

    new WorkflowAgent({
      model,
      tools,
      toolsContext: {
        weather: { units: 'c' },
        stocks: { exchange: 'nasdaq' },
      },
      onToolExecutionStart: event => {
        if (event.toolCall.toolName === 'weather') {
          const city: string = event.toolCall.input.city;
          // @ts-expect-error weather input does not contain a stock symbol
          event.toolCall.input.symbol;
          expectTypeOf(city).toEqualTypeOf<string>();
        }
      },
      onToolExecutionEnd: event => {
        if (event.toolCall.toolName === 'weather' && event.success) {
          const city: string = event.toolCall.input.city;
          // @ts-expect-error weather input does not contain a stock symbol
          event.toolCall.input.symbol;
          expectTypeOf(city).toEqualTypeOf<string>();
        }
      },
    });
  });

  it('uses broad callback fields for broad and dynamic tool sets', () => {
    type BroadStartEvent = Parameters<
      WorkflowAgentOnToolExecutionStartCallback<ToolSet>
    >[0];
    type BroadEndEvent = Parameters<
      WorkflowAgentOnToolExecutionEndCallback<ToolSet>
    >[0];
    type BroadSuccessEvent = Extract<BroadEndEvent, { success: true }>;

    expectTypeOf<BroadStartEvent['toolCall']>().toEqualTypeOf<ToolCall>();
    expectTypeOf<BroadStartEvent['toolContext']>().toEqualTypeOf<unknown>();
    expectTypeOf<BroadSuccessEvent['output']>().toEqualTypeOf<unknown>();

    const tools = {
      runtime: dynamicTool({
        description: 'Runtime-defined tool',
        inputSchema: z.unknown(),
        execute: async input => input,
      }),
    };
    type DynamicStartEvent = Extract<
      Parameters<WorkflowAgentOnToolExecutionStartCallback<typeof tools>>[0],
      { toolCall: { toolName: 'runtime' } }
    >;
    type DynamicSuccessEvent = Extract<
      Parameters<WorkflowAgentOnToolExecutionEndCallback<typeof tools>>[0],
      { toolCall: { toolName: 'runtime' }; success: true }
    >;

    expectTypeOf<
      DynamicStartEvent['toolCall']['input']
    >().toEqualTypeOf<unknown>();
    expectTypeOf<DynamicStartEvent['toolContext']>().toEqualTypeOf<undefined>();
    expectTypeOf<DynamicSuccessEvent['output']>().toEqualTypeOf<unknown>();
  });
});
