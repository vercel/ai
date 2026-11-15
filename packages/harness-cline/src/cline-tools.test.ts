import type { HarnessV1ToolSpec } from '@ai-sdk/harness';
import type { AgentTool } from '@cline/agents';
import { describe, expect, it, vi } from 'vitest';
import type { ClineRemoteOps } from './cline-remote-ops';
import {
  buildBuiltinAgentTools,
  buildUserAgentTools,
  createClineToolResult,
  toClineQuestionResult,
  unwrapClineToolResult,
  type PendingToolResult,
} from './cline-tools';

const toolContext: Parameters<AgentTool['execute']>[1] = {
  agentId: 'agent-1',
  runId: 'run-1',
  iteration: 1,
  toolCallId: 'call-1',
};

const userToolSpec: HarnessV1ToolSpec = {
  name: 'lookup',
  inputSchema: { type: 'object', properties: {} },
};

describe('buildBuiltinAgentTools', () => {
  it('wraps a successful built-in tool result without changing its output', async () => {
    const output = { content: 'file contents' };
    const ops = {
      readFile: vi.fn(async () => output),
    } as unknown as ClineRemoteOps;
    const [tool] = buildBuiltinAgentTools({ ops, activeNames: ['read'] });

    const result = await tool.execute({ file_path: 'file.txt' }, toolContext);
    const unwrapped = unwrapClineToolResult(result);

    expect(unwrapped).toEqual({ output });
    expect(unwrapped?.output).toBe(output);
  });

  it('marks a caught built-in tool failure as an error', async () => {
    const ops = {
      readFile: vi.fn(async () => {
        throw new Error('File not found: missing.txt');
      }),
    } as unknown as ClineRemoteOps;
    const [tool] = buildBuiltinAgentTools({ ops, activeNames: ['read'] });

    const result = await tool.execute(
      { file_path: 'missing.txt' },
      toolContext,
    );

    expect(unwrapClineToolResult(result)).toEqual({
      output: { error: 'File not found: missing.txt' },
      isError: true,
    });
  });
});

describe('buildUserAgentTools', () => {
  it('marks a missing tool call ID as an error', async () => {
    const [tool] = buildUserAgentTools({
      specs: [userToolSpec],
      pendingToolResults: new Map(),
    });

    const result = await tool.execute(
      {},
      { ...toolContext, toolCallId: undefined },
    );

    expect(unwrapClineToolResult(result)).toEqual({
      output: { error: 'Tool call is missing a toolCallId.' },
      isError: true,
    });
  });

  it('marks an aborted pending tool call as an error', async () => {
    const pendingToolResults = new Map<string, PendingToolResult>();
    const controller = new AbortController();
    const [tool] = buildUserAgentTools({
      specs: [userToolSpec],
      pendingToolResults,
    });
    const resultPromise = tool.execute(
      {},
      { ...toolContext, signal: controller.signal },
    );

    controller.abort();

    expect(unwrapClineToolResult(await resultPromise)).toEqual({
      output: {
        error: 'Turn was aborted before a tool result was submitted.',
      },
      isError: true,
    });
    expect(pendingToolResults).toHaveLength(0);
  });
});

describe('Cline tool result envelope', () => {
  it.each([
    { isError: true, expectedIsError: true },
    { isError: false, expectedIsError: undefined },
    { isError: undefined, expectedIsError: undefined },
  ])('preserves isError=$isError', ({ isError, expectedIsError }) => {
    const output = { nested: true };
    const result = unwrapClineToolResult(
      createClineToolResult({ output, isError }),
    );

    expect(result?.output).toBe(output);
    expect(result?.isError).toBe(expectedIsError);
  });

  it('does not unwrap an unmarked lookalike', () => {
    expect(
      unwrapClineToolResult({
        output: 'ordinary tool output',
        isError: true,
      }),
    ).toBeUndefined();
  });
});

describe('Cline question translation', () => {
  it('maps the canonical answer to the selected native option', () => {
    expect(
      toClineQuestionResult({
        nativeInput: {
          question: 'Which framework?',
          options: ['React', 'Vue'],
        },
        output: {
          action: 'answered',
          answers: {
            'question-1': { optionIds: ['option-2'] },
          },
        },
      }),
    ).toBe('Vue');
  });

  it('returns a native string for declined questions', () => {
    expect(
      toClineQuestionResult({
        nativeInput: {
          question: 'Which framework?',
          options: ['React', 'Vue'],
        },
        output: { action: 'declined' },
      }),
    ).toBe('The user declined the question.');
  });
});
