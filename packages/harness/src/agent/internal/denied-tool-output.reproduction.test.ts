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
  HarnessV1PromptTurnOptions,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '../../v1';
import { runPrompt } from './run-prompt';

const reason = 'weather disabled';
const denial = { type: 'execution-denied', reason };
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

describe('issue 24057: denied host tool output', () => {
  for (const resume of [false, true]) {
    for (const echo of [false, true]) {
      for (const converter of ['map', 'validate'] as const) {
        test(`resume=${resume}, echo=${echo}, converter=${converter}`, async () => {
          const submissions: unknown[] = [];
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
                  .object({ content: z.array(z.object({ text: z.string() })) })
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
              async submitToolResult(submission: {
                toolCallId: string;
                output: unknown;
              }) {
                submissions.push(submission.output);
                if (echo) {
                  options.emit({
                    type: 'tool-result',
                    toolCallId: submission.toolCallId,
                    toolName: 'weather',
                    result: submission.output as typeof denial,
                  });
                }
                // The resumed model step belongs to the previous slice.
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
            harnessId: 'reproduction',
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
            harnessId: 'reproduction',
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
                toModelOutput,
              }),
            },
            toolSpecs: [],
            sandboxSession: {} as Experimental_SandboxSession,
            sessionWorkDir: '/sandbox',
            runtimeContext: {},
            abortSignal: undefined,
            toolApproval: { weather: { type: 'denied', reason } },
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
          await done;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const complete = await Promise.race([
            drain.then(() => true),
            new Promise<false>(resolve => {
              timer = setTimeout(() => resolve(false), 1000);
            }),
          ]);
          clearTimeout(timer);
          expect(submissions).toEqual([denial]);
          expect(execute).not.toHaveBeenCalled();
          expect(parts).toContainEqual(
            expect.objectContaining({
              type: 'text-delta',
              text: 'Weather is disabled.',
            }),
          );
          expect(
            complete &&
              parts.some(part => part.type === 'finish') &&
              !parts.some(part => part.type === 'error'),
            'DENIED_TOOL_TURN_INCOMPLETE: answer streamed but denied host tool prevented clean completion',
          ).toBe(true);
          const messages = await result.responseMessages;
          const outputs = messages.flatMap(message =>
            message.role === 'tool'
              ? message.content
                  .filter(part => part.type === 'tool-result')
                  .map(part => part.output)
              : [],
          );
          if (resume) {
            // Continuations emit approval responses, but discard the prior
            // slice's step instead of duplicating it in responseMessages.
            expect(parts).toContainEqual(
              expect.objectContaining({
                type: 'tool-approval-response',
                approved: false,
                reason,
              }),
            );
          } else {
            expect(outputs.length).toBeGreaterThan(0);
          }
          expect(
            outputs.every(
              output =>
                output.type === 'execution-denied' && output.reason === reason,
            ),
            'DENIED_TOOL_RESPONSE_CORRUPTED: response must preserve execution-denied rather than convert it as a weather result',
          ).toBe(true);
          expect(toModelOutput).not.toHaveBeenCalled();
        });
      }
    }
  }
});
