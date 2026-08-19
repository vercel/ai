import { HarnessHistoryUnavailableError } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  parseTranscriptLines,
  readClaudeCodeHistory,
} from './claude-code-history';

function line(record: unknown): string {
  return JSON.stringify(record);
}

describe('parseTranscriptLines', () => {
  it('normalizes a user → assistant → tool exchange with full fidelity', async () => {
    const records = [
      {
        type: 'user',
        message: { role: 'user', content: 'make the api use uv properly' },
        timestamp: '2026-08-06T01:45:39.000Z',
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'The Dockerfile pins pip.' },
            { type: 'text', text: "I'll restructure the Dockerfile." },
          ],
        },
        timestamp: '2026-08-06T01:45:42.000Z',
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Bash',
              input: { command: 'vercel build' },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'Build Completed in /vercel/output',
            },
          ],
        },
      },
    ];

    const messages = await parseTranscriptLines(records.map(line));

    expect(messages).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', text: 'make the api use uv properly' }],
        at: '2026-08-06T01:45:39.000Z',
        raw: records[0],
      },
      {
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'The Dockerfile pins pip.' },
          { type: 'text', text: "I'll restructure the Dockerfile." },
        ],
        at: '2026-08-06T01:45:42.000Z',
        raw: records[1],
      },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'toolu_1',
            toolName: 'bash',
            nativeName: 'Bash',
            input: { command: 'vercel build' },
          },
        ],
        raw: records[2],
      },
      {
        role: 'user',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'toolu_1',
            toolName: 'bash',
            output: 'Build Completed in /vercel/output',
          },
        ],
        raw: records[3],
      },
    ]);
  });

  it('maps native tool names to the common vocabulary and keeps the native name', async () => {
    const messages = await parseTranscriptLines([
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: 'Grep', input: {} },
            { type: 'tool_use', id: 't2', name: 'WebFetch', input: {} },
            { type: 'tool_use', id: 't3', name: 'Task', input: {} },
            {
              type: 'tool_use',
              id: 't4',
              name: 'mcp__host__deploy',
              input: {},
            },
          ],
        },
      }),
    ]);

    expect(messages[0]?.parts).toMatchObject([
      { toolName: 'search', nativeName: 'Grep' },
      { toolName: 'fetch', nativeName: 'WebFetch' },
      { toolName: 'Task' },
      { toolName: 'deploy', nativeName: 'mcp__host__deploy' },
    ]);
  });

  it('marks failed tool results and keeps their output', async () => {
    const messages = await parseTranscriptLines([
      line({
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_9',
              content: [{ type: 'text', text: 'command not found' }],
              is_error: true,
            },
          ],
        },
      }),
    ]);

    expect(messages[0]?.parts[0]).toMatchObject({
      type: 'tool-result',
      isError: true,
      output: [{ type: 'text', text: 'command not found' }],
    });
  });

  it('skips sidechain records, bookkeeping types, and interrupt filler', async () => {
    const messages = await parseTranscriptLines([
      line({
        type: 'assistant',
        isSidechain: true,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'subagent chatter' }],
        },
      }),
      line({ type: 'file-history-snapshot', snapshot: {} }),
      line({ type: 'queue-operation', operation: 'dequeue' }),
      line({
        type: 'user',
        message: {
          role: 'user',
          content: '[Request interrupted by user for tool use]',
        },
      }),
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'No response requested.' }],
        },
      }),
      line({
        type: 'user',
        message: { role: 'user', content: 'real message' },
      }),
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.parts).toEqual([
      { type: 'text', text: 'real message' },
    ]);
  });

  it('survives a line torn mid-write', async () => {
    const messages = await parseTranscriptLines([
      line({
        type: 'user',
        message: { role: 'user', content: 'before' },
      }),
      '{"type":"assistant","message":{"role":"assis', // torn
      line({
        type: 'user',
        message: { role: 'user', content: 'after' },
      }),
    ]);

    expect(messages.map(m => m.parts[0])).toEqual([
      { type: 'text', text: 'before' },
      { type: 'text', text: 'after' },
    ]);
  });
});

// ─── readClaudeCodeHistory ─────────────────────────────────────────────

const WORK_DIR = '/work/my-app';
const PROJECT_DIR = '/home/user/.claude/projects/-work-my-app';

function transcriptContent(texts: string[], cwd = WORK_DIR): string {
  return (
    texts
      .map((text, index) =>
        line({
          type: 'user',
          cwd,
          message: { role: 'user', content: text },
          timestamp: `2026-08-06T01:45:0${index}.000Z`,
        }),
      )
      .join('\n') + '\n'
  );
}

function makeSession({
  files = {},
  listing,
  home = '/home/user',
}: {
  files?: Record<string, string>;
  listing?: { exitCode: number; stdout: string };
  home?: string;
}): Experimental_SandboxSession {
  return {
    run: vi.fn(async ({ command }: { command: string }) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: home, stderr: '' };
      }
      if (command.startsWith('ls -t')) {
        return {
          stderr: '',
          ...(listing ?? { exitCode: 2, stdout: '' }),
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    }),
    readTextFile: vi.fn(
      async ({
        path,
        startLine,
        endLine,
      }: {
        path: string;
        startLine?: number;
        endLine?: number;
      }) => {
        const content = files[path];
        if (content == null) return null;
        if (startLine == null && endLine == null) return content;
        return content
          .split('\n')
          .slice((startLine ?? 1) - 1, endLine)
          .join('\n');
      },
    ),
  } as unknown as Experimental_SandboxSession;
}

describe('readClaudeCodeHistory', () => {
  it('resolves an empty result when no transcript exists yet', async () => {
    const session = makeSession({});

    const result = await readClaudeCodeHistory({ session, workDir: WORK_DIR });

    expect(result.messages).toEqual([]);
    expect(typeof result.cursor).toBe('string');
  });

  it('reads the newest transcript that belongs to the working directory', async () => {
    const session = makeSession({
      listing: { exitCode: 0, stdout: 'newer.jsonl\nolder.jsonl\n' },
      files: {
        // Newest is another conversation from a different cwd.
        [`${PROJECT_DIR}/newer.jsonl`]: transcriptContent(
          ['other project'],
          '/work/other',
        ),
        [`${PROJECT_DIR}/older.jsonl`]: transcriptContent(['hello', 'again']),
      },
    });

    const result = await readClaudeCodeHistory({ session, workDir: WORK_DIR });

    expect(result.messages.map(m => m.parts[0])).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'again' },
    ]);
  });

  it('reads only the delta after a cursor, without dropping the next record', async () => {
    const first = transcriptContent(['one', 'two']);
    const session1 = makeSession({
      listing: { exitCode: 0, stdout: 't.jsonl\n' },
      files: { [`${PROJECT_DIR}/t.jsonl`]: first },
    });
    const { cursor } = await readClaudeCodeHistory({
      session: session1,
      workDir: WORK_DIR,
    });

    const session2 = makeSession({
      listing: { exitCode: 0, stdout: 't.jsonl\n' },
      files: {
        [`${PROJECT_DIR}/t.jsonl`]: transcriptContent(['one', 'two', 'three']),
      },
    });
    const delta = await readClaudeCodeHistory({
      session: session2,
      workDir: WORK_DIR,
      since: cursor,
    });

    expect(delta.messages.map(m => m.parts[0])).toEqual([
      { type: 'text', text: 'three' },
    ]);
  });

  it('re-reads the whole transcript when the cursor names another file', async () => {
    const session = makeSession({
      listing: { exitCode: 0, stdout: 't.jsonl\n' },
      files: { [`${PROJECT_DIR}/t.jsonl`]: transcriptContent(['one']) },
    });

    const result = await readClaudeCodeHistory({
      session,
      workDir: WORK_DIR,
      since: JSON.stringify({
        v: 1,
        file: `${PROJECT_DIR}/gone.jsonl`,
        line: 5,
      }),
    });

    expect(result.messages).toHaveLength(1);
  });

  it('throws HarnessHistoryUnavailableError when the store cannot be reached', async () => {
    const session = {
      run: vi.fn(async () => {
        throw new Error('sandbox unreachable');
      }),
      readTextFile: vi.fn(),
    } as unknown as Experimental_SandboxSession;

    await expect(
      readClaudeCodeHistory({ session, workDir: WORK_DIR }),
    ).rejects.toSatisfy(error =>
      HarnessHistoryUnavailableError.isInstance(error),
    );
  });
});
