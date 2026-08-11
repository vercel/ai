import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  const session = await agent.createSession();
  const abortController = new AbortController();
  const fallback = setTimeout(() => {
    abortController.abort(new Error('ACP cancellation example timeout'));
  }, 15_000);
  fallback.unref?.();

  try {
    const result = await agent.stream({
      session,
      prompt:
        'Use the shell to run `sleep 120`, wait for it to complete, and then report that it completed.',
      abortSignal: abortController.signal,
    });
    let sawAbort = false;
    for await (const part of result.fullStream) {
      console.log(part.type);
      if (part.type === 'tool-call' && !abortController.signal.aborted) {
        abortController.abort(new Error('Cancel the active ACP tool call'));
      }
      if (part.type === 'abort') sawAbort = true;
    }
    await Promise.resolve(result.finishReason).catch(() => undefined);
    if (!sawAbort) {
      throw new Error('Expected the HarnessAgent stream to end with abort.');
    }
  } finally {
    clearTimeout(fallback);
    await session.destroy();
  }
});
