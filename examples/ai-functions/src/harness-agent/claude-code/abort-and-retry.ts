import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { readUIMessageStream } from 'ai';
import { createClaudeCode } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createClaudeCode({ thinking: { type: 'disabled' } }),
    model: 'claude-haiku-4-5',
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const timeoutSignal = AbortSignal.timeout(2 * 60 * 1000);
    const controller = new AbortController();

    console.log('--- turn 1: abort after 200 text characters ---');
    const first = await agent.stream({
      session,
      prompt:
        'Reply directly in chat with the numbers from 1 to 400 in words, one per line, and nothing else. Do not use tools or create files.',
      abortSignal: AbortSignal.any([controller.signal, timeoutSignal]),
    });

    let written = 0;
    let sawAbort = false;
    for await (const chunk of first.toUIMessageStream({
      onError: error => String(error),
    })) {
      console.log('[turn 1 chunk]', JSON.stringify(chunk));
      if (chunk.type === 'error') {
        throw new Error(chunk.errorText);
      }
      if (chunk.type === 'text-delta') {
        written += chunk.delta.length;
        if (written >= 200 && !controller.signal.aborted) {
          controller.abort();
        }
      }
      if (chunk.type === 'abort') {
        sawAbort = true;
      }
    }

    timeoutSignal.throwIfAborted();
    if (!controller.signal.aborted || !sawAbort) {
      throw new Error(
        `Turn 1 did not abort during text generation: ${written} text characters, abort requested: ${controller.signal.aborted}, abort received: ${sawAbort}.`,
      );
    }

    /*
     * Draining the aborted stream releases the host's active turn, but the
     * bridge may still be interrupting Claude Code. Reuse the same session
     * immediately, without a delay or restart, to expose stale bridge events.
     */
    const second = await agent.stream({
      session,
      prompt: 'Answer with the word pineapple only.',
      abortSignal: timeoutSignal,
    });
    console.log(`Turn 1 aborted after ${written} text characters.`);
    console.log('--- turn 2: expect pineapple on the same session ---');

    let answer = '';
    const stream = second.toUIMessageStream({
      onError: error => String(error),
    });
    for await (const message of readUIMessageStream({
      stream: stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            console.log('[turn 2 chunk]', JSON.stringify(chunk));
            controller.enqueue(chunk);
          },
        }),
      ),
      terminateOnError: true,
    })) {
      answer = message.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
    }

    timeoutSignal.throwIfAborted();
    console.log('Turn 2 answer:', JSON.stringify(answer));
    if (answer.trim().toLowerCase() !== 'pineapple') {
      throw new Error(
        `Turn 2 lost its answer or received stale text: ${JSON.stringify(answer)}`,
      );
    }
    console.log(
      'Turn 2 answered correctly; the bug did not reproduce this run.',
    );
  } finally {
    try {
      await session?.destroy();
    } finally {
      await sandboxSession.destroy();
    }
  }
});
