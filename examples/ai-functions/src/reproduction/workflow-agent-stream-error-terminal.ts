import { WorkflowAgent } from '../../../../packages/workflow/dist/index.js';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

async function main() {
  const terminal = new Error('safe-terminal-marker');
  const streamedParts: unknown[] = [];

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        { type: 'error' as const, error: terminal },
        {
          type: 'finish' as const,
          finishReason: { unified: 'error' as const, raw: 'error' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 0,
              text: 0,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });

  const agent = new WorkflowAgent({ model });

  let rejection: unknown;
  let resolvedFinishReason: string | undefined;
  let resolvedResult: object | undefined;

  try {
    const result = await agent.stream({
      messages: [{ role: 'user', content: 'trigger the terminal error' }],
      writable: new WritableStream({
        write(part) {
          streamedParts.push(part);
        },
      }),
    });
    resolvedResult = result;
    resolvedFinishReason = result.finishReason;
  } catch (error) {
    rejection = error;
  }

  const surfacedAsTerminalValue =
    rejection === terminal ||
    (resolvedResult != null &&
      Object.values(resolvedResult).includes(terminal));

  if (surfacedAsTerminalValue) {
    return;
  }

  const forwardedOriginalError = streamedParts.some(
    part =>
      typeof part === 'object' &&
      part != null &&
      'type' in part &&
      part.type === 'error' &&
      'error' in part &&
      part.error === terminal,
  );

  console.error(
    `ISSUE_18824_REPRODUCED: WorkflowAgent.stream did not surface the supplied stream error as a terminal failure; finishReason=${String(resolvedFinishReason)}; forwardedOriginalError=${forwardedOriginalError}; rejectedWith=${String(rejection)}`,
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error('Unexpected reproduction harness failure:', error);
  process.exitCode = 2;
});
