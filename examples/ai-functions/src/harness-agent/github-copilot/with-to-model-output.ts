import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import {
  assertHarnessToolModelOutputResult,
  createHarnessToolModelOutputFixture,
  harnessToolModelOutputPrompt,
} from '../../lib/harness-tool-model-output';
import { run } from '../../lib/run';
import { createGitHubCopilot } from './_create';

run(async () => {
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await new HarnessAgent({
      harness: createGitHubCopilot(),
    }).getSandboxTemplate(),
  });

  try {
    for (const mode of ['generate', 'stream'] as const) {
      const fixture = await createHarnessToolModelOutputFixture();
      let executionCount = 0;
      let conversionCount = 0;

      const inspectImage = tool({
        description: 'Inspect an image. Returns a marker and a colored image.',
        inputSchema: z.object({}),
        execute: async () => {
          executionCount++;
          return { status: 'ready' };
        },
        toModelOutput: async () => {
          conversionCount++;
          return {
            type: 'content',
            value: [
              { type: 'text', text: fixture.textMarker },
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: fixture.image },
              },
            ],
          };
        },
      });

      const agent = new HarnessAgent({
        harness: createGitHubCopilot(),
        tools: { inspectImage },
      });

      let session: HarnessAgentSession | undefined;
      try {
        session = await agent.createSession({ sandboxSession });
        const options = { session, prompt: harnessToolModelOutputPrompt };
        const result =
          mode === 'generate'
            ? await agent.generate(options)
            : await agent.stream(options);

        const text = await result.text;
        console.log(`[${mode}]`, text);
        assertHarnessToolModelOutputResult({
          fixture,
          text,
          toolResults: await result.toolResults,
          responseMessages: await result.responseMessages,
          executionCount,
          conversionCount,
        });
      } finally {
        await session?.destroy();
      }
    }
  } finally {
    await sandboxSession.destroy();
  }
});
