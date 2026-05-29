import { generateText, isStepCount } from 'ai';
import type * as CodeMode from 'ai-sdk-code-mode';
import { diffWords } from './diff';
import {
  buildCasePrompt,
  createSupportTools,
  supportToolDefinitions,
} from './scenario';
import type {
  ApproachId,
  BenchmarkProgressEvent,
  ApproachResult,
  BenchmarkResponse,
  JsonValue,
  RunInspection,
  StepSummary,
  ToolDefinitionSummary,
  UsageSummary,
} from './types';

const DEFAULT_MODEL = 'openai/gpt-5.4-nano';

export async function runBenchmark({
  caseId,
  model = DEFAULT_MODEL,
  onProgress,
}: {
  caseId: string;
  model?: string;
  onProgress?: (event: BenchmarkProgressEvent) => void;
}): Promise<BenchmarkResponse> {
  const prompt = buildCasePrompt(caseId);
  onProgress?.({ type: 'benchmark-start', caseId, model, prompt });
  const [direct, codeMode] = await Promise.all([
    runDirectTools({ caseId, model, prompt, onProgress }).then(run => {
      onProgress?.({ type: 'approach-done', run });
      return run;
    }),
    runWithCodeMode({ caseId, model, prompt, onProgress }).then(run => {
      onProgress?.({ type: 'approach-done', run });
      return run;
    }),
  ]);

  const result = {
    caseId,
    model,
    prompt,
    runs: [direct, codeMode],
    diff: diffWords(direct.finalText, codeMode.finalText),
  } satisfies BenchmarkResponse;

  onProgress?.({ type: 'benchmark-done', result });
  return result;
}

async function runDirectTools({
  caseId,
  model,
  prompt,
  onProgress,
}: {
  caseId: string;
  model: string;
  prompt: string;
  onProgress?: (event: BenchmarkProgressEvent) => void;
}): Promise<ApproachResult> {
  const startedAt = performance.now();
  const { tools, trace } = createSupportTools(startedAt);
  const id = 'direct-tools';
  const label = 'Direct AI SDK tools';

  onProgress?.({ type: 'approach-start', runId: id, label });
  const runPrompt = [
    prompt,
    '',
    'Implementation note: use the individual tools directly. Work efficiently, and use parallel tool calls when the model can safely do so.',
    `The case id is ${caseId}.`,
    'In your final Metrics note, say: "Implementation: direct tools."',
  ].join('\n');

  const result = await generateText({
    model,
    tools,
    stopWhen: isStepCount(8),
    maxOutputTokens: 900,
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? { toolChoice: 'required' } : undefined,
    onStepFinish: step => {
      onProgress?.({
        type: 'step-finish',
        runId: id,
        label,
        step: toStepSummary(step),
        hostToolTrace: [...trace],
      });
    },
    prompt: runPrompt,
  });

  return summarizeRun({
    id,
    label,
    model,
    startedAt,
    endedAt: performance.now(),
    result: result as any,
    trace,
    inspection: {
      prompt: runPrompt,
      toolDefinitions: supportToolDefinitions,
    },
  });
}

async function runWithCodeMode({
  caseId,
  model,
  prompt,
  onProgress,
}: {
  caseId: string;
  model: string;
  prompt: string;
  onProgress?: (event: BenchmarkProgressEvent) => void;
}): Promise<ApproachResult> {
  const startedAt = performance.now();
  const { tools, trace } = createSupportTools(startedAt);
  const id = 'code-mode';
  const label = 'Code mode tool';
  onProgress?.({ type: 'approach-start', runId: id, label });
  const { createCodeModeTool } = await importCodeMode();
  const codeMode = createCodeModeTool(tools, {
    executionPolicy: {
      timeoutMs: 30_000,
      maxInFlightBridgeRequests: 8,
    },
  });
  const runPrompt = [
    prompt,
    '',
    'Implementation note: use the codeMode tool exactly once for all data gathering and deterministic JSON transformation.',
    `The case id is ${caseId}.`,
    'The JavaScript inside codeMode should follow this shape:',
    '```ts',
    `const supportCase = await tools.getCase({ caseId: ${JSON.stringify(caseId)} });`,
    'const [customer, order, previousTickets, policySearch] = await Promise.all([',
    '  tools.getCustomer({ customerId: supportCase.customerId }),',
    '  tools.getOrder({ orderId: supportCase.orderId }),',
    '  tools.listPreviousTickets({ customerId: supportCase.customerId }),',
    '  tools.searchPolicies({ query: supportCase.issue, limit: 3 }),',
    ']);',
    'const policies = await Promise.all(',
    '  policySearch.results.map(policy => tools.readPolicy({ id: policy.id })),',
    ');',
    'const refund = await tools.calculateRefund({',
    '  orderId: order.id,',
    '  policyIds: policies.map(policy => policy.id),',
    '});',
    'return { supportCase, customer, order, previousTickets, policies, refund };',
    '```',
    'After codeMode returns, write the final customer-facing answer from the structured result.',
    'In your final Metrics note, say: "Implementation: code mode."',
  ].join('\n');

  const result = await generateText({
    model,
    tools: { codeMode },
    activeTools: [],
    stopWhen: isStepCount(3),
    maxOutputTokens: 900,
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          activeTools: ['codeMode'],
          toolChoice: { type: 'tool', toolName: 'codeMode' },
        };
      }
      return { activeTools: [] };
    },
    onStepFinish: step => {
      onProgress?.({
        type: 'step-finish',
        runId: id,
        label,
        step: toStepSummary(step),
        hostToolTrace: [...trace],
      });
    },
    prompt: runPrompt,
  });

  return summarizeRun({
    id,
    label,
    model,
    startedAt,
    endedAt: performance.now(),
    result: result as any,
    trace,
    inspection: {
      prompt: runPrompt,
      toolDefinitions: [toCodeModeToolDefinition(codeMode)],
    },
  });
}

async function importCodeMode(): Promise<typeof CodeMode> {
  // Keep the worker-thread package external to Next's route bundler. If this
  // import is static, Next rewrites `new URL("./worker.js", import.meta.url)`
  // into an internal asset path that Node's Worker cannot load.
  const runtimeImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<typeof CodeMode>;

  return await runtimeImport('ai-sdk-code-mode');
}

function summarizeRun({
  id,
  label,
  model,
  startedAt,
  endedAt,
  result,
  trace,
  inspection,
}: {
  id: ApproachId;
  label: string;
  model: string;
  startedAt: number;
  endedAt: number;
  result: any;
  trace: ApproachResult['hostToolTrace'];
  inspection: RunInspection;
}): ApproachResult {
  const steps: StepSummary[] = result.steps.map(toStepSummary);
  const modelResponseMs = steps.reduce(
    (sum: number, step: StepSummary) => sum + step.performance.responseTimeMs,
    0,
  );
  const toolExecutionMs = steps.reduce(
    (sum: number, step: StepSummary) =>
      sum +
      Object.values(step.performance.toolExecutionMs).reduce(
        (toolSum: number, value: number) => toolSum + value,
        0,
      ),
    0,
  );

  return {
    id,
    label,
    model,
    totalMs: round(endedAt - startedAt),
    finalText: result.text,
    finishReason: result.finishReason,
    usage: toUsageSummary(result.usage),
    inspection: {
      ...inspection,
      generatedCode: inspection.generatedCode ?? extractGeneratedCode(result),
    },
    steps,
    hostToolTrace: trace,
    metrics: {
      modelSteps: steps.length,
      topLevelToolCalls: result.toolCalls.length,
      hostToolCalls: trace.length,
      hostToolMs: round(trace.reduce((sum, call) => sum + call.durationMs, 0)),
      modelResponseMs: round(modelResponseMs),
      toolExecutionMs: round(toolExecutionMs),
    },
  };
}

function toCodeModeToolDefinition(codeMode: {
  description?: unknown;
}): ToolDefinitionSummary {
  const description =
    typeof codeMode.description === 'string'
      ? codeMode.description
      : 'Execute code in code mode.';

  return {
    name: 'codeMode',
    description,
    inputSchema: {
      type: 'object',
      properties: {
        js: {
          type: 'string',
          description:
            'JavaScript or type-stripped TypeScript source to execute.',
        },
      },
      required: ['js'],
      additionalProperties: false,
    },
  };
}

function extractGeneratedCode(result: any): string | undefined {
  const codeModeToolCall = result.toolCalls.find(
    (toolCall: any) => toolCall.toolName === 'codeMode',
  );
  const input = codeModeToolCall?.input;

  return typeof input?.js === 'string' ? input.js : undefined;
}

function toStepSummary(step: any): StepSummary {
  return {
    stepNumber: step.stepNumber,
    finishReason: step.finishReason,
    text: step.text,
    usage: toUsageSummary(step.usage),
    performance: {
      stepTimeMs: round(step.performance.stepTimeMs),
      responseTimeMs: round(step.performance.responseTimeMs),
      toolExecutionMs: Object.fromEntries(
        Object.entries(step.performance.toolExecutionMs).map(([key, value]) => [
          key,
          round(Number(value)),
        ]),
      ),
    },
    toolCalls: step.toolCalls.map((toolCall: any) => ({
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: toJsonValue(toolCall.input),
    })),
    toolResults: step.toolResults.map((toolResult: any) => ({
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: toJsonValue(toolResult.output),
    })),
    toolErrors: step.content
      .filter((part: any) => part.type === 'tool-error')
      .map((part: any) => ({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: toJsonValue(part.input),
        error:
          part.error instanceof Error
            ? part.error.message
            : typeof part.error === 'string'
              ? part.error
              : JSON.stringify(toJsonValue(part.error)),
      })),
  };
}

function toUsageSummary(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): UsageSummary {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  return String(value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
