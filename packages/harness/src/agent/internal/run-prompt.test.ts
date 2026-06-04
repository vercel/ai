import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import type { TextStreamPart } from 'ai';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '../../v1';
import { runPrompt } from './run-prompt';

const WORK_DIR = '/vercel/sandbox/claude-code-abc123';

function fakeSession(script: HarnessV1StreamPart[]): HarnessV1Session {
  const emitScript = (emit: (event: HarnessV1StreamPart) => void) => {
    const control: HarnessV1PromptControl = {
      submitToolResult: async () => {},
      done: Promise.resolve(),
    };
    queueMicrotask(() => {
      for (const event of script) emit(event);
    });
    return control;
  };
  return {
    sessionId: 'fake-session',
    doPromptTurn: async (opts: HarnessV1PromptOptions) => emitScript(opts.emit),
    doContinueTurn: async opts => emitScript(opts.emit),
    doStop: async () => {},
    doGetResumeHandle: () => ({
      harnessId: 'fake',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doSuspendTurn: async () => ({
      harnessId: 'fake',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };
}

const harness: HarnessV1 = {
  specificationVersion: 'harness-v1',
  harnessId: 'fake',
  builtinTools: {},
  doStart: async () => fakeSession([]),
};

const finishEvents: HarnessV1StreamPart[] = [
  {
    type: 'finish-step',
    finishReason: { unified: 'stop', raw: 'end_turn' },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
  },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'end_turn' },
    totalUsage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
  },
];

describe('runPrompt workDir stripping', () => {
  test('strips the workDir for consumers but executes host tools with the absolute path', async () => {
    const executedArgs: unknown[] = [];
    const readFile = tool({
      description: 'Read a file',
      inputSchema: z.object({ path: z.string() }),
      execute: async (args: { path: string }) => {
        executedArgs.push(args);
        return { ok: true };
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'readFile',
          input: JSON.stringify({ path: `${WORK_DIR}/src/foo.ts` }),
        },
        {
          type: 'tool-result',
          toolCallId: 'b1',
          toolName: 'bash',
          result: `${WORK_DIR}/src/foo.ts\n${WORK_DIR}/src/bar.ts\n`,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { readFile } as ToolSet,
      toolSpecs: [],
      sandboxSession: undefined,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    // Host tool executes with the original absolute path so it resolves
    // against the sandbox root.
    expect(executedArgs).toEqual([{ path: `${WORK_DIR}/src/foo.ts` }]);

    // The consumer-facing tool-call has a workspace-relative path.
    const toolCall = parts.find(p => p.type === 'tool-call') as Extract<
      TextStreamPart<ToolSet>,
      { type: 'tool-call' }
    >;
    expect(toolCall.input).toEqual({ path: 'src/foo.ts' });

    // The consumer-facing tool-result is stripped too.
    const toolResult = parts.find(p => p.type === 'tool-result') as Extract<
      TextStreamPart<ToolSet>,
      { type: 'tool-result' }
    >;
    expect(toolResult.output).toBe('src/foo.ts\nsrc/bar.ts\n');
  });

  test('leaves paths untouched when there is no sessionWorkDir', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-result',
          toolCallId: 'b1',
          toolName: 'bash',
          result: `${WORK_DIR}/src/foo.ts\n`,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {} as ToolSet,
      toolSpecs: [],
      sandboxSession: undefined,
      sessionWorkDir: undefined,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    const toolResult = parts.find(p => p.type === 'tool-result') as Extract<
      TextStreamPart<ToolSet>,
      { type: 'tool-result' }
    >;
    expect(toolResult.output).toBe(`${WORK_DIR}/src/foo.ts\n`);
  });
});
