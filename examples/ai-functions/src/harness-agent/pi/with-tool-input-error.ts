import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { createPi } from './_create';
import { run } from '../../lib/run';

run(async () => {
  let executions = 0;
  const weather = tool({
    description: 'Get the weather for a city.',
    inputSchema: z.object({ city: z.string() }).refine(async () => false),
    execute: () => {
      executions += 1;
      return { temperature: 18 };
    },
  });

  const agent = new HarnessAgent({
    harness: createPi(),
    tools: { weather },
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt:
        'Call the weather tool once with the city "Berlin". If it returns an error, report the error and do not call the tool again.',
    });

    const toolCallIds = new Set<string>();
    const toolErrorIds = new Set<string>();
    const toolResultIds = new Set<string>();

    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        throw new Error('Harness turn failed.');
      }

      if (part.type === 'tool-call' && part.toolName === 'weather') {
        if (
          part.invalid !== true ||
          typeof part.input !== 'object' ||
          part.input === null ||
          Array.isArray(part.input) ||
          !('city' in part.input) ||
          typeof part.input.city !== 'string'
        ) {
          throw new Error(
            'Expected a rejected weather call with a string city.',
          );
        }
        toolCallIds.add(part.toolCallId);
      }

      if (part.type === 'tool-error' && part.toolName === 'weather') {
        if (
          !(part.error instanceof Error) ||
          part.error.message !== 'Tool input validation failed.'
        ) {
          throw new Error('Expected a tool input validation error.');
        }
        toolErrorIds.add(part.toolCallId);
      }

      if (part.type === 'tool-result' && part.toolName === 'weather') {
        toolResultIds.add(part.toolCallId);
      }
    }

    if (executions !== 0) {
      throw new Error(`Weather tool executed ${executions} time(s).`);
    }
    if (toolCallIds.size === 0) {
      throw new Error('Weather tool was not called.');
    }
    for (const toolCallId of toolCallIds) {
      if (!toolErrorIds.has(toolCallId) || toolResultIds.has(toolCallId)) {
        throw new Error(`Weather tool call ${toolCallId} did not fail.`);
      }
    }

    console.log('All weather tool calls were rejected without execution.');
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
