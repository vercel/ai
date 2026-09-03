import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createFx } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createFx({
      mcpServers: {
        context7: {
          type: 'http',
          url: 'https://mcp.context7.com/mcp',
          headers: [],
        },
      },
    }),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession();
    const result = await agent.stream({
      session,
      prompt:
        'Use Context7 to find the current Next.js command for creating a new app. You must call a Context7 tool.',
    });
    await printFullStream({ result });
    const toolCalls = (await result.steps).flatMap(step => step.toolCalls);
    if (!toolCalls.some(toolCall => toolCall.dynamic)) {
      throw new Error('The harness did not call a Context7 tool.');
    }
    console.log('toolCalls:', JSON.stringify(toolCalls, null, 2));
    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } finally {
    await session?.destroy();
  }
});
