import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createClaudeCode } from './_create';
import { run } from '../../lib/run';

const claudeCode = createClaudeCode();

/*
 * Demonstrates that a tool call's input streams as it is generated, rather
 * than appearing all at once when the call completes.
 *
 * The model writes the whole `content` argument token by token, so a file of
 * any size takes a while to generate. `tool-input-start` announces the call
 * before any of it exists, each `tool-input-delta` carries the next fragment
 * of the raw JSON, and `tool-input-end` closes it just before the `tool-call`
 * that carries the same id and the finished input.
 *
 * Without streaming tool input, everything below the header prints in one go
 * at the end, and the run looks frozen until then.
 */
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
    const result = await agent.stream({
      session,
      prompt:
        'Create a file at `poem.md` containing a 40 line poem about the sea. ' +
        'Write the file in one step.',
    });

    let streamed = '';

    for await (const chunk of result.stream) {
      switch (chunk.type) {
        case 'tool-input-start': {
          console.log(`\ntool-input-start  ${chunk.toolName} (${chunk.id})`);
          streamed = '';
          break;
        }

        case 'tool-input-delta': {
          // The raw JSON of the arguments, in the order the model produced it.
          streamed += chunk.delta;
          process.stdout.write(`\r  streaming input… ${streamed.length} chars`);
          break;
        }

        case 'tool-input-end': {
          console.log(`\ntool-input-end    ${chunk.id}`);
          break;
        }

        case 'tool-call': {
          console.log(
            `tool-call         ${chunk.toolName} (${chunk.toolCallId})`,
          );
          console.log(
            `  streamed ${streamed.length} chars before the call arrived`,
          );
          break;
        }
      }
    }
  } finally {
    await session.destroy();
  }
});
