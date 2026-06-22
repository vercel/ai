import {
  WorkflowAgent,
  type ModelCallStreamPart,
  type TelemetryOptions,
} from '@ai-sdk/workflow';
import {
  convertToModelMessages,
  tool,
  type Experimental_SandboxSession as SandboxSession,
  type Telemetry,
  type UIMessage,
} from 'ai';
import { getWritable } from 'workflow';
import { z } from 'zod';
import { devToolsTelemetry } from '../lib/devtools-bridge';
import { recordTelemetryEvent } from '../lib/telemetry-store';
import { mockSequenceModel } from './mock-model';

interface SandboxRequestContext {
  telemetryRunId: string;
  requestId: string;
  tenantId: string;
  scenario: 'sandbox';
}

interface RuntimeContext {
  [key: string]: unknown;
  telemetryRunId: string;
  requestId: string;
  tenantId: string;
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

function createTelemetryIntegration(telemetryRunId: string) {
  const record =
    (name: string) =>
    async (event: unknown): Promise<void> => {
      await recordTelemetryEvent({
        telemetryRunId,
        source: 'telemetry',
        name,
        summary: summarizeEvent(event),
      });
    };

  return {
    onStart: record('onStart'),
    onStepStart: record('onStepStart'),
    onToolExecutionStart: record('onToolExecutionStart'),
    onToolExecutionEnd: record('onToolExecutionEnd'),
    onEnd: record('onEnd'),
  } satisfies Telemetry;
}

function createSandbox({
  telemetryRunId,
  label,
}: {
  telemetryRunId: string;
  label: string;
}): SandboxSession {
  const notImplemented = async () => {
    throw new Error('Only sandbox.run is implemented in this e2e sandbox.');
  };

  return {
    description: `Telemetry e2e sandbox (${label})`,
    readFile: notImplemented,
    readBinaryFile: notImplemented,
    readTextFile: notImplemented,
    writeFile: notImplemented,
    writeBinaryFile: notImplemented,
    writeTextFile: notImplemented,
    spawn: notImplemented,
    run: async ({ command, workingDirectory, env }) => {
      await recordTelemetryEvent({
        telemetryRunId,
        source: 'workflow',
        name: 'sandboxRun',
        summary: {
          label,
          command,
          workingDirectory,
          envKeys: Object.keys(env ?? {}).sort(),
        },
      });

      return {
        exitCode: 0,
        stdout: `sandbox:${label}:${command}`,
        stderr: '',
      };
    },
  };
}

const tools = {
  runSandboxCommand: tool({
    description: 'Run a deterministic command in the configured sandbox.',
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }, { experimental_sandbox }) => {
      if (experimental_sandbox == null) {
        throw new Error('Sandbox is not available');
      }

      const result = await experimental_sandbox.run({
        command,
        workingDirectory: '/workspace',
        env: { SCENARIO: 'sandbox' },
      });

      return {
        command,
        sandboxDescription: experimental_sandbox.description,
        ...result,
      };
    },
  }),
};

function createTelemetryOptions({
  telemetryRunId,
}: {
  telemetryRunId: string;
}): TelemetryOptions<RuntimeContext, typeof tools> {
  return {
    functionId: 'workflow-agent-sandbox',
    includeRuntimeContext: {
      telemetryRunId: true,
      requestId: true,
      tenantId: true,
    },
    integrations: [
      createTelemetryIntegration(telemetryRunId),
      devToolsTelemetry,
    ],
  };
}

export async function sandboxChat(
  messages: UIMessage[],
  request: SandboxRequestContext,
) {
  'use workflow';

  await recordTelemetryEvent({
    telemetryRunId: request.telemetryRunId,
    source: 'workflow',
    name: 'workflowStart',
    summary: { scenario: request.scenario },
  });

  const streamSandbox = createSandbox({
    telemetryRunId: request.telemetryRunId,
    label: 'stream',
  });

  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'runSandboxCommand',
        input: JSON.stringify({ command: 'echo sandbox-e2e' }),
      },
      { type: 'text', text: 'Sandbox command completed.' },
    ]),
    instructions:
      'You are a deterministic sandbox e2e agent. Use the scripted tool.',
    tools,
    runtimeContext: {
      telemetryRunId: request.telemetryRunId,
      requestId: request.requestId,
      tenantId: request.tenantId,
    },
    telemetry: createTelemetryOptions({
      telemetryRunId: request.telemetryRunId,
    }),
  });

  const result = await agent.stream({
    messages: await convertToModelMessages(messages),
    writable: getWritable<ModelCallStreamPart>(),
    experimental_sandbox: streamSandbox,
  });

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
