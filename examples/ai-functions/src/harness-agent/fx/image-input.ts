import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import fs from 'node:fs';
import { createFx } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createFx(),
    // libfx incorrectly withholds images from the default Grok model because its catalog entry lacks the file-input tag.
    model: 'anthropic/claude-haiku-4.5',
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
    const result = await agent.generate({
      session,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'In one sentence, what animal is in this image?',
            },
            {
              type: 'file',
              mediaType: 'image/png',
              data: fs.readFileSync('./data/comic-cat.png'),
            },
          ],
        },
      ],
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
