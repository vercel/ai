import {
  tool,
  type Experimental_SandboxSession,
  type ToolResultOutput,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { TextStreamPart } from 'ai';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1PromptTurnOptions,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '../../v1';
import { runPrompt } from './run-prompt';

const reason = 'weather disabled';
const usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};
const finishReason = { unified: 'stop', raw: 'end_turn' } as const;
const finishEvents: HarnessV1StreamPart[] = [
  { type: 'text-start', id: 'answer' },
  { type: 'text-delta', id: 'answer', delta: 'Weather is disabled.' },
  { type: 'text-end', id: 'answer' },
  { type: 'finish-step', finishReason, usage },
  { type: 'finish', finishReason, totalUsage: usage },
];

describe('runPrompt denied host tool output', () => {
  for (const source of ['configured', 'resume', 'filtered']) {
    for (const echo of [false, true]) {
      for (const converter of ['map', 'validate', 'none'] as const) {
        test.each(source === 'filtered' ? [reason] : [reason, undefined])(
          `${source}, echo=${echo}, converter=${converter}, reason=%s`,
          async configuredReason => {
            const resume = source === 'resume';
            const reason =
              source === 'filtered'
                ? "Tool 'weather' is inactive due to the HarnessAgent tool filtering policy."
                : configuredReason;
            const denial = { type: 'execution-denied' as const, reason };
            const submissions: Parameters<
              HarnessV1PromptControl['submitToolResult']
            >[0][] = [];
            const execute = vi.fn(async () => ({
              content: [{ text: 'Sunny' }],
            }));
            const toModelOutput = vi.fn(
              ({
                output,
              }: {
                output: { content: { text: string }[] };
              }): ToolResultOutput => {
                if (converter === 'validate') {
                  const parsed = z
                    .object({
                      content: z.array(z.object({ text: z.string() })),
                    })
                    .safeParse(output);
                  return {
                    type: 'text',
                    value: parsed.success
                      ? 'Valid weather'
                      : 'Invalid weather result',
                  };
                }
                return {
                  type: 'text',
                  value: output.content.map(part => part.text).join('\n'),
                };
              },
            );
            const start = async (
              options: Pick<HarnessV1PromptTurnOptions, 'emit'>,
            ) => {
              let resolveDone!: () => void;
              const done = new Promise<void>(resolve => {
                resolveDone = resolve;
              });
              if (!resume) {
                queueMicrotask(() => {
                  options.emit({
                    type: 'tool-call',
                    toolCallId: 'c1',
                    toolName: 'weather',
                    input: '{"city":"SF"}',
                  });
                });
              }
              return {
                done,
                async submitToolResult(
                  submission: Parameters<
                    HarnessV1PromptControl['submitToolResult']
                  >[0],
                ) {
                  submissions.push(submission);
                  if (echo) {
                    options.emit({
                      type: 'tool-result',
                      toolCallId: submission.toolCallId,
                      toolName: 'weather',
                      result: submission.output as typeof denial,
                    });
                  }
                  if (resume) {
                    options.emit({ type: 'finish-step', finishReason, usage });
                  }
                  for (const event of finishEvents) options.emit(event);
                  resolveDone();
                },
              };
            };
            const token = {
              type: 'resume-session',
              harnessId: 'fake',
              specificationVersion: 'harness-v1',
              data: {},
            } as const;
            const session: HarnessV1Session = {
              sessionId: 'denied-tool',
              isResume: resume,
              doPromptTurn: start,
              doContinueTurn: start,
              doCompact: async () => {},
              doDetach: async () => token,
              doStop: async () => token,
              doDestroy: async () => {},
              doSuspendTurn: async () => ({
                ...token,
                type: 'continue-turn',
              }),
            };
            const harness: HarnessV1 = {
              specificationVersion: 'harness-v1',
              harnessId: 'fake',
              builtinTools: {},
              doStart: async () => session,
            };
            const { result, done } = runPrompt({
              harness,
              session,
              mode: resume ? 'continue' : 'prompt',
              prompt: 'Get the weather',
              instructions: undefined,
              tools: {
                weather: tool({
                  inputSchema: z.object({ city: z.string() }),
                  execute,
                  toModelOutput:
                    converter === 'none' ? undefined : toModelOutput,
                }),
              },
              activeTools: source === 'filtered' ? {} : undefined,
              toolSpecs: [],
              sandboxSession: {} as Experimental_SandboxSession,
              sessionWorkDir: '/sandbox',
              runtimeContext: {},
              abortSignal: undefined,
              toolApproval: {
                weather: resume ? 'user-approval' : { type: 'denied', reason },
              },
              ...(resume
                ? {
                    pendingToolApprovals: [
                      {
                        approvalId: 'approval-1',
                        toolCallId: 'c1',
                        toolName: 'weather',
                        input: '{"city":"SF"}',
                        kind: 'custom' as const,
                      },
                    ],
                    toolApprovalContinuations: [
                      {
                        type: 'tool-approval-response' as const,
                        approvalId: 'approval-1',
                        approved: false,
                        reason,
                      },
                    ],
                  }
                : {}),
            });
            const parts: TextStreamPart<ToolSet>[] = [];
            const drain = (async () => {
              for await (const part of result.fullStream) parts.push(part);
            })();
            let timer: ReturnType<typeof setTimeout> | undefined;
            const completed = await Promise.race([
              Promise.all([result.responseMessages, done, drain]).then(
                ([messages]) => ({ messages }),
              ),
              new Promise<undefined>(resolve => {
                timer = setTimeout(() => resolve(undefined), 1000);
              }),
            ]);
            clearTimeout(timer);
            expect(submissions).toEqual([
              {
                toolCallId: 'c1',
                output: denial,
                toolResult: {
                  type: 'tool-result',
                  toolCallId: 'c1',
                  toolName: 'weather',
                  output: denial,
                },
              },
            ]);
            expect(execute).not.toHaveBeenCalled();
            expect(parts).toContainEqual(
              expect.objectContaining({
                type: 'text-delta',
                text: 'Weather is disabled.',
              }),
            );
            expect(completed).toBeDefined();
            expect(parts.some(part => part.type === 'finish')).toBe(true);
            expect(parts.some(part => part.type === 'error')).toBe(false);
            const { messages } = completed!;
            const outputs = messages.flatMap(message =>
              message.role === 'tool'
                ? message.content
                    .filter(part => part.type === 'tool-result')
                    .map(part => part.output)
                : [],
            );
            if (resume) {
              expect(parts).toContainEqual(
                expect.objectContaining({
                  type: 'tool-approval-response',
                  approved: false,
                  ...(reason != null ? { reason } : {}),
                }),
              );
            }
            expect(outputs).toEqual(
              resume
                ? []
                : [
                    ...(source === 'configured' ? [denial] : []),
                    ...(echo ? [denial] : []),
                  ],
            );
            expect(toModelOutput).not.toHaveBeenCalled();
          },
        );
      }
    }
  }
});
