import { createHash } from 'node:crypto';
import path from 'node:path';

const MATCHER = '^apply_patch$';
const TIMEOUT_SECONDS = 10;
const COMMAND =
  "printf '%s\\n' \"Tool 'apply_patch' is inactive due to the HarnessAgent tool filtering policy.\" >&2; exit 2";

export type TrustedApplyPatchHook = {
  cliOverrides: string[];
  threadConfig: Record<string, unknown>;
  key: string;
  hash: string;
  command: string;
};

export function createTrustedApplyPatchHook({
  codexConfig,
}: {
  codexConfig: Record<string, unknown>;
}): TrustedApplyPatchHook {
  const threadConfig = { ...codexConfig };
  const hooks = { ...asRecord(threadConfig.hooks) };
  delete threadConfig.hooks;

  for (const [key, value] of Object.entries(threadConfig)) {
    if (!key.startsWith('hooks.')) continue;
    const name = key.slice('hooks.'.length);
    if (name.startsWith('state.')) {
      hooks.state = {
        ...asRecord(hooks.state),
        [name.slice('state.'.length)]: value,
      };
    } else {
      hooks[name] = value;
    }
    delete threadConfig[key];
  }

  const userGroups = hooks.PreToolUse ?? [];
  if (!Array.isArray(userGroups)) {
    throw new Error('Codex config hooks.PreToolUse must be an array.');
  }

  const handler = {
    type: 'command',
    command: COMMAND,
    timeout: TIMEOUT_SECONDS,
    async: false,
  };
  const hash = `sha256:${createHash('sha256')
    .update(
      JSON.stringify(
        canonicalize({
          event_name: 'pre_tool_use',
          matcher: MATCHER,
          hooks: [handler],
        }),
      ),
    )
    .digest('hex')}`;
  const sourcePath =
    process.platform === 'win32'
      ? path.win32.resolve('C:\\', '<session-flags>/config.toml')
      : path.posix.resolve('/', '<session-flags>/config.toml');
  const key = `${sourcePath}:pre_tool_use:${userGroups.length}:0`;

  hooks.PreToolUse = [...userGroups, { matcher: MATCHER, hooks: [handler] }];
  hooks.state = {
    ...asRecord(hooks.state),
    [key]: { enabled: true, trusted_hash: hash },
  };

  return {
    cliOverrides: [`hooks=${toTomlInline(hooks)}`, 'features.hooks=true'],
    threadConfig,
    key,
    hash,
    command: COMMAND,
  };
}

export function assertTrustedApplyPatchHook({
  response,
  hook,
}: {
  response: unknown;
  hook: TrustedApplyPatchHook;
}): void {
  const data = asRecord(response)?.data;
  const entry = Array.isArray(data) && data.length === 1 ? data[0] : null;
  const record = asRecord(entry);
  const matches = Array.isArray(record?.hooks)
    ? record.hooks.filter(item => asRecord(item)?.key === hook.key)
    : [];
  const match = matches.length === 1 ? asRecord(matches[0]) : undefined;
  if (
    !match ||
    match.eventName !== 'preToolUse' ||
    match.handlerType !== 'command' ||
    match.command !== hook.command ||
    match.matcher !== MATCHER ||
    match.currentHash !== hook.hash ||
    match.enabled !== true ||
    match.trustStatus !== 'trusted' ||
    (Array.isArray(record?.errors) && record.errors.length > 0)
  ) {
    throw new Error(
      'Codex app-server did not load the trusted apply_patch filtering hook.',
    );
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function toTomlInline(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(toTomlInline).join(',')}]`;
  }
  if (value != null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${JSON.stringify(key)}=${toTomlInline(item)}`)
      .join(',')}}`;
  }
  throw new Error('Codex hook configuration contains an unsupported value.');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
