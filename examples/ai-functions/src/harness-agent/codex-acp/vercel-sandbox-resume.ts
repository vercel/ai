import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPResumeHandoffState,
  removeACPHandoffState,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from './_create';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/vercel-sandbox-resume.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-cold-resume.json',
  });
  if (
    process.env.AI_GATEWAY_API_KEY == null &&
    process.env.VERCEL_OIDC_TOKEN == null
  ) {
    throw new Error(
      'This cold-resume example requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN in each phase.',
    );
  }

  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createACPHandoffSandbox(),
  });

  if (phase === 'start') {
    const session = await agent.createSession();
    const result = await agent.generate({
      session,
      prompt:
        'Remember that the cross-process codename is COLD-ORBIT. Reply with exactly remembered.',
    });
    if (!result.text.toLowerCase().includes('remembered')) {
      throw new Error(`Unexpected first ACP response: ${result.text}`);
    }
    const state = await session.stop();
    const serializedState = JSON.stringify(state);
    for (const secret of [
      process.env.CODEX_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.AI_GATEWAY_API_KEY,
      process.env.VERCEL_OIDC_TOKEN,
    ]) {
      if (
        secret != null &&
        secret.length > 0 &&
        serializedState.includes(secret)
      ) {
        throw new Error(
          'ACP cold-resume state contains a resolved credential.',
        );
      }
    }
    if (
      serializedState.includes('COLD-ORBIT') ||
      serializedState.includes('Remember that the cross-process codename')
    ) {
      throw new Error('ACP cold-resume state contains the previous prompt.');
    }
    await writeACPHandoffState({
      statePath,
      sessionId: session.sessionId,
      state,
    });
    console.log(`Saved stopped ACP session state to ${statePath}.`);
    console.log(
      'Run the resume phase with the current Gateway environment; credentials were not persisted.',
    );
    process.exit(0);
  }

  const saved = await readACPResumeHandoffState({ statePath });
  const session = await agent.createSession({
    sessionId: saved.sessionId,
    resumeFrom: saved.state,
  });
  try {
    const result = await agent.generate({
      session,
      prompt:
        'What is the cross-process codename? Reply with only the codename.',
    });
    console.log(result.text);
    if (!result.text.toUpperCase().includes('COLD-ORBIT')) {
      throw new Error(
        `The resumed ACP session forgot its state: ${result.text}`,
      );
    }
  } finally {
    await session.destroy();
  }
  await removeACPHandoffState({ statePath });
  console.log(
    'Verified cold ACP restoration in a replacement Vercel Sandbox process with freshly resolved Gateway credentials.',
  );
  process.exit(0);
});
