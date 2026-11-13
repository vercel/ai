/**
 * Integration test workflows for WorkflowAgent telemetry.
 */
import { getWritable } from 'workflow';
import { jsonSchema, withTelemetryRedaction } from '@ai-sdk/provider-utils';
import { tool } from 'ai';
import { z } from 'zod/v4';
import { mockSequenceModel, mockTextModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

async function addNumbers(input: { a: number; b: number }): Promise<number> {
  'use step';
  return input.a + input.b;
}

export async function agentWithClientToolTelemetry(
  mode: 'generate' | 'stream',
) {
  'use workflow';
  let stepEndCallbacks = 0;
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'addNumbers',
        input: '{"a":2,"b":3}',
      },
      {
        type: 'tool-call',
        toolName: 'askUser',
        input: '{"question":"Continue?"}',
      },
    ]),
    tools: {
      addNumbers: {
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: addNumbers,
      },
      askUser: {
        inputSchema: z.object({ question: z.string() }),
      },
    },
    onStepEnd: () => {
      stepEndCallbacks++;
    },
  });
  const result =
    mode === 'generate'
      ? await agent.generate({ prompt: 'Add 2 and 3, then ask to continue.' })
      : await agent.stream({
          prompt: 'Add 2 and 3, then ask to continue.',
          writable: getWritable(),
        });
  return {
    stepCount: result.steps.length,
    lastTool: result.steps.at(-1)?.toolCalls.at(-1)?.toolName,
    stepEndCallbacks,
  };
}

export async function agentWithRedactedProviderTools(
  mode: 'generate' | 'stream',
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockTextModel('done'),
    tools: {
      remote: tool({
        type: 'provider',
        id: 'test.remote',
        isProviderExecuted: true,
        args: withTelemetryRedaction(
          { credential: 'workflow-test-secret', region: 'test' },
          value => ({ ...value, credential: '[redacted]' }),
        ),
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
      }),
    },
  });
  const result =
    mode === 'generate'
      ? await agent.generate({ prompt: 'hello' })
      : await agent.stream({ prompt: 'hello', writable: getWritable() });
  return result.steps.at(-1)?.text;
}

/**
 * Two model calls (a tool call, then text) for
 * https://github.com/vercel/ai/issues/23618.
 */
export async function agentToolLoopWithGlobalTelemetry(a: number, b: number) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'addNumbers',
        input: JSON.stringify({ a, b }),
      },
      { type: 'text', text: `The sum is ${a + b}` },
    ]),
    tools: {
      addNumbers: {
        description: 'Add two numbers',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: addNumbers,
      },
    },
    telemetry: { functionId: 'issue-23618' },
  });
  const result = await agent.stream({
    messages: [{ role: 'user', content: `Add ${a} and ${b}` }],
    writable: getWritable(),
  });
  return {
    stepCount: result.steps.length,
    text: result.steps.at(-1)?.text,
  };
}

/**
 * A tool call, then a call to a tool without execute that stops the run
 * (https://github.com/vercel/ai/issues/24584).
 */
export async function agentClientToolStopWithGlobalTelemetry(
  a: number,
  b: number,
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'addNumbers',
        input: JSON.stringify({ a, b }),
      },
      {
        type: 'tool-call',
        toolName: 'askUser',
        input: JSON.stringify({ question: 'Anything else?' }),
      },
    ]),
    tools: {
      addNumbers: {
        description: 'Add two numbers',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: addNumbers,
      },
      askUser: {
        description: 'Ask the user a question',
        inputSchema: z.object({ question: z.string() }),
      },
    },
    telemetry: { functionId: 'issue-24584' },
  });
  const result = await agent.stream({
    messages: [{ role: 'user', content: `Add ${a} and ${b}` }],
    writable: getWritable(),
  });
  return {
    stepCount: result.steps.length,
    toolCalls: result.toolCalls.map(toolCall => toolCall.toolName),
  };
}

async function getGlobalTelemetryIntegrationCount(): Promise<number | null> {
  'use step';
  return globalThis.AI_SDK_TELEMETRY_INTEGRATIONS?.length ?? null;
}

export async function agentStreamWithGlobalTelemetry(
  prompt: string,
  includeTraceIdentity?: boolean,
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockTextModel(`Echo: ${prompt}`),
    telemetry: {
      functionId: 'telemetry-test',
      includeRuntimeContext:
        includeTraceIdentity == null
          ? undefined
          : { traceIdentity: includeTraceIdentity },
    },
    runtimeContext: {
      traceIdentity: { sessionId: 'chat_1', userId: 'user_1' },
      secret: 'must not cross the model-step boundary',
    },
  });
  const result = await agent.stream({
    messages: [{ role: 'user', content: prompt }],
    writable: getWritable(),
  });

  return {
    text: result.steps.at(-1)?.text,
    integrationsInWorkflow:
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS?.length ?? null,
    integrationsInStep: await getGlobalTelemetryIntegrationCount(),
  };
}

export async function agentGenerateWithGlobalTelemetry(
  prompt: string,
  includeTraceIdentity?: boolean,
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockTextModel(`Echo: ${prompt}`),
    telemetry: {
      functionId: 'telemetry-test',
      includeRuntimeContext:
        includeTraceIdentity == null
          ? undefined
          : { traceIdentity: includeTraceIdentity },
    },
    runtimeContext: {
      traceIdentity: { sessionId: 'chat_1', userId: 'user_1' },
      secret: 'must not cross the model-step boundary',
    },
  });
  const result = await agent.generate({
    messages: [{ role: 'user', content: prompt }],
  });
  return { text: result.text };
}
