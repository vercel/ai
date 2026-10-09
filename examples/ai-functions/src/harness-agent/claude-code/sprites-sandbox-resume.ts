/*
 * Reattach smoke test for the Claude Code harness on a Sprite.
 *
 * Turn 1 runs and the harness session is stopped. A fresh `HarnessAgent` then
 * resumes the conversation on the session that
 * `resumeSpritesNetworkSandboxSession()` reattaches to the same Sprite, where
 * the bridge is reached through the same URL as before. If the reattachment
 * works the second turn remembers the name from turn 1.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createClaudeCode } from './_create';
import {
  createSpritesNetworkSandboxSession,
  resumeSpritesNetworkSandboxSession,
} from '@ai-sdk/sandbox-sprites';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const claudeCode = createClaudeCode();

run(async () => {
  process.exitCode = 1;

  const sandboxSession = await createSpritesNetworkSandboxSession({
    sandboxId: `harness-${crypto.randomUUID()}`,
    template: await new HarnessAgent({
      harness: claudeCode,
    }).getSandboxTemplate(),
  });
  let activeSandboxSession = sandboxSession;
  try {
    const port = sandboxSession.ports[0];
    const endpoint = await sandboxSession.getPortEndpoint({
      port,
      protocol: 'ws',
    });

    // Turn 1: introduce the name.
    let sessionId: string;
    let resumeState: HarnessAgentResumeSessionState;
    {
      const agent = new HarnessAgent({ harness: claudeCode });
      const session = await agent.createSession({
        sandboxSession: activeSandboxSession,
      });
      sessionId = session.sessionId;
      console.log('--- turn 1 ---');
      const result = await agent.stream({
        session,
        prompt: 'My name is Felix. Remember it.',
      });
      await printFullStream({ result });
      resumeState = await session.stop();
      console.log('[stopped] harness session');
    }

    // Turn 2: a new agent resumes on the reattached Sprite.
    {
      activeSandboxSession = await resumeSpritesNetworkSandboxSession({
        sandboxId: sandboxSession.id,
      });
      const reattachedEndpoint = await activeSandboxSession.getPortEndpoint({
        port,
        protocol: 'ws',
      });
      if (reattachedEndpoint.url !== endpoint.url) {
        throw new Error('the URL changed after reattaching to the Sprite');
      }
      const agent = new HarnessAgent({ harness: claudeCode });
      const session = await agent.createSession({
        sandboxSession: activeSandboxSession,
        sessionId,
        resumeFrom: resumeState,
      });
      console.log('--- turn 2 (resumed) ---');
      const result = await agent.stream({
        session,
        prompt: 'What is my name? Answer in one word.',
      });
      let secondTurnText = '';
      await printFullStream({
        result,
        onText: text => {
          secondTurnText += text.text;
        },
      });
      await session.destroy();
      if (!secondTurnText.includes('Felix')) {
        throw new Error(
          'Second turn did not retain context from previous turn',
        );
      }
    }

    process.exitCode = 0;
  } finally {
    await activeSandboxSession.destroy();
  }
});
