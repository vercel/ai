import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  HarnessV1HistoryMessage,
  HarnessV1HistoryPart,
  HarnessV1ReadHistoryResult,
} from '@ai-sdk/harness';

/**
 * `doReadHistory` for Claude Code: read the session transcript the CLI itself
 * persists under `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl` and
 * normalize it to the harness history shape.
 *
 * The transcript is the runtime's own store, shared between every way of
 * driving the same conversation — SDK queries, `claude --resume`, `claude
 * --continue` — which is exactly why a host reads history through the
 * adapter: exchanges that happened outside the harness contract (a user
 * continuing the conversation interactively) exist nowhere else.
 *
 * Reads the host filesystem directly, which is correct wherever the runtime
 * runs beside the adapter (the local workspace sandbox). When the store is
 * not reachable — a remote sandbox owns `~/.claude` — this resolves
 * `undefined`, per the contract: absence of a record is not an error.
 */
export async function readClaudeCodeHistory(options: {
  /** The directory Claude Code runs in; keys the transcript store. */
  workDir: string;
  /** Cursor from a previous read; only messages after it are returned. */
  since?: string;
}): Promise<HarnessV1ReadHistoryResult | undefined> {
  try {
    const dir = join(
      homedir(),
      '.claude',
      'projects',
      encodeProjectPath(options.workDir),
    );
    const transcript = await findLatestTranscript(dir, options.workDir);
    if (!transcript) return undefined;

    const lines = (await readFile(transcript, 'utf-8')).split('\n');
    const cursor = parseCursor(options.since);
    // A cursor from a different transcript means the conversation moved
    // (resumed under a fork, or a different one opened); the whole current
    // transcript is the honest answer.
    const fromLine = cursor?.file === transcript ? cursor.line : 0;

    return {
      messages: parseTranscriptLines(lines.slice(fromLine)),
      cursor: JSON.stringify({ v: 1, file: transcript, line: lines.length }),
    };
  } catch {
    return undefined;
  }
}

/**
 * Normalize raw transcript lines into history messages. Exported for tests.
 *
 * Skips everything that is not conversation: sidechain (subagent) records,
 * bookkeeping types (`attachment`, `queue-operation`, `file-history-snapshot`,
 * mode records, …), interrupt markers and the filler the CLI writes after
 * them, and tool-result-only user records are folded into `tool-result`
 * parts rather than surfacing as user utterances.
 */
export function parseTranscriptLines(
  lines: readonly string[],
): HarnessV1HistoryMessage[] {
  const messages: HarnessV1HistoryMessage[] = [];
  /** tool_use id → common name, so results can carry their tool's name. */
  const toolNames = new Map<string, string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      continue; // A line torn mid-write costs itself, not the read.
    }

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
          block.type === 'tool_use' &&
          typeof block.name === 'string'
        ) {
          const toolName = toCommonToolName(block.name);
          if (typeof block.id === 'string') toolNames.set(block.id, toolName);
          parts.push({ type: 'tool-call', toolName, input: block.input });
        } else if (block.type === 'tool_result') {
          parts.push({
            type: 'tool-result',
            ...(typeof block.tool_use_id === 'string' &&
            toolNames.has(block.tool_use_id)
              ? { toolName: toolNames.get(block.tool_use_id) }
              : {}),
            ...(block.is_error === true ? { isError: true } : {}),
          });
        }
        // thinking blocks are deliberately dropped: history is a record for
        // rendering, not a replayable stream.
      }
    }

    if (parts.length === 0) continue;

    messages.push({
      role: record.type,
      parts,
      ...(typeof record.timestamp === 'string' ? { at: record.timestamp } : {}),
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
 * so a host renders history and stream with one vocabulary.
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
 * Newest transcript in the store that belongs to this working directory.
 * The directory encoding is lossy (every non-alphanumeric character becomes
 * a dash), so the record's own `cwd` is the authority.
 */
async function findLatestTranscript(
  dir: string,
  workDir: string,
): Promise<string | undefined> {
  const entries = (await readdir(dir)).filter(name => name.endsWith('.jsonl'));
  const dated = await Promise.all(
    entries.map(async name => {
      const path = join(dir, name);
      return { path, mtime: (await stat(path)).mtimeMs };
    }),
  );
  dated.sort((a, b) => b.mtime - a.mtime);

  for (const candidate of dated) {
    const head = (await readFile(candidate.path, 'utf-8')).slice(0, 64_000);
    for (const line of head.split('\n').slice(0, 40)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as { cwd?: unknown };
        if (record.cwd === workDir) return candidate.path;
        if (typeof record.cwd === 'string') break; // Right shape, wrong dir.
      } catch {
        // Keep scanning the head.
      }
    }
  }
  return undefined;
}

function parseCursor(
  since: string | undefined,
): { file: string; line: number } | undefined {
  if (!since) return undefined;
  try {
    const parsed = JSON.parse(since) as { file?: unknown; line?: unknown };
    if (typeof parsed.file === 'string' && typeof parsed.line === 'number') {
      return { file: parsed.file, line: parsed.line };
    }
  } catch {
    // An unreadable cursor reads from the start, which is safe.
  }
  return undefined;
}

/**
 * Claude Code names each project directory after the absolute path with
 * every non-alphanumeric character replaced by a dash.
 */
function encodeProjectPath(absolutePath: string): string {
  return absolutePath.replace(/[^a-zA-Z0-9]/g, '-');
}

interface TranscriptRecord {
  type?: string;
  isSidechain?: boolean;
  timestamp?: string;
  message?: {
    content?:
      | string
      | Array<{
          type?: string;
          text?: string;
          name?: string;
          id?: string;
          input?: unknown;
          tool_use_id?: string;
          is_error?: boolean;
        }>;
  };
}
