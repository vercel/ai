import {
  commonTool,
  type HarnessV1,
  type HarnessV1BuiltinTool,
} from '@ai-sdk/harness';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { clineResumeStateSchema } from './cline-resume-state';
import { createClineSession } from './cline-session';

/**
 * Configuration knobs for `createCline`. The Cline runtime
 * (`@cline/agents`, part of the Cline SDK) runs as an in-process Node
 * library — no bridge, so there is no `port` or `startupTimeoutMs` to set.
 */
export type ClineHarnessSettings = {
  /**
   * Cline LLM provider id (e.g. `'anthropic'`, `'openai'`, `'gemini'`).
   * Defaults to `'anthropic'`.
   */
  readonly providerId?: string;
  /**
   * Model id for the configured provider. Defaults to `'claude-opus-5'`.
   */
  readonly modelId?: string;
  /**
   * Provider API key. When omitted, the Cline gateway falls back to the
   * provider's environment variable (e.g. `ANTHROPIC_API_KEY`).
   */
  readonly apiKey?: string;
  /** Custom provider endpoint. */
  readonly baseUrl?: string;
  /** Extra headers sent to the provider. */
  readonly headers?: Record<string, string>;
  /**
   * Additional system prompt text appended to the adapter's base system
   * prompt (workspace + sandbox + skills sections).
   */
  readonly systemPrompt?: string;
  /**
   * Safety cap on agent-loop iterations per turn. Unbounded when omitted.
   */
  readonly maxIterations?: number;
};

const DEFAULT_PROVIDER_ID = 'anthropic';
const DEFAULT_MODEL_ID = 'claude-opus-5';

/*
 * The Cline runtime requires snake_case tool names, and each of these
 * built-ins already matches its cross-harness common name — so native names
 * and wire names are identical, and `nativeName` mirrors the key. These zod
 * declarations mirror the JSON schemas handed to the runtime in
 * `cline-tools.ts` — keep the two in sync.
 */
const CLINE_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'read',
    toolUseKind: 'readonly',
    description: 'Read file contents.',
    inputSchema: z.object({
      file_path: z.string(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'write',
    toolUseKind: 'edit',
    description: 'Overwrite or create a file.',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'edit',
    toolUseKind: 'edit',
    description: 'Edit a file by exact string replacement.',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'bash',
    toolUseKind: 'bash',
    description: 'Execute a shell command in the sandbox.',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    description: 'Search file contents with regex.',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      glob: z.string().optional(),
      ignoreCase: z.boolean().optional(),
      literal: z.boolean().optional(),
      context: z.number().optional(),
      limit: z.number().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'glob',
    toolUseKind: 'readonly',
    description: 'Find files matching a glob pattern.',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      limit: z.number().optional(),
    }),
  }),
  ls: {
    ...tool({
      description: 'List directory entries.',
      inputSchema: z.object({
        path: z.string().optional(),
        limit: z.number().optional(),
      }),
      outputSchema: z.unknown(),
    }),
    nativeName: 'ls',
    toolUseKind: 'readonly',
  } as HarnessV1BuiltinTool,
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

export function createCline(
  settings: ClineHarnessSettings = {},
): HarnessV1<typeof CLINE_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'cline',
    builtinTools: CLINE_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: true,
    supportsBuiltinToolFiltering: true,
    lifecycleStateSchema: clineResumeStateSchema,
    doStart: async startOpts => {
      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const resumeData = lifecycleState?.data as
        | { historyFileName?: string }
        | undefined;

      return createClineSession({
        sessionId: startOpts.sessionId,
        sandboxSession: startOpts.sandboxSession,
        sessionWorkDir: startOpts.sessionWorkDir,
        skills: startOpts.skills ?? [],
        settings: {
          providerId: settings.providerId ?? DEFAULT_PROVIDER_ID,
          modelId: settings.modelId ?? DEFAULT_MODEL_ID,
          ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
          ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
          ...(settings.headers ? { headers: settings.headers } : {}),
          ...(settings.systemPrompt
            ? { systemPrompt: settings.systemPrompt }
            : {}),
          ...(settings.maxIterations !== undefined
            ? { maxIterations: settings.maxIterations }
            : {}),
        },
        isResume: lifecycleState != null,
        ...(startOpts.permissionMode
          ? { permissionMode: startOpts.permissionMode }
          : {}),
        ...(startOpts.builtinToolFiltering
          ? { builtinToolFiltering: startOpts.builtinToolFiltering }
          : {}),
        ...(resumeData?.historyFileName
          ? { resumeHistoryFileName: resumeData.historyFileName }
          : {}),
        ...(startOpts.abortSignal
          ? { abortSignal: startOpts.abortSignal }
          : {}),
      });
    },
  };
}
