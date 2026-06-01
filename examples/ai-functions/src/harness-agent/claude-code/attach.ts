/*
 * Cross-process ATTACH for the Claude Code harness.
 *
 * Unlike `resume.ts` (which detaches — stopping the sandbox — and so resumes
 * in `rerun` mode), this example keeps the session alive: turn 1 runs, then
 * `session.getResumeHandle()` captures the live bridge coordinates *without*
 * tearing anything down. A fresh `HarnessAgent` (standing in for a different
 * server process) reattaches to the still-running bridge with those
 * coordinates and continues mid-conversation. `session.recoveryMode` reports
 * `'attach'`.
 */
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type { HarnessV1ResumeState } from '@ai-sdk/harness';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  // Turn 1: introduce the name, then capture coordinates WITHOUT detaching —
  // the bridge and sandbox stay alive.
  let sessionId: string;
  let resumeState: HarnessV1ResumeState;
  {
    const agent = new HarnessAgent({ harness: claudeCode, sandbox });
    const session = await agent.createSession();
    sessionId = session.sessionId;
    console.log('--- turn 1 ---');
    const result = await agent.stream({
      session,
      prompt: 'My name is Felix. Remember it.',
    });
    await printFullStream({ result });
    resumeState = await session.getResumeHandle();
    console.log('[handle] live coords:', JSON.stringify(resumeState));
    // Note: no detach()/close() — we intentionally leave the bridge running.
  }

  // Turn 2: brand-new agent instance attaches to the live bridge.
  {
    const agent = new HarnessAgent({ harness: claudeCode, sandbox });
    const session = await agent.createSession({
      sessionId,
      resumeFrom: resumeState,
    });
    console.log('--- turn 2 (recoveryMode:', session.recoveryMode, ') ---');
    if (session.recoveryMode !== 'attach') {
      throw new Error(
        `expected recoveryMode 'attach', got '${session.recoveryMode}'`,
      );
    }
    const result = await agent.stream({
      session,
      prompt: 'What is my name? Answer in one word.',
    });
    await printFullStream({ result });
    await session.close();
  }

  process.exit(0);
});
