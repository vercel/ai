import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { run } from '../../lib/run';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  let sessionId: string;
  let resumeState: HarnessAgentResumeSessionState;
  {
    const agent = new HarnessAgent({
      harness: createCodexACP(),
      sandbox,
    });
    const session = await agent.createSession();
    sessionId = session.sessionId;
    const result = await agent.generate({
      session,
      prompt:
        'Remember that the cold-resume codename is COPPER-LEAF. Reply with exactly remembered.',
    });
    if (!result.text.toLowerCase().includes('remembered')) {
      throw new Error(`Unexpected first ACP response: ${result.text}`);
    }
    resumeState = await session.stop();
  }

  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox,
  });
  const session = await agent.createSession({
    sessionId,
    resumeFrom: resumeState,
  });
  try {
    const result = await agent.generate({
      session,
      prompt: 'What is the cold-resume codename? Reply with only the codename.',
    });
    console.log(result.text);
    if (!result.text.toUpperCase().includes('COPPER-LEAF')) {
      throw new Error(
        `The resumed ACP session forgot its state: ${result.text}`,
      );
    }
  } finally {
    await session.destroy();
  }
});
