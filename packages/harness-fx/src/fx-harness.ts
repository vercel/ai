import {
  commonTool,
  HARNESS_V1_BUILTIN_TOOLS,
  type HarnessV1,
} from '@ai-sdk/harness';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { resolveFxEnv, type FxAuthenticationMode } from './fx-auth';
import { fxResumeStateSchema } from './fx-resume-state';
import { createFxSession } from './fx-session';
import { VERSION } from './version';

const FX_CLIENT_APP = `ai-sdk-harness-fx/${VERSION}`;

export type FxHarnessSettings = {
  readonly auth?: FxAuthenticationMode;
  readonly mcpServers?: Record<string, unknown>;
  readonly headers?: Record<string, string>;
  readonly effort?: string;
  readonly serviceTier?: 'default' | 'fast' | 'ultrafast';
  readonly backend?: 'auto' | 'native' | 'wasm';
};

const FX_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'read',
    toolUseKind: 'readonly',
    description: 'Read a file in the sandbox workspace.',
    inputSchema: z.object({ file_path: z.string() }),
  }),
  write: commonTool('write', {
    nativeName: 'write',
    toolUseKind: 'edit',
    description: 'Create or overwrite a file in the sandbox workspace.',
    inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  }),
  edit: commonTool('edit', {
    nativeName: 'edit',
    toolUseKind: 'edit',
    description: 'Replace an exact, unique string in a sandbox workspace file.',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'bash',
    toolUseKind: 'bash',
    description:
      'Execute a shell command in the sandbox workspace. Timeout is in seconds.',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    description: 'Search sandbox file contents.',
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
    description: 'Find files in the sandbox workspace.',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      limit: z.number().optional(),
    }),
  }),
  ls: {
    ...tool({
      description: 'List a sandbox workspace directory.',
      inputSchema: z.object({
        path: z.string().optional(),
        limit: z.number().optional(),
      }),
      outputSchema: z.unknown(),
    }),
    toolUseKind: 'readonly',
  },
  askUserQuestions: {
    ...HARNESS_V1_BUILTIN_TOOLS.askUserQuestions,
    toolUseKind: 'readonly',
  },
} as const;

export function createFx(
  settings: FxHarnessSettings = {},
): HarnessV1<typeof FX_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'fx',
    builtinTools: FX_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: true,
    supportsBuiltinToolFiltering: true,
    lifecycleStateSchema: fxResumeStateSchema,
    doStart: startOpts =>
      createFxSession({
        startOpts,
        settings,
        environment: resolveFxEnv({ auth: settings.auth }),
        builtinTools: FX_BUILTIN_TOOLS,
        clientApp: FX_CLIENT_APP,
      }),
  };
}
