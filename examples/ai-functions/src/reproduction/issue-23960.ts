import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClaudeCodeEnv } from '../../../../packages/harness-claude-code/src/claude-code-auth';

const hostSchema = z.object({
  bounded: z.number().min(123).max(125),
  exclusive: z.number().gt(41).lt(43),
  text: z.string().min(7).max(9),
  items: z.array(z.string()).min(3).max(4),
  mode: z.string().default('host-default'),
});
const prompt =
  'Call the host tool once with a sample satisfying its schema. ' +
  'Omit mode so the host supplies its default. Respect all numeric, ' +
  'string-length and array-length limits in the schema. ' +
  'If the tool fails, report the error without retrying.';

async function main() {
  if (process.argv.includes('--direct')) {
    const env = resolveClaudeCodeEnv(undefined);
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      authToken: env.ANTHROPIC_AUTH_TOKEN,
      baseURL: env.ANTHROPIC_BASE_URL,
    });
    const response = await client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          name: 'host',
          description: 'Submit a sample meeting the declared schema.',
          input_schema: {
            ...z.toJSONSchema(hostSchema, { io: 'input' }),
            type: 'object',
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'host' },
    });
    await writeFile(
      new URL(
        '../../../../packages/harness-claude-code/src/bridge/__fixtures__/issue-23960-direct.json',
        import.meta.url,
      ),
      `${JSON.stringify(response, null, 2)}\n`,
    );
    const call = response.content.find(part => part.type === 'tool_use');
    if (!call) throw new Error('Direct provider did not call host');
    console.log('Direct provider input:', call.input);
    hostSchema.parse(call.input);
    console.log('Direct provider input accepted by host.');
    return;
  }
  let executions = 0;
  const agent = new HarnessAgent({
    harness: createClaudeCode(),
    model: 'claude-sonnet-5-5',
    tools: {
      host: tool({
        description: 'Submit a sample meeting the declared schema.',
        inputSchema: hostSchema,
        execute: async input => {
          executions++;
          console.log('Host accepted:', JSON.stringify(input));
          return { accepted: true };
        },
      }),
    },
  });
  const sandbox = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 120_000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession: sandbox });
    const result = await agent.stream({
      session,
      prompt,
    });
    let rejected = false;
    const events: unknown[] = [];
    for await (const part of result.fullStream) {
      if (
        (part.type === 'tool-call' ||
          part.type === 'tool-error' ||
          part.type === 'tool-result') &&
        part.toolName === 'host'
      ) {
        events.push(part);
        console.log('Observed:', JSON.stringify(part));
      }
      if (part.type === 'error') {
        throw new Error('Harness failed', { cause: part.error });
      }
      if (part.type === 'tool-error' && part.toolName === 'host') {
        if (
          !(part.error instanceof Error) ||
          part.error.message !== 'Tool input validation failed.'
        ) {
          throw new Error('Unexpected host tool error', { cause: part.error });
        }
        console.error('Host rejection:', part.error);
        rejected = true;
      }
    }
    await writeFile(
      new URL(
        '../../../../packages/harness-claude-code/src/bridge/__fixtures__/issue-23960-host-tools.json',
        import.meta.url,
      ),
      `${JSON.stringify(events, null, 2)}\n`,
    );
    if (rejected) {
      throw new Error('ISSUE-23960: model tool input rejected by host');
    }
    if (executions === 0) {
      throw new Error('Inconclusive: model did not execute the host tool');
    }
    console.log('Host accepted the model input.');
  } finally {
    try {
      await session?.destroy();
    } finally {
      await sandbox.destroy();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
