import { createAlibaba } from '@ai-sdk/alibaba';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { type LanguageModel, streamText } from 'ai';

const expectedReasoningSequence = [
  'reasoning-start',
  'reasoning-delta:The',
  'reasoning-delta: user',
  'reasoning-delta: asks',
  'reasoning-end',
];

type Observation = {
  name: string;
  reasoningSequence: string[];
  reasoningText: string | undefined;
  errors: string[];
  text: string;
};

async function observe(
  name: string,
  model: LanguageModel,
): Promise<Observation> {
  const result = streamText({ model, prompt: 'hi' });
  const reasoningSequence: string[] = [];
  const errors: string[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      reasoningSequence.push(`reasoning-delta:${part.text}`);
    } else if (
      part.type === 'reasoning-start' ||
      part.type === 'reasoning-end'
    ) {
      reasoningSequence.push(part.type);
    } else if (part.type === 'error') {
      errors.push(String(part.error));
    }
  }

  return {
    name,
    reasoningSequence,
    reasoningText: await result.reasoningText,
    errors,
    text: await result.text,
  };
}

async function main() {
  let reasoningField = 'reasoning_content';
  let requestCount = 0;

  const chunk = (
    delta: Record<string, unknown>,
    finishReason: string | null = null,
  ) =>
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'm',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    });

  const server = createServer((request, response) => {
    request.on('data', () => {});
    request.on('end', () => {
      requestCount++;
      response.writeHead(200, { 'content-type': 'text/event-stream' });

      for (const data of [
        chunk({
          role: 'assistant',
          content: '',
          [reasoningField]: 'The',
          tool_calls: [],
        }),
        chunk({
          content: '',
          [reasoningField]: ' user',
          tool_calls: [],
        }),
        chunk({
          content: '',
          [reasoningField]: ' asks',
          tool_calls: [],
        }),
        chunk({ content: 'Hi', tool_calls: [] }),
        chunk({}, 'stop'),
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
    assert.ok(address != null && typeof address !== 'string');
    const baseURL = `http://127.0.0.1:${address.port}/v1`;
    const apiKey = 'test';

    const control = await observe(
      'openai-compatible',
      createOpenAICompatible({ name: 'gateway', baseURL, apiKey })('m'),
    );

    // The control verifies that the mock stream itself has the expected shape.
    assert.deepEqual(control.reasoningSequence, expectedReasoningSequence);
    assert.equal(control.reasoningText, 'The user asks');
    assert.deepEqual(control.errors, []);
    assert.equal(control.text, 'Hi');

    const observations = [
      await observe(
        'deepseek',
        createDeepSeek({ baseURL, apiKey })('deepseek-reasoner'),
      ),
      await observe(
        'moonshotai',
        createMoonshotAI({ baseURL, apiKey })('kimi-k2-thinking'),
      ),
      await observe('alibaba', createAlibaba({ baseURL, apiKey })('qwen3-max')),
      await observe(
        'xai.chat',
        createXai({ baseURL, apiKey }).chat('grok-3-mini'),
      ),
    ];

    reasoningField = 'reasoning';
    observations.push(
      await observe('groq', createGroq({ baseURL, apiKey })('qwen/qwen3-32b')),
    );

    assert.equal(requestCount, 6);

    for (const observation of observations) {
      // Confirm the request completed normally before testing reasoning behavior.
      assert.equal(observation.text, 'Hi', `${observation.name} text output`);
      console.log(JSON.stringify(observation));
    }

    const failures = observations.filter(
      observation =>
        observation.reasoningText !== 'The user asks' ||
        observation.errors.length !== 0 ||
        !isEqual(observation.reasoningSequence, expectedReasoningSequence),
    );

    if (failures.length > 0) {
      throw new Error(
        `ISSUE_20546_REPRODUCED: empty tool_calls fragmented reasoning streams for ${failures
          .map(({ name }) => name)
          .join(', ')}`,
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

function isEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
