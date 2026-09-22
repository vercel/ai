import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createGitHubCopilot } from './_create';

run(async () => {
  const agent = new HarnessAgent({
    harness: createGitHubCopilot(),
    permissionMode: 'allow-all',
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Start an asynchronous Bash command that prints READY after two seconds. Use read_bash until you see READY, then stop it if it is still running.',
    });
    await printFullStream({ result });
    const toolNames = new Set(
      (await result.toolCalls).map(toolCall => toolCall.toolName),
    );
    if (!toolNames.has('bash') || !toolNames.has('read_bash')) {
      throw new Error('Expected asynchronous bash and read_bash calls.');
    }
  } finally {
    await session.destroy();
  }
});
