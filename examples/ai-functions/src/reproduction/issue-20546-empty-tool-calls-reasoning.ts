import { createAlibaba } from '@ai-sdk/alibaba';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { createXai } from '@ai-sdk/xai';
import { createServer } from 'node:http';
import { streamText } from 'ai';

const expectedReasoningText = 'The user asks';
const expectedReasoningEvents = [
  'reasoning-start',
  'reasoning-delta',
  'reasoning-delta',
  'reasoning-delta',
  'reasoning-end',
];

type Observation = {
  name: string;
  reasoningEvents: string[];
  reasoningText: string | undefined;
  errors: string[];
};

function createChunk({
  delta,
  finishReason = null,
}: {
  delta: Record<string, unknown>;
  finishReason?: string | null;
}) {
  return JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'm',
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  });
}

function hasExpectedOutcome(observation: Observation) {
  return (
    JSON.stringify(observation.reasoningEvents) ===
      JSON.stringify(expectedReasoningEvents) &&
    observation.reasoningText === expectedReasoningText &&
    observation.errors.length === 0
  );
}

async function observe({
  name,
  model,
}: {
  name: string;
  model: LanguageModelV3;
}): Promise<Observation> {
  const result = streamText({ model, prompt: 'hi' });
  const reasoningEvents: string[] = [];
  const errors: string[] = [];

  for await (const part of result.fullStream) {
    if (part.type.startsWith('reasoning-')) {
      reasoningEvents.push(part.type);
    } else if (part.type === 'error') {
      errors.push(String(part.error));
    }
  }

  return {
    name,
    reasoningEvents,
    reasoningText: await result.reasoningText,
    errors,
  };
}

async function main() {
  let reasoningField = 'reasoning_content';

  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });

      for (const data of [
        createChunk({
          delta: {
            role: 'assistant',
            content: '',
            [reasoningField]: 'The',
            tool_calls: [],
          },
        }),
        createChunk({
          delta: {
            content: '',
            [reasoningField]: ' user',
            tool_calls: [],
          },
        }),
        createChunk({
          delta: {
            content: '',
            [reasoningField]: ' asks',
            tool_calls: [],
          },
        }),
        createChunk({
          delta: { content: 'Hi', tool_calls: [] },
        }),
        createChunk({ delta: {}, finishReason: 'stop' }),
      ]) {
        response.write(`data: ${data}\n\n`);
      }

      response.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Local SSE server did not expose a TCP port.');
    }

    const baseURL = `http://127.0.0.1:${address.port}/v1`;
    const apiKey = 'test';

    const control = await observe({
      name: 'openai-compatible',
      model: createOpenAICompatible({
        name: 'gateway-control',
        baseURL,
        apiKey,
      })('m'),
    });

    if (!hasExpectedOutcome(control)) {
      throw new Error(
        `Control failed to preserve reasoning: ${JSON.stringify(control)}`,
      );
    }

    const observations: Observation[] = [
      await observe({
        name: 'deepseek',
        model: createDeepSeek({ baseURL, apiKey })('deepseek-reasoner'),
      }),
      await observe({
        name: 'moonshotai',
        model: createMoonshotAI({ baseURL, apiKey })('kimi-k2-thinking'),
      }),
      await observe({
        name: 'alibaba',
        model: createAlibaba({ baseURL, apiKey })('qwen3-max'),
      }),
      await observe({
        name: 'xai.chat',
        model: createXai({ baseURL, apiKey }).chat('grok-3-mini'),
      }),
    ];

    reasoningField = 'reasoning';
    observations.push(
      await observe({
        name: 'groq',
        model: createGroq({ baseURL, apiKey })('qwen/qwen3-32b'),
      }),
    );

    console.log(JSON.stringify({ control, observations }, null, 2));

    const brokenProviders = observations
      .filter(observation => !hasExpectedOutcome(observation))
      .map(observation => observation.name);

    if (brokenProviders.length > 0) {
      throw new Error(
        `ISSUE_20546_REPRODUCED: empty tool_calls broke reasoning continuity/data integrity for ${brokenProviders.join(', ')}`,
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
