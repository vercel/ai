/**
 * Integration test workflows for WorkflowAgent telemetry.
 */
import { getWritable } from 'workflow';
import { z } from 'zod/v4';
import { mockSequenceModel, mockTextModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

async function addNumbers(input: { a: number; b: number }): Promise<number> {
  'use step';
  return input.a + input.b;
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
