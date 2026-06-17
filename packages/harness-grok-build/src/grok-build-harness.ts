import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  commonTool,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1BuiltinTool,
  type HarnessV1BuiltinToolName,
} from '@ai-sdk/harness';
import { z } from 'zod';
import { type GrokBuildAuthOptions } from './grok-build-auth';

/*
 * Native tool name → common harness name mapping.
 *
 * TODO: Reconcile these native keys against captured Grok Build CLI fixture
 * output once real CLI traces are available. The names below are borrowed from
 * the Claude Code harness as a placeholder and may differ from what Grok Build
 * actually emits.
 */
export const NATIVE_TO_COMMON: Readonly<
  Record<string, HarnessV1BuiltinToolName>
> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Glob: 'glob',
  Grep: 'grep',
  WebSearch: 'webSearch',
};

/**
 * Map a native Grok Build tool name to its cross-harness common name.
 * Returns the native name unchanged if no mapping is found.
 */
export function toCommonName(
  nativeName: string,
): HarnessV1BuiltinToolName | string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

/*
 * Every native tool the Grok Build CLI can invoke, declared as a ToolSet
 * keyed by the common name where a mapping exists.
 *
 * TODO: Reconcile native tool names and input schemas against captured Grok
 * Build CLI fixture output once real CLI traces are available.
 */
export const GROK_BUILD_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'Read',
    toolUseKind: 'readonly',
    description: 'Read file contents (text, image, PDF, notebook)',
    inputSchema: z.object({
      file_path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
      pages: z.string().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'Write',
    toolUseKind: 'edit',
    description: 'Overwrite or create a file at an absolute path',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'Edit',
    toolUseKind: 'edit',
    description: 'Edit a file by exact string replacement',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'Bash',
    toolUseKind: 'bash',
    description: 'Execute a shell command',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
      description: z.string().optional(),
      run_in_background: z.boolean().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'Glob',
    toolUseKind: 'readonly',
    description: 'Fast file-pattern search using glob syntax',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'Grep',
    toolUseKind: 'readonly',
    description: 'Regex search over file contents',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'WebSearch',
    toolUseKind: 'readonly',
    description: 'Issue web search queries',
    inputSchema: z.object({
      query: z.string(),
      allowed_domains: z.array(z.string()).optional(),
      blocked_domains: z.array(z.string()).optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

const BOOTSTRAP_DIR = '/tmp/harness/grok-build';

export type GrokBuildHarnessSettings = {
  readonly model?: string;
  readonly planMode?: boolean;
  readonly auth?: GrokBuildAuthOptions;
  readonly port?: number;
};

async function readBridgeAsset(name: string): Promise<string> {
  const candidates = [
    new URL(`./bridge/${name}`, import.meta.url),
    new URL(`../bridge/${name}`, import.meta.url),
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`bridge asset not found: ${name}`);
}

export function createGrokBuild(
  // Renamed to `settings` once doStart consumes it (turn-driver task).
  _settings: GrokBuildHarnessSettings = {},
): HarnessV1<typeof GROK_BUILD_BUILTIN_TOOLS> {
  // Per-instance cache: bridge assets are static, but keeping this in the
  // factory closure (rather than module scope) avoids leaking state across
  // separate createGrokBuild() instances.
  let cachedBootstrap: HarnessV1Bootstrap | null = null;
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'grok-build',
    builtinTools: GROK_BUILD_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: false,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [pkg, lock, bridge] = await Promise.all([
        readBridgeAsset('package.json'),
        readBridgeAsset('pnpm-lock.yaml'),
        readBridgeAsset('index.mjs'),
      ]);
      cachedBootstrap = {
        harnessId: 'grok-build',
        bootstrapDir: BOOTSTRAP_DIR,
        files: [
          { path: `${BOOTSTRAP_DIR}/package.json`, content: pkg },
          { path: `${BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
          { path: `${BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
        ],
        commands: [
          { command: `mkdir -p ${BOOTSTRAP_DIR}` },
          {
            command: `pnpm --dir ${BOOTSTRAP_DIR} install --frozen-lockfile --store-dir ${BOOTSTRAP_DIR}/.pnpm-store`,
          },
          {
            command: `cd ${BOOTSTRAP_DIR} && ./node_modules/.bin/grok --version`,
          },
        ],
      };
      return cachedBootstrap;
    },
    doStart: async () => {
      throw new Error('not implemented yet');
    },
  };
}
