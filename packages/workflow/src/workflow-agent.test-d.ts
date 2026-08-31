import { expectTypeOf, describe, it } from 'vitest';
import { z } from 'zod/v4';
import type {
  Experimental_SandboxSession as SandboxSession,
  Instructions,
  ModelMessage,
} from 'ai';
import type { ModelCallStreamPart } from './do-stream-step.js';
import {
  WorkflowAgent,
  type WorkflowAgentOptions,
  type WorkflowAgentStreamOptions,
} from './workflow-agent.js';

const model = 'anthropic/claude-sonnet-4-6';

describe('WorkflowAgent types', () => {
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
});
