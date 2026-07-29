import { randomBytes } from 'node:crypto';
import { jsonSchema, tool } from 'ai';
import { unwrapCodeModeResult } from './interrupt-continuation.js';
import { runCodeMode } from './run-code-mode.js';
import { toStrictJsonPayload } from './serialization.js';
import { buildCodeModeToolDescription } from './tool-prompt.js';
import type {
  CodeModeModelOutput,
  CodeModeModelOutputOptions,
  CodeModeModelVisibleBridgeSummary,
  CodeModeNestedToolResultEvent,
  CodeModeOptions,
  CodeModeTool,
  CodeModeToolInput,
  CodeModeToolSet,
  CodeModeTrace,
} from './types.js';

const TRACE_ID = Symbol('codeModeTraceId');
const MAX_MODEL_OUTPUT_BYTES = Number.MAX_SAFE_INTEGER;
const MAX_PENDING_MODEL_OUTPUTS = 256;

type NestedToolModelOutputInput = {
  toolName: string;
  toolCallId: string;
  input: unknown;
  output: unknown;
};
type FulfilledNestedToolResultEvent = Extract<
  CodeModeNestedToolResultEvent,
  { status: 'fulfilled' }
>;

/**
 * Creates an AI SDK tool that executes code-mode TypeScript in an isolated
 * sandbox.
 *
 * The generated tool description includes sandbox rules, available host tool
 * signatures, return types when an AI SDK output schema is present, call
 * examples, and fetch policy details when fetch is enabled.
 *
 * @param tools - Host tools that sandboxed code can call through `tools.name(input)`.
 * @param options - Runtime, fetch, and approval options for every invocation of this tool.
 * @returns An AI SDK tool whose input is `{ js: string }` and whose output is the sandbox return value.
 */
export function createCodeModeTool(
  tools: CodeModeToolSet,
  options: CodeModeOptions = {},
): CodeModeTool {
  const description = buildCodeModeToolDescription(tools, options);
  const traceById = new Map<string, CodeModeTrace>();
  const nestedToolResultsById = new Map<
    string,
    Map<number, NestedToolModelOutputInput>
  >();
  const includeNestedToolOutputs =
    options.modelOutput?.includeNestedToolOutputs === true;
  const includeNestedToolSummary =
    options.modelOutput?.includeNestedToolSummary === true ||
    includeNestedToolOutputs;

  return tool<CodeModeToolInput, unknown, Record<string, unknown>>({
    description,
    inputSchema: jsonSchema<CodeModeToolInput>({
      type: 'object',
      properties: {
        js: {
          type: 'string',
          description:
            'Code-mode TypeScript source to execute. The tool description lists the available global `tools` API, input types, and call examples.',
        },
      },
      required: ['js'],
      additionalProperties: false,
    }),
    ...(includeNestedToolSummary
      ? {
          toModelOutput: async ({
            input,
            output,
          }: {
            toolCallId: string;
            input: CodeModeToolInput;
            output: unknown;
          }) => {
            const traceId = readTraceId(input);
            if (
              unwrapCodeModeResult(output, options.continuationSecurity)
                .status === 'interrupted'
            ) {
              if (traceId !== undefined) {
                traceById.delete(traceId);
                nestedToolResultsById.delete(traceId);
              }
              return toDefaultModelOutput(output);
            }
            const trace =
              traceId === undefined ? undefined : traceById.get(traceId);
            const nestedToolResults =
              traceId === undefined
                ? undefined
                : nestedToolResultsById.get(traceId);
            if (traceId !== undefined) {
              traceById.delete(traceId);
              nestedToolResultsById.delete(traceId);
            }
            return toDefaultModelOutput({
              result: output === undefined ? null : output,
              nestedTools: await summarizeTrace({
                trace,
                options: options.modelOutput,
                tools,
                nestedToolResults,
              }),
            } satisfies CodeModeModelOutput);
          },
        }
      : {}),
    execute: async (
      input: CodeModeToolInput,
      executionOptions: Parameters<
        NonNullable<CodeModeToolSet[string]['execute']>
      >[1],
    ) => {
      const { js } = input;
      const traceId = `code-mode-trace-${randomId()}`;
      rememberInputTraceId(input, traceId);
      if (includeNestedToolOutputs) {
        rememberBounded(
          nestedToolResultsById,
          traceId,
          new Map<number, NestedToolModelOutputInput>(),
        );
      }
      const runtimeOptions = includeNestedToolSummary
        ? withModelOutputCapture(options, {
            onTrace: trace => {
              rememberTrace(traceById, traceId, trace);
            },
            onNestedToolResult: event => {
              if (!includeNestedToolOutputs || event.status !== 'fulfilled') {
                return;
              }
              const nestedToolResults = nestedToolResultsById.get(traceId);
              if (nestedToolResults === undefined) {
                return;
              }
              nestedToolResults.set(event.bridgeIndex, {
                toolName: event.toolName,
                toolCallId: event.toolCallId,
                input: event.input,
                output: event.output,
              });
            },
          })
        : options;

      try {
        return await runCodeMode({
          js,
          tools,
          toolExecutionOptions: executionOptions,
          options: runtimeOptions,
        });
      } catch (error) {
        traceById.delete(traceId);
        nestedToolResultsById.delete(traceId);
        throw error;
      }
    },
  }) as CodeModeTool;
}

function rememberInputTraceId(input: CodeModeToolInput, traceId: string): void {
  Object.defineProperty(input, TRACE_ID, {
    configurable: true,
    value: traceId,
  });
}

function readTraceId(input: CodeModeToolInput): string | undefined {
  const value = (input as CodeModeToolInput & { [TRACE_ID]?: unknown })[
    TRACE_ID
  ];
  return typeof value === 'string' ? value : undefined;
}

function withModelOutputCapture(
  options: CodeModeOptions,
  {
    onTrace,
    onNestedToolResult,
  }: {
    onTrace: (trace: CodeModeTrace) => void;
    onNestedToolResult?: (event: FulfilledNestedToolResultEvent) => void;
  },
): CodeModeOptions {
  const existingOnTrace = options.lifecycle?.onTrace;
  const existingOnNestedToolResult = options.lifecycle?.onNestedToolResult;
  return {
    ...options,
    lifecycle: {
      ...options.lifecycle,
      onNestedToolResult: async event => {
        if (event.status === 'fulfilled') {
          onNestedToolResult?.(event);
        }
        await existingOnNestedToolResult?.(event);
      },
      onTrace: async trace => {
        onTrace(cloneTrace(trace));
        await existingOnTrace?.(trace);
      },
    },
  };
}

async function summarizeTrace({
  trace,
  options,
  tools,
  nestedToolResults,
}: {
  trace: CodeModeTrace | undefined;
  options: CodeModeModelOutputOptions | undefined;
  tools: CodeModeToolSet;
  nestedToolResults: Map<number, NestedToolModelOutputInput> | undefined;
}): Promise<CodeModeModelVisibleBridgeSummary[]> {
  if (trace === undefined) {
    return [];
  }

  const includeFetch = options?.includeFetchSummary === true;
  const includeNestedToolOutputs =
    options?.includeNestedToolOutputs === true &&
    nestedToolResults !== undefined;
  const maxEntries = Math.max(0, options?.maxSummaryEntries ?? 32);
  const entries: CodeModeModelVisibleBridgeSummary[] = [];

  for (const entry of trace.bridgeRequests) {
    if (entries.length >= maxEntries) {
      break;
    }
    if (entry.kind === 'tool') {
      const summary: CodeModeModelVisibleBridgeSummary = {
        kind: 'tool',
        toolName: entry.toolName,
        toolCallId: entry.toolCallId,
        status: entry.status,
        replayed: entry.replayed,
      };
      const nestedToolResult = nestedToolResults?.get(entry.bridgeIndex);
      if (
        includeNestedToolOutputs &&
        entry.status === 'fulfilled' &&
        nestedToolResult !== undefined
      ) {
        summary.output = await toNestedToolModelOutput(
          tools[entry.toolName],
          nestedToolResult,
        );
      }
      entries.push(summary);
      continue;
    }
    if (includeFetch) {
      entries.push({
        kind: 'fetch',
        url: entry.url,
        method: entry.method,
        status: entry.status,
        replayed: entry.replayed,
      });
    }
  }

  return entries;
}

async function toNestedToolModelOutput(
  tool: CodeModeToolSet[string] | undefined,
  { toolName, toolCallId, input, output }: NestedToolModelOutputInput,
): Promise<unknown> {
  const modelOutput =
    tool?.toModelOutput === undefined
      ? toDefaultModelOutput(output)
      : await tool.toModelOutput({
          toolCallId,
          input: input as never,
          output: output as never,
        });
  const valueJson = toStrictJsonPayload(
    modelOutput,
    MAX_MODEL_OUTPUT_BYTES,
    `Tool "${toolName}" model output`,
  );
  return JSON.parse(valueJson);
}

function toDefaultModelOutput(
  output: unknown,
): { type: 'text'; value: string } | { type: 'json'; value: any } {
  if (typeof output === 'string') {
    return { type: 'text', value: output };
  }
  return { type: 'json', value: output === undefined ? null : output };
}

function rememberTrace(
  traceByToolCallId: Map<string, CodeModeTrace>,
  toolCallId: string,
  trace: CodeModeTrace,
): void {
  rememberBounded(traceByToolCallId, toolCallId, trace);
}

function rememberBounded<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.set(key, value);
  while (map.size > MAX_PENDING_MODEL_OUTPUTS) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    map.delete(oldestKey);
  }
}

function randomId(): string {
  return randomBytes(16).toString('hex');
}

function cloneTrace(trace: CodeModeTrace): CodeModeTrace {
  return {
    ...trace,
    bridgeRequests: trace.bridgeRequests.map(entry => ({ ...entry })),
    ...(trace.error !== undefined ? { error: { ...trace.error } } : {}),
  };
}
