/**
 * Integration test workflows for WorkflowAgent telemetry.
 */
import type { ModelMessage } from 'ai';
import { getWritable } from 'workflow';
import { z } from 'zod/v4';
import { mockSequenceModel, mockTextModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

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

async function echoStep(input: { message: string }): Promise<string> {
  'use step';
  return `echo:${input.message}`;
}

async function throwingStep(): Promise<string> {
  'use step';
  throw new Error('Tool execution error');
}

export async function agentStreamWithGlobalTelemetryAndTools(
  prompt: string,
  options?: { toolThrows?: boolean; includeToolsContext?: boolean },
) {
  'use workflow';
  const toolName = options?.toolThrows ? 'throwingStep' : 'echoStep';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName,
        input: JSON.stringify(options?.toolThrows ? {} : { message: prompt }),
      },
      { type: 'text', text: 'Workflow completed' },
    ]),
    tools: {
      echoStep: {
        description: 'Echo step tool',
        inputSchema: z.object({ message: z.string() }),
        contextSchema: z.object({
          allowedKey: z.string(),
          secretKey: z.string(),
        }),
        execute: echoStep,
      },
      throwingStep: {
        description: 'Throwing step tool',
        inputSchema: z.object({}),
        execute: throwingStep,
      },
    },
    telemetry: {
      functionId: 'telemetry-test',
      includeToolsContext: options?.includeToolsContext
        ? { echoStep: { allowedKey: true } }
        : undefined,
    },
    runtimeContext: {
      traceIdentity: { sessionId: 'chat_1' },
    },
    toolsContext: {
      echoStep: { allowedKey: 'public-data', secretKey: 'secret-token' },
    },
  });

  const result = await agent.stream({
    messages: [{ role: 'user', content: prompt }],
    writable: getWritable(),
  });

  return {
    text: result.steps.at(-1)?.text,
    stepsCount: result.steps.length,
  };
}

export async function agentStreamWithProviderExecutedTool(prompt: string) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'webSearch',
        input: JSON.stringify({ query: prompt }),
        providerExecuted: true,
        providerResult: { result: 'search results' },
      },
    ]),
    telemetry: {
      functionId: 'telemetry-test',
    },
  });

  const result = await agent.stream({
    messages: [{ role: 'user', content: prompt }],
    writable: getWritable(),
  });

  return {
    stepsCount: result.steps.length,
  };
}

const secret = { environmentVariable: 'WORKFLOW_TOOL_APPROVAL_SECRET' };

async function performApprovedAction({ value }: { value: string }) {
  'use step';
  return `performed:${value}`;
}

export async function issueApprovalWithGlobalTelemetry(): Promise<
  ModelMessage[]
> {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'actionStep',
        input: '{"value":"test-value"}',
      },
    ]),
    tools: {
      actionStep: {
        description: 'Action requiring approval',
        inputSchema: z.object({ value: z.string() }),
        needsApproval: true,
        execute: performApprovedAction,
      },
    },
    experimental_toolApprovalSecret: secret,
    telemetry: {
      functionId: 'telemetry-test',
    },
  });

  const result = await agent.generate({
    messages: [{ role: 'user', content: 'Perform the action.' }],
  });
  return result.responseMessages;
}

export async function resumeApprovalWithGlobalTelemetry(
  messages: ModelMessage[],
  approved: boolean,
): Promise<{ text: string }> {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([{ type: 'text', text: 'Approval done.' }]),
    tools: {
      actionStep: {
        description: 'Action requiring approval',
        inputSchema: z.object({ value: z.string() }),
        needsApproval: true,
        execute: performApprovedAction,
      },
    },
    experimental_toolApprovalSecret: secret,
    telemetry: {
      functionId: 'telemetry-test',
    },
  });

  const result = await agent.generate({
    messages: [
      { role: 'user', content: 'Perform the action.' },
      ...messages,
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-call-1',
            approved,
          },
        ],
      },
    ],
  });

  return { text: result.text };
}
