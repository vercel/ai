import {
  createModelCallToUIChunkTransform,
  WorkflowAgent,
  type ModelCallStreamPart,
} from '@ai-sdk/workflow';
import {
  convertToModelMessages,
  registerTelemetry,
  tool,
  type Telemetry,
  type UIMessage,
} from 'ai';
import { getWritable } from 'workflow';
import { z } from 'zod';
import {
  recordTelemetryEvent,
  type TelemetryEventSource,
  type TelemetryScenario,
} from '../lib/telemetry-store';
import { mockSequenceModel, type MockResponseDescriptor } from './mock-model';

interface TelemetryRequestContext {
  telemetryRunId: string;
  requestId: string;
  tenantId: string;
  scenario: TelemetryScenario;
}

let activeTelemetryRunId: string | undefined;

function getTelemetryRunId(event: unknown) {
  const runtimeContext = (
    event as { runtimeContext?: { telemetryRunId?: string } }
  )?.runtimeContext;
  return runtimeContext?.telemetryRunId ?? activeTelemetryRunId;
}

function summarizeEvent(event: unknown) {
  const value = event as Record<string, unknown> | undefined;
  return {
    operationId: value?.operationId,
    functionId: value?.functionId,
    callId: value?.callId,
    stepNumber: value?.stepNumber,
    toolName: value?.toolName,
    toolCallId: value?.toolCallId,
    success: value?.success,
    finishReason: value?.finishReason,
    runtimeContext: value?.runtimeContext,
    toolsContext: value?.toolsContext,
  };
}

function summarizeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) };
}

function registerWorkflowTelemetry() {
  const globalForTelemetry = globalThis as typeof globalThis & {
    __nextWorkflowTelemetryRegistered?: boolean;
  };

  if (globalForTelemetry.__nextWorkflowTelemetryRegistered) {
    return;
  }

  globalForTelemetry.__nextWorkflowTelemetryRegistered = true;

  const record =
    (name: string) =>
    async (event: unknown): Promise<void> => {
      const telemetryRunId = getTelemetryRunId(event);
      if (telemetryRunId == null) {
        return;
      }

      await recordTelemetryEvent({
        telemetryRunId,
        source: 'telemetry',
        name,
        summary: summarizeEvent(event),
      });
    };

  registerTelemetry({
    onStart: record('onStart'),
    onStepStart: record('onStepStart'),
    onLanguageModelCallStart: record('onLanguageModelCallStart'),
    onLanguageModelCallEnd: record('onLanguageModelCallEnd'),
    onChunk: record('onChunk'),
    onToolExecutionStart: record('onToolExecutionStart'),
    onToolExecutionEnd: record('onToolExecutionEnd'),
    onStepFinish: record('onStepFinish'),
    onFinish: record('onFinish'),
    onError: async error => {
      const telemetryRunId = getTelemetryRunId(error);
      if (telemetryRunId == null) {
        return;
      }
      await recordTelemetryEvent({
        telemetryRunId,
        source: 'telemetry',
        name: 'onError',
        summary: summarizeError(error),
      });
    },
    executeTool: async ({ callId, toolCallId, execute }) => {
      await recordTelemetryEvent({
        telemetryRunId: 'unknown',
        source: 'telemetry',
        name: 'executeTool',
        summary: { callId, toolCallId },
      });
      return execute();
    },
  } satisfies Telemetry);
}

registerWorkflowTelemetry();

async function getWeather(
  input: { city: string },
  options: {
    context: {
      unit: 'celsius' | 'fahrenheit';
      requestId: string;
      secret: string;
    };
  },
) {
  'use step';
  return {
    city: input.city,
    temperature: options.context.unit === 'celsius' ? 21 : 70,
    unit: options.context.unit,
    requestId: options.context.requestId,
    secretWasAvailableToTool: options.context.secret.length > 0,
  };
}

async function calculate(input: { expression: string }) {
  'use step';
  return {
    expression: input.expression,
    result: 42,
  };
}

async function deleteFile(
  input: { path: string },
  options: { context: { rootDir: string; requestId: string; secret: string } },
) {
  'use step';
  if (!input.path.startsWith(options.context.rootDir)) {
    throw new Error(`Refusing to delete outside ${options.context.rootDir}`);
  }
  return { deleted: input.path, requestId: options.context.requestId };
}

async function failTool() {
  'use step';
  throw new Error('Intentional telemetry e2e tool failure');
}

const tools = {
  getWeather: tool({
    description: 'Get deterministic weather for a city.',
    inputSchema: z.object({ city: z.string() }),
    contextSchema: z.object({
      unit: z.enum(['celsius', 'fahrenheit']),
      requestId: z.string(),
      secret: z.string(),
    }),
    execute: getWeather,
  }),
  calculate: tool({
    description: 'Evaluate a deterministic expression.',
    inputSchema: z.object({ expression: z.string() }),
    execute: calculate,
  }),
  deleteFile: {
    description: 'Delete a sandboxed file after approval.',
    inputSchema: z.object({ path: z.string() }),
    contextSchema: z.object({
      rootDir: z.string(),
      requestId: z.string(),
      secret: z.string(),
    }),
    execute: deleteFile,
    needsApproval: true as const,
  },
  failTool: tool({
    description: 'Throw an error to exercise telemetry error paths.',
    inputSchema: z.object({}),
    execute: failTool,
  }),
};

function getResponses(scenario: TelemetryScenario): MockResponseDescriptor[] {
  switch (scenario) {
    case 'approval':
      return [
        {
          type: 'tool-call',
          toolName: 'deleteFile',
          input: JSON.stringify({ path: '/tmp/workflow-telemetry/report.txt' }),
        },
        { type: 'text', text: 'The approved file operation completed.' },
      ];
    case 'tool-error':
      return [
        { type: 'tool-call', toolName: 'failTool', input: '{}' },
        { type: 'text', text: 'The failing tool path was observed.' },
      ];
    case 'model-error':
      return [
        { type: 'error', message: 'Intentional telemetry e2e model error' },
      ];
    default:
      return [
        {
          type: 'tool-call',
          toolName: 'getWeather',
          input: JSON.stringify({ city: 'San Francisco' }),
        },
        {
          type: 'tool-call',
          toolName: 'calculate',
          input: JSON.stringify({ expression: '40 + 2' }),
        },
        { type: 'text', text: 'Weather and calculator tools completed.' },
      ];
  }
}

function createTelemetryOptions({ functionId }: { functionId: string }) {
  return {
    functionId,
    includeRuntimeContext: {
      telemetryRunId: true,
      requestId: true,
      tenantId: true,
    },
    includeToolsContext: {
      getWeather: {
        requestId: true,
        unit: true,
      },
      deleteFile: {
        requestId: true,
      },
    },
  };
}

const recordCallback =
  ({
    telemetryRunId,
    source,
    name,
  }: {
    telemetryRunId: string;
    source: TelemetryEventSource;
    name: string;
  }) =>
  async (event: unknown) => {
    await recordTelemetryEvent({
      telemetryRunId,
      source,
      name,
      summary: summarizeEvent(event),
    });
  };

export async function telemetryChat(
  messages: UIMessage[],
  request: TelemetryRequestContext,
) {
  'use workflow';

  await recordTelemetryEvent({
    telemetryRunId: request.telemetryRunId,
    source: 'workflow',
    name: 'workflowStart',
    summary: { scenario: request.scenario },
  });

  const agent = new WorkflowAgent({
    model: mockSequenceModel(getResponses(request.scenario)),
    instructions:
      'You are a deterministic telemetry e2e agent. Use the scripted tools.',
    tools,
    runtimeContext: {
      telemetryRunId: request.telemetryRunId,
      requestId: request.requestId,
      tenantId: request.tenantId,
      secretToken: 'runtime-secret-not-for-telemetry',
    },
    toolsContext: {
      getWeather: {
        unit: 'celsius',
        requestId: request.requestId,
        secret: 'weather-secret-not-for-telemetry',
      },
      deleteFile: {
        rootDir: '/tmp/workflow-telemetry',
        requestId: request.requestId,
        secret: 'delete-secret-not-for-telemetry',
      },
    },
    telemetry: createTelemetryOptions({
      functionId: 'workflow-agent-telemetry-constructor',
    }) as any,
    experimental_onStart: recordCallback({
      telemetryRunId: request.telemetryRunId,
      source: 'agent-callback',
      name: 'experimental_onStart',
    }) as any,
    experimental_onStepStart: recordCallback({
      telemetryRunId: request.telemetryRunId,
      source: 'agent-callback',
      name: 'experimental_onStepStart',
    }) as any,
    onToolExecutionStart: recordCallback({
      telemetryRunId: request.telemetryRunId,
      source: 'agent-callback',
      name: 'onToolExecutionStart',
    }) as any,
    onToolExecutionEnd: recordCallback({
      telemetryRunId: request.telemetryRunId,
      source: 'agent-callback',
      name: 'onToolExecutionEnd',
    }) as any,
    onFinish: recordCallback({
      telemetryRunId: request.telemetryRunId,
      source: 'agent-callback',
      name: 'onFinish',
    }) as any,
  });

  activeTelemetryRunId = request.telemetryRunId;
  const result = await (async () => {
    try {
      return await agent.stream({
        messages: await convertToModelMessages(messages),
        writable: getWritable<ModelCallStreamPart>(),
        telemetry: createTelemetryOptions({
          functionId: `workflow-agent-telemetry-${request.scenario}`,
        }) as any,
        onError: recordCallback({
          telemetryRunId: request.telemetryRunId,
          source: 'agent-callback',
          name: 'onError',
        }) as any,
      });
    } finally {
      activeTelemetryRunId = undefined;
    }
  })();

  await recordTelemetryEvent({
    telemetryRunId: request.telemetryRunId,
    source: 'workflow',
    name: 'workflowFinish',
    summary: {
      scenario: request.scenario,
      steps: result.steps.length,
      text: result.steps.at(-1)?.text,
    },
  });

  return { messages: result.messages };
}

export function toUIMessageStream(
  readable: ReadableStream<ModelCallStreamPart>,
) {
  return readable.pipeThrough(createModelCallToUIChunkTransform());
}
