import {
  HarnessHistoryUnavailableError,
  type HarnessV1HistoryMessage,
  type HarnessV1HistoryPart,
  type HarnessV1ReadHistoryResult,
} from '@ai-sdk/harness';
import { resolveSandboxHomeDir } from '@ai-sdk/harness/utils';
import {
  safeParseJSON,
  type Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';

/**
 * `doReadHistory` for Claude Code: read the session transcript the CLI itself
 * persists under `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl` and
 * normalize it to the harness history shape.
 *
 * The transcript is the runtime's own store, shared between every way of
 * driving the same conversation — SDK queries, `claude --resume`,
 * `claude --continue` — which is exactly why a host reads history through the
 * adapter: exchanges that happened outside the harness contract (a user
 * continuing the conversation interactively) exist nowhere else.
 *
 * All reads go through the sandbox session, so this works wherever the
 * runtime runs — the user's own machine and hosted sandboxes alike. A
 * conversation with no transcript yet resolves to an empty result; a store
 * that cannot be reached throws `HarnessHistoryUnavailableError`.
 */
export async function readClaudeCodeHistory(options: {
  /** Tool-safe session of the sandbox the runtime runs in. */
  session: Experimental_SandboxSession;
  /** The directory Claude Code runs in; keys the transcript store. */
  workDir: string;
  /** Cursor from a previous read; only messages after it are returned. */
  since?: string;
  abortSignal?: AbortSignal;
}): Promise<HarnessV1ReadHistoryResult> {
  const { session, workDir, since, abortSignal } = options;

  let homeDir: string;
  try {
    homeDir = await resolveSandboxHomeDir({ sandbox: session, abortSignal });
  } catch (error) {
    throw new HarnessHistoryUnavailableError({
      harnessId: 'claude-code',
      message:
        'claude-code: cannot locate the transcript store — the sandbox HOME directory could not be resolved.',
      cause: error,
    });
  }

  const projectDir = `${homeDir}/.claude/projects/${encodeProjectPath(workDir)}`;
  const transcript = await findLatestTranscript({
    session,
    projectDir,
    workDir,
    abortSignal,
  });
  // No transcript is data, not an error: nothing has been recorded yet for
  // this working directory.
  if (transcript == null) {
    return { messages: [], cursor: emptyCursor() };
  }

  const content = await Promise.resolve(
    session.readTextFile({ path: transcript, abortSignal }),
  ).catch((error: unknown) => {
    throw new HarnessHistoryUnavailableError({
      harnessId: 'claude-code',
      message: `claude-code: the transcript at ${transcript} could not be read.`,
      cause: error,
    });
  });
  if (content == null) {
    return { messages: [], cursor: emptyCursor() };
  }

  const lines = content.split('\n');
  const cursor = await parseCursor(since);
  // A cursor from a different transcript means the conversation moved
  // (resumed under a fork, or a different one opened); the whole current
  // transcript is the honest answer.
  const fromLine = cursor?.file === transcript ? cursor.line : 0;

  // `split('\n')` yields a trailing empty element for the newline that
  // terminates every complete JSONL record, so the next unread slot is
  // `lines.length - 1`. Storing `lines.length` would place the cursor one
  // past the next record and silently drop it. When the file does not end in
  // a newline (a record torn mid-write), that record is re-read once whole.
  const consumed = Math.max(0, lines.length - 1);

  return {
    messages: await parseTranscriptLines(lines.slice(fromLine)),
    cursor: JSON.stringify({ v: 1, file: transcript, line: consumed }),
  };
}

/**
 * Normalize raw transcript lines into history messages. Exported for tests.
 *
 * Retains everything a UI needs to reproduce the exchange: text, reasoning
 * (`thinking` blocks), tool calls with their inputs, tool results with their
 * full recorded output, and the runtime's raw record on every message.
 * Skipped entirely: sidechain (subagent) records, bookkeeping types
 * (`attachment`, `queue-operation`, `file-history-snapshot`, mode records,
 * …), and interrupt markers plus the filler the CLI writes after them.
 */
export async function parseTranscriptLines(
  lines: readonly string[],
): Promise<HarnessV1HistoryMessage[]> {
  const messages: HarnessV1HistoryMessage[] = [];
  /** tool_use id → common name, so results can carry their tool's name. */
  const toolNames = new Map<string, string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = await safeParseJSON({ text: line });
    // A line torn mid-write costs itself, not the read.
    if (!parsed.success) continue;
    const record = parsed.value as TranscriptRecord;
    if (record == null || typeof record !== 'object') continue;

    if (record.isSidechain === true) continue;
    if (record.type !== 'user' && record.type !== 'assistant') continue;

    const content = record.message?.content;
    const parts: HarnessV1HistoryPart[] = [];

    if (typeof content === 'string') {
      if (isConversationText(content)) {
        parts.push({ type: 'text', text: content });
      }
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string') {
          if (isConversationText(block.text)) {
            parts.push({ type: 'text', text: block.text });
          }
        } else if (
          block.type === 'thinking' &&
          typeof block.thinking === 'string'
        ) {
          parts.push({ type: 'reasoning', text: block.thinking });
        } else if (
          block.type === 'tool_use' &&
          typeof block.name === 'string'
        ) {
          const toolName = toCommonToolName(block.name);
          if (typeof block.id === 'string') toolNames.set(block.id, toolName);
          parts.push({
            type: 'tool-call',
            ...(typeof block.id === 'string' ? { toolCallId: block.id } : {}),
            toolName,
            ...(toolName === block.name ? {} : { nativeName: block.name }),
            input: block.input,
          });
        } else if (block.type === 'tool_result') {
          parts.push({
            type: 'tool-result',
            ...(typeof block.tool_use_id === 'string'
              ? { toolCallId: block.tool_use_id }
              : {}),
            ...(typeof block.tool_use_id === 'string' &&
            toolNames.has(block.tool_use_id)
              ? { toolName: toolNames.get(block.tool_use_id) }
              : {}),
            ...(block.content !== undefined ? { output: block.content } : {}),
            ...(block.is_error === true ? { isError: true } : {}),
          });
        }
      }
    }

    if (parts.length === 0) continue;

    messages.push({
      role: record.type,
      parts,
      ...(typeof record.timestamp === 'string' ? { at: record.timestamp } : {}),
      raw: record,
    });
  }

  return messages;
}

/** Interrupt markers and the CLI's post-interrupt filler are not conversation. */
function isConversationText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[Request interrupted by user')) return false;
  if (trimmed === 'No response requested.') return false;
  return true;
}

/**
 * The same native→common mapping the bridge applies to live stream events,
 * so a host renders history and stream with one vocabulary. Kept in sync
 * with the bridge's table by the adapter tests.
 */
const NATIVE_TO_COMMON: Record<string, string> = {
  Bash: 'bash',
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Glob: 'search',
  Grep: 'search',
  WebSearch: 'search',
  WebFetch: 'fetch',
};

function toCommonToolName(nativeName: string): string {
  const common = NATIVE_TO_COMMON[nativeName];
  if (common) return common;
  // Host tools surface as `mcp__<server>__<tool>`; the tool's own name is
  // the meaningful part.
  const mcpMatch = nativeName.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
  return mcpMatch ? mcpMatch[1] : nativeName;
}

/**
 * Newest transcript in the store that belongs to this working directory, or
 * `undefined` when none exists yet. The directory encoding is lossy (every
 * non-alphanumeric character becomes a dash), so the record's own `cwd` is
 * the authority.
 */
async function findLatestTranscript({
  session,
  projectDir,
  workDir,
  abortSignal,
}: {
  session: Experimental_SandboxSession;
  projectDir: string;
  workDir: string;
  abortSignal?: AbortSignal;
}): Promise<string | undefined> {
  // Newest first. A missing project directory exits non-zero, which is the
  // "no conversation yet" case rather than an error.
  const listing = await Promise.resolve(
    session.run({
      command: 'ls -t -- "$PROJECT_DIR"',
      env: { PROJECT_DIR: projectDir },
      abortSignal,
    }),
  ).catch((error: unknown) => {
    throw new HarnessHistoryUnavailableError({
      harnessId: 'claude-code',
      message: `claude-code: the transcript store at ${projectDir} could not be listed.`,
      cause: error,
    });
  });
  if (listing.exitCode !== 0) return undefined;

  const names = listing.stdout
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.endsWith('.jsonl'));

  for (const name of names) {
    const path = `${projectDir}/${name}`;
    // The head is enough to find the record that names the cwd.
    const head = await Promise.resolve(
      session.readTextFile({ path, startLine: 1, endLine: 40, abortSignal }),
    ).catch(() => null);
    if (head == null) continue;
    for (const line of head.split('\n')) {
      if (!line.trim()) continue;
      const parsed = await safeParseJSON({ text: line });
      if (!parsed.success) continue; // Keep scanning the head.
      const cwd = (parsed.value as { cwd?: unknown } | null)?.cwd;
      if (cwd === workDir) return path;
      if (typeof cwd === 'string') break; // Right shape, wrong directory.
    }
  }
  return undefined;
}

async function parseCursor(
  since: string | undefined,
): Promise<{ file: string; line: number } | undefined> {
  if (!since) return undefined;
  const parsed = await safeParseJSON({ text: since });
  // An unreadable cursor reads from the start, which is safe.
  if (!parsed.success) return undefined;
  const value = parsed.value as { file?: unknown; line?: unknown } | null;
  if (typeof value?.file === 'string' && typeof value.line === 'number') {
    return { file: value.file, line: value.line };
  }
  return undefined;
}

function emptyCursor(): string {
  return JSON.stringify({ v: 1, file: null, line: 0 });
}

/**
 * Claude Code names each project directory after the absolute path with
 * every non-alphanumeric character replaced by a dash.
 */
function encodeProjectPath(absolutePath: string): string {
  return absolutePath.replace(/[^a-zA-Z0-9]/g, '-');
}

type TranscriptRecord = {
  type?: string;
  isSidechain?: boolean;
  timestamp?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?:
      | string
      | Array<{
          type?: string;
          text?: string;
          thinking?: string;
          id?: string;
          name?: string;
          input?: unknown;
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        }>;
  };
} | null;
