import {
  HarnessAgent,
  HarnessCapabilityUnsupportedError,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP({
      permissionModeMapping: {
        'allow-reads': {
          type: 'session-mode',
          modeId: 'obsolete-read-only',
        },
        'allow-edits': {
          type: 'session-mode',
          modeId: 'agent-full-access',
        },
        'allow-all': {
          type: 'session-mode',
          modeId: 'agent-full-access',
        },
      },
    }),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    permissionMode: 'allow-reads',
  });
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Reply with one short sentence.',
    });
    let validationError: unknown;
    try {
      await result.text;
    } catch (error) {
      validationError = error;
    }
    if (!HarnessCapabilityUnsupportedError.isInstance(validationError)) {
      throw new Error(
        'Expected the obsolete restrictive permission mapping to fail before execution.',
      );
    }
    console.log(validationError.message);
  } finally {
    await session.destroy();
  }
});
