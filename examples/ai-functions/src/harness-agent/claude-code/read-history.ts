import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createClaudeCode } from './_create';
import { run } from '../../lib/run';

const claudeCode = createClaudeCode();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: claudeCode,
    sandbox,
  });

  const session = await agent.createSession();
  try {
    await agent.generate({
      session,
      prompt: 'Create a file named NOTES.md containing one haiku about tests.',
    });

    if (!session.supportsHistory) {
      console.log('This adapter does not support history reads.');
      return;
    }

    // The runtime's own persisted history — including anything that happened
    // outside this process (e.g. `claude --resume` in a terminal).
    const { messages, cursor } = await session.readHistory();
    for (const message of messages) {
      for (const part of message.parts) {
        switch (part.type) {
          case 'text':
            console.log(`${message.role}: ${part.text}`);
            break;
          case 'reasoning':
            console.log(`${message.role} (reasoning): ${part.text}`);
            break;
          case 'tool-call':
            console.log(
              `${message.role} -> ${part.toolName}(${JSON.stringify(part.input)})`,
            );
            break;
          case 'tool-result':
            console.log(
              `${part.toolName ?? 'tool'} => ${JSON.stringify(part.output)?.slice(0, 120)}`,
            );
            break;
        }
      }
    }

    // Incremental read: only what was recorded after the first read.
    const delta = await agent.generate({ session, prompt: 'Say thanks.' });
    console.log('second turn:', delta.text);
    const since = await session.readHistory({ since: cursor });
    console.log(
      'messages recorded since the first read:',
      since.messages.length,
    );
  } finally {
    await session.destroy();
  }
});
