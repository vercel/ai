import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const fixturePaths = [
  resolve(
    '../../packages/openai/src/responses/__fixtures__/openai-issue-11239.1.chunks.txt',
  ),
  resolve(
    '../../packages/openai/src/responses/__fixtures__/openai-issue-11239.2.chunks.txt',
  ),
];

function toChunkFixture(responseBody: string) {
  return responseBody
    .split('\n')
    .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map(line => line.slice('data: '.length))
    .join('\n');
}

async function main() {
  const responseBodies: Array<Promise<string>> = [];
  const requestBodies: string[] = [];

  const openai = createOpenAI({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(init.body);
      }

      const response = await fetch(input, init);
      responseBodies.push(response.clone().text());
      return response;
    },
  });

  const result = streamText({
    model: openai.responses('gpt-5.2'),
    prompt:
      'Call lookupCode exactly once. After it returns, reply with only the returned code.',
    tools: {
      lookupCode: tool({
        description: 'Returns the code requested by the user.',
        inputSchema: z.object({}),
        execute: async () => 'blue-42',
      }),
    },
    stopWhen: stepCountIs(2),
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        store: false,
      },
    },
  });

  try {
    await result.consumeStream();
    const [text, steps] = await Promise.all([result.text, result.steps]);
    const bodies = await Promise.all(responseBodies);

    if (bodies.length !== 2) {
      throw new Error(
        `Expected two OpenAI responses for the tool round trip, received ${bodies.length}.`,
      );
    }

    for (let index = 0; index < bodies.length; index++) {
      const fixturePath = fixturePaths[index];
      await mkdir(dirname(fixturePath), { recursive: true });
      await writeFile(fixturePath, toChunkFixture(bodies[index]));
    }

    const firstRequest = JSON.parse(requestBodies[0]) as {
      include?: string[];
    };
    const secondRequest = JSON.parse(requestBodies[1]) as {
      input?: Array<{ encrypted_content?: string; type?: string }>;
    };
    const encryptedReasoningWasRequested = firstRequest.include?.includes(
      'reasoning.encrypted_content',
    );
    const encryptedReasoningWasReplayed = secondRequest.input?.some(
      item =>
        item.type === 'reasoning' && typeof item.encrypted_content === 'string',
    );

    if (steps.length !== 2 || !text.includes('blue-42')) {
      throw new Error(
        `GPT-5.2 did not complete the expected two-step tool round trip: steps=${steps.length}, text=${JSON.stringify(text)}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          model: 'gpt-5.2',
          store: false,
          steps: steps.length,
          text,
          encryptedReasoningWasRequested,
          encryptedReasoningWasReplayed,
          fixturePaths: fixturePaths.map(path =>
            path.replace(`${resolve('../..')}/`, ''),
          ),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('The encrypted content for item') &&
      message.includes('could not be verified')
    ) {
      console.error(`ISSUE_11239_REPRODUCED: ${message}`);
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
