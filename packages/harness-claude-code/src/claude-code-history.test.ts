import { describe, expect, it } from 'vitest';
import { parseTranscriptLines } from './claude-code-history';

function line(record: unknown): string {
  return JSON.stringify(record);
}

describe('parseTranscriptLines', () => {
  it('normalizes a user → assistant → tool exchange', () => {
    const messages = parseTranscriptLines([
      line({
        type: 'user',
        message: { role: 'user', content: 'make the api use uv properly' },
        timestamp: '2026-08-06T01:45:39.000Z',
      }),
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: "I'll restructure the Dockerfile." }],
        },
        timestamp: '2026-08-06T01:45:42.000Z',
      }),
      line({
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
      }),
      line({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
          ],
        },
      }),
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', text: 'make the api use uv properly' }],
        at: '2026-08-06T01:45:39.000Z',
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: "I'll restructure the Dockerfile." }],
        at: '2026-08-06T01:45:42.000Z',
      },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolName: 'bash',
            input: { command: 'vercel build' },
          },
        ],
      },
      {
        role: 'user',
        parts: [{ type: 'tool-result', toolName: 'bash' }],
      },
    ]);
  });

  it('maps native tool names to the common vocabulary', () => {
    const messages = parseTranscriptLines([
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'a', name: 'Edit', input: {} },
            { type: 'tool_use', id: 'b', name: 'Grep', input: {} },
            { type: 'tool_use', id: 'c', name: 'UnknownTool', input: {} },
            {
              type: 'tool_use',
              id: 'd',
              name: 'mcp__harness-tools__askUser',
              input: {},
            },
          ],
        },
      }),
    ]);

    expect(
      messages[0].parts.map(p => (p as { toolName: string }).toolName),
    ).toEqual(['edit', 'search', 'UnknownTool', 'askUser']);
  });

  it('drops everything that is not conversation', () => {
    const messages = parseTranscriptLines([
      line({ type: 'queue-operation' }),
      line({ type: 'attachment' }),
      line({ type: 'file-history-snapshot' }),
      line({ type: 'ai-title' }),
      line({
        type: 'user',
        message: { role: 'user', content: '[Request interrupted by user]' },
      }),
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
        type: 'assistant',
        isSidechain: true,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'subagent chatter' }],
        },
      }),
      line({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'hidden reasoning' }],
        },
      }),
      'not json at all',
      '',
    ]);

    expect(messages).toEqual([]);
  });

  it('flags failed tool results', () => {
    const messages = parseTranscriptLines([
      line({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'nope', is_error: true },
          ],
        },
      }),
    ]);

    expect(messages).toEqual([
      { role: 'user', parts: [{ type: 'tool-result', isError: true }] },
    ]);
  });
});
