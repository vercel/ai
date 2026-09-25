import type {
  HarnessV1BuiltinToolFiltering,
  HarnessV1QuestionsToolOutput,
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import {
  createTool,
  type AgentTool,
  type AgentToolResult,
} from '@cline/agents';
import { createDefaultTools } from '@cline/core';
import type { ClineRemoteOps } from './cline-remote-ops';
import { getErrorText } from './cline-utils';

/**
 * Native names of the Cline harness's built-in tools. The Cline runtime
 * requires snake_case tool names, and every one of these already matches its
 * cross-harness common name, so the public (wire) names and native names are
 * identical.
 */
export const CLINE_NATIVE_BUILTIN_NAMES = [
  'ask_question',
  'read',
  'write',
  'edit',
  'bash',
  'grep',
  'glob',
  'ls',
  'skills',
] as const;

export type ClineNativeBuiltinName =
  (typeof CLINE_NATIVE_BUILTIN_NAMES)[number];

export const CLINE_NATIVE_TOOL_KINDS: Readonly<
  Record<ClineNativeBuiltinName, 'readonly' | 'edit' | 'bash'>
> = {
  ask_question: 'readonly',
  read: 'readonly',
  write: 'edit',
  edit: 'edit',
  bash: 'bash',
  grep: 'readonly',
  glob: 'readonly',
  ls: 'readonly',
  skills: 'readonly',
};

export function isClineBuiltinToolName(
  name: string,
): name is ClineNativeBuiltinName {
  return (CLINE_NATIVE_BUILTIN_NAMES as readonly string[]).includes(name);
}

/**
 * Resolve which built-in tools stay active for a session under the framework's
 * `builtinToolFiltering`. Names map 1:1 (native === common), so filtering is a
 * plain include/exclude.
 */
export function resolveActiveClineBuiltinNames(
  toolFiltering: HarnessV1BuiltinToolFiltering | undefined,
): ReadonlyArray<ClineNativeBuiltinName> {
  if (toolFiltering == null) return CLINE_NATIVE_BUILTIN_NAMES;
  const filteredNames = toolFiltering.toolNames.map(name =>
    name === 'askUserQuestions' ? 'ask_question' : name,
  );
  if (toolFiltering.mode === 'allow') {
    return CLINE_NATIVE_BUILTIN_NAMES.filter(name =>
      filteredNames.includes(name),
    );
  }
  return CLINE_NATIVE_BUILTIN_NAMES.filter(
    name => !filteredNames.includes(name),
  );
}

export interface PendingToolResult {
  resolve: (value: unknown) => void;
}

export interface PendingClineQuestion {
  readonly input: {
    readonly question: string;
    readonly options: readonly string[];
  };
  resolve: (value: string) => void;
}

export interface PendingClineQuestionResult {
  readonly output: HarnessV1QuestionsToolOutput;
}

export function clineQuestionKey(input: {
  readonly question: string;
  readonly options: readonly string[];
}): string {
  return JSON.stringify([input.question, input.options]);
}

const clineToolResultMarker = Symbol('cline-tool-result');

interface ClineToolResult {
  readonly [clineToolResultMarker]: true;
  readonly output: unknown;
  readonly isError?: boolean;
}

export function createClineToolResult({
  output,
  isError,
}: {
  output: unknown;
  isError?: boolean;
}): ClineToolResult {
  return {
    [clineToolResultMarker]: true,
    output,
    ...(isError ? { isError: true } : {}),
  };
}

export function unwrapClineToolResult(
  value: unknown,
): AgentToolResult | undefined {
  if (
    value == null ||
    typeof value !== 'object' ||
    (value as ClineToolResult)[clineToolResultMarker] !== true
  ) {
    return undefined;
  }

  const result = value as ClineToolResult;
  return {
    output: result.output,
    ...(result.isError ? { isError: true } : {}),
  };
}

/*
 * The Cline runtime treats a thrown tool error as a "mistake" against the
 * agent's mistake limit, so built-ins catch and return errors as structured
 * data — the model reads the error and adjusts.
 */
async function guarded<T>(run: () => Promise<T>): Promise<ClineToolResult> {
  try {
    return createClineToolResult({ output: await run() });
  } catch (error) {
    return createClineToolResult({
      output: { error: getErrorText(error) },
      isError: true,
    });
  }
}

/**
 * Build the sandbox-backed coding tools handed to the Cline runtime. These
 * schemas mirror their declarations in `CLINE_BUILTIN_TOOLS`
 * (cline-harness.ts). The in-host skills tool is built separately.
 */
export function buildBuiltinAgentTools({
  ops,
  activeNames,
  pendingQuestions = new Map(),
  pendingQuestionResults = new Map(),
}: {
  ops: ClineRemoteOps;
  activeNames: ReadonlyArray<ClineNativeBuiltinName>;
  pendingQuestions?: Map<string, PendingClineQuestion>;
  pendingQuestionResults?: Map<string, PendingClineQuestionResult>;
}): AgentTool<any, any>[] {
  // biome/eslint: `any` matches the runtime's own `tools?: readonly AgentTool<any, any>[]`.
  const tools: Partial<Record<ClineNativeBuiltinName, AgentTool<any, any>>> = {
    ask_question: createDefaultTools({
      executors: {
        askQuestion: async (question, options, context) => {
          if (context.toolCallId == null) {
            throw new Error(
              'Cline ask_question did not provide a tool call id.',
            );
          }
          const questionKey = clineQuestionKey({ question, options });
          const pendingResult = pendingQuestionResults.get(questionKey);
          if (pendingResult != null) {
            pendingQuestionResults.delete(questionKey);
            return toClineQuestionResult({
              nativeInput: { question, options },
              output: pendingResult.output,
            });
          }
          return new Promise<string>(resolve => {
            pendingQuestions.set(context.toolCallId!, {
              input: { question, options },
              resolve,
            });
          });
        },
      },
      enableReadFiles: false,
      enableSearch: false,
      enableBash: false,
      enableWebFetch: false,
      enableApplyPatch: false,
      enableEditor: false,
      enableSkills: false,
      enableAskQuestion: true,
    }).find(tool => tool.name === 'ask_question'),
    read: createTool({
      name: 'read',
      description: 'Read file contents.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to read.',
          },
        },
        required: ['file_path'],
      },
      execute: async (input: { file_path: string }) =>
        guarded(() => ops.readFile(input.file_path)),
    }),
    write: createTool({
      name: 'write',
      description: 'Overwrite or create a file.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to write.',
          },
          content: {
            type: 'string',
            description: 'Full file content to write.',
          },
        },
        required: ['file_path', 'content'],
      },
      execute: async (input: { file_path: string; content: string }) =>
        guarded(async () => {
          await ops.writeFile(input.file_path, input.content);
          return `Wrote ${input.file_path}`;
        }),
    }),
    edit: createTool({
      name: 'edit',
      description: 'Edit a file by exact string replacement.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to edit.',
          },
          old_string: { type: 'string', description: 'Exact text to replace.' },
          new_string: { type: 'string', description: 'Replacement text.' },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
      execute: async (input: {
        file_path: string;
        old_string: string;
        new_string: string;
      }) =>
        guarded(async () => {
          await ops.editFile(
            input.file_path,
            input.old_string,
            input.new_string,
          );
          return `Edited ${input.file_path}`;
        }),
    }),
    bash: createTool({
      name: 'bash',
      description:
        'Execute a shell command in the sandbox workspace. Returns combined stdout/stderr and the exit code.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute.' },
          timeout: {
            type: 'number',
            description: 'Optional timeout in seconds.',
          },
        },
        required: ['command'],
      },
      execute: async (input: { command: string; timeout?: number }, context) =>
        guarded(async () => {
          const result = await ops.bash(input.command, {
            ...(typeof input.timeout === 'number'
              ? { timeout: input.timeout }
              : {}),
            ...(context.signal ? { signal: context.signal } : {}),
          });
          return `${result.output}${
            result.exitCode != null ? `\n\n(exit ${result.exitCode})` : ''
          }`.trim();
        }),
    }),
    grep: createTool({
      name: 'grep',
      description: 'Search file contents with regex.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for.',
          },
          path: { type: 'string', description: 'File or directory to search.' },
          glob: { type: 'string', description: 'Glob filter for file names.' },
          ignoreCase: { type: 'boolean' },
          literal: {
            type: 'boolean',
            description: 'Treat pattern as a literal string.',
          },
          context: {
            type: 'number',
            description: 'Lines of context around matches.',
          },
          limit: {
            type: 'number',
            description: 'Maximum matching lines to return.',
          },
        },
        required: ['pattern'],
      },
      execute: async (input: {
        pattern: string;
        path?: string;
        glob?: string;
        ignoreCase?: boolean;
        literal?: boolean;
        context?: number;
        limit?: number;
      }) => guarded(() => ops.grep(input.pattern, input)),
    }),
    glob: createTool({
      name: 'glob',
      description: 'Find files matching a glob pattern.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match.' },
          path: { type: 'string', description: 'Directory to search from.' },
          limit: { type: 'number', description: 'Maximum paths to return.' },
        },
        required: ['pattern'],
      },
      execute: async (input: {
        pattern: string;
        path?: string;
        limit?: number;
      }) =>
        guarded(async () => {
          const matches = await ops.glob(
            input.pattern,
            input.path ?? '.',
            input.limit ?? 1_000,
          );
          return matches.length > 0 ? matches.join('\n') : 'No files found';
        }),
    }),
    ls: createTool({
      name: 'ls',
      description: 'List directory entries.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to list.' },
          limit: { type: 'number', description: 'Maximum entries to return.' },
        },
      },
      execute: async (input: { path?: string; limit?: number }) =>
        guarded(async () => {
          const entries = await ops.ls(input.path ?? '.', input.limit ?? 500);
          return entries.join('\n');
        }),
    }),
  };

  return activeNames
    .map(name => tools[name])
    .filter((tool): tool is AgentTool<any, any> => tool != null);
}

export function toClineQuestionResult(input: {
  nativeInput: PendingClineQuestion['input'];
  output: HarnessV1QuestionsToolOutput;
}): string {
  if (
    input.output.action === 'declined' ||
    input.output.action === 'cancelled'
  ) {
    return `The user ${input.output.action} the question.`;
  }
  const answer = input.output.answers['question-1'];
  if (answer == null) return 'The user did not answer the question.';
  if (answer.freeform != null) return answer.freeform;
  const result = answer.optionIds
    .map(id => {
      const index = Number(id.replace(/^option-/, '')) - 1;
      return input.nativeInput.options[index];
    })
    .filter((value): value is string => value != null)
    .join(', ');
  return result;
}

/**
 * Build host-executed user tools. When the model calls one, the tool parks a
 * promise keyed by the runtime's `toolCallId`; the harness caller supplies the
 * output via `submitToolResult`, which resolves the promise and lets the loop
 * continue. The adapter never executes these itself.
 */
export function buildUserAgentTools({
  specs,
  pendingToolResults,
}: {
  specs: ReadonlyArray<HarnessV1ToolSpec>;
  pendingToolResults: Map<string, PendingToolResult>;
}): AgentTool<any, any>[] {
  return specs.map(spec =>
    createTool({
      name: spec.name,
      description: spec.description ?? `User-registered tool ${spec.name}`,
      inputSchema: (spec.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
      execute: async (_input: unknown, context) => {
        const toolCallId = context.toolCallId;
        if (!toolCallId) {
          return createClineToolResult({
            output: { error: 'Tool call is missing a toolCallId.' },
            isError: true,
          });
        }
        return new Promise<unknown>(resolve => {
          pendingToolResults.set(toolCallId, { resolve });
          // If the turn is aborted while waiting for the host, settle so the
          // runtime's tool execution does not dangle forever.
          context.signal?.addEventListener(
            'abort',
            () => {
              if (pendingToolResults.delete(toolCallId)) {
                resolve(
                  createClineToolResult({
                    output: {
                      error:
                        'Turn was aborted before a tool result was submitted.',
                    },
                    isError: true,
                  }),
                );
              }
            },
            { once: true },
          );
        });
      },
    }),
  );
}
