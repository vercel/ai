import assert from 'node:assert/strict';
import http from 'node:http';
import { createAlibaba } from '../../../../packages/alibaba/src/index';
import { streamText } from '../../../../packages/ai/src/generate-text/stream-text';
import { createDeepSeek } from '../../../../packages/deepseek/src/index';
import { createGroq } from '../../../../packages/groq/src/index';
import { createMoonshotAI } from '../../../../packages/moonshotai/src/index';
import { createOpenAICompatible } from '../../../../packages/openai-compatible/src/index';
import type { LanguageModelV2 } from '../../../../packages/provider/src/index';
import { createXai } from '../../../../packages/xai/src/index';

const expectedReasoningText = 'The user asks';
const expectedSequence = [
  'reasoning-start',
  'delta:The',
  'delta: user',
  'delta: asks',
  'reasoning-end',
];

type Observation = {
  name: string;
  sequence: string[];
  reasoningText: string | undefined;
  errors: string[];
};

let reasoningField: 'reasoning_content' | 'reasoning' = 'reasoning_content';

function chunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
) {
  return JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'm',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

const server = http.createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });

    for (const value of [
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
      response.write(`data: ${value}\n\n`);
    }

    response.end('data: [DONE]\n\n');
  });
});

async function observe(
  name: string,
  model: LanguageModelV2,
): Promise<Observation> {
  const result = streamText({ model, prompt: 'hi' });
  const sequence: string[] = [];
  const errors: string[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      sequence.push(`delta:${part.text}`);
    } else if (
      part.type === 'reasoning-start' ||
      part.type === 'reasoning-end'
    ) {
      sequence.push(part.type);
    } else if (part.type === 'error') {
      sequence.push('error');
      errors.push(String(part.error));
    }
  }

  const observation = {
    name,
    sequence,
    reasoningText: await result.reasoningText,
    errors,
  };

  console.log(
    `${name}\n  ${sequence.join(', ')}\n  reasoningText=${JSON.stringify(
      observation.reasoningText,
    )}${errors.length === 0 ? '' : `\n  errors=${JSON.stringify(errors)}`}`,
  );

  return observation;
}

function isExpected(observation: Observation) {
  return (
    observation.reasoningText === expectedReasoningText &&
    observation.errors.length === 0 &&
    JSON.stringify(observation.sequence) === JSON.stringify(expectedSequence)
  );
}

function isFragmentationBug(observation: Observation) {
  return (
    observation.reasoningText === expectedReasoningText &&
    observation.errors.length === 0 &&
    observation.sequence.filter(type => type === 'reasoning-start').length >
      1 &&
    observation.sequence.filter(type => type === 'reasoning-end').length > 1 &&
    observation.sequence.filter(type => type.startsWith('delta:')).join('') ===
      'delta:Thedelta: userdelta: asks'
  );
}

function isXaiDataLossBug(observation: Observation) {
  return (
    observation.reasoningText === 'The' &&
    observation.sequence.join(',') ===
      'reasoning-start,delta:The,reasoning-end,delta: user,error,delta: asks,error' &&
    observation.errors.length === 2 &&
    observation.errors.every(error =>
      error.includes('reasoning part reasoning-chatcmpl-1 not found'),
    )
  );
}

async function main() {
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
      'openai-compatible (control)',
      createOpenAICompatible({ name: 'gateway', baseURL, apiKey })('m'),
    );

    if (!isExpected(control)) {
      throw new Error(
        `HARNESS_FAILURE: openai-compatible control did not preserve one reasoning span: ${JSON.stringify(
          control,
        )}`,
      );
    }

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

    const reproduced: string[] = [];

    for (const observation of observations) {
      if (isExpected(observation)) {
        continue;
      }

      if (
        isFragmentationBug(observation) ||
        (observation.name === 'xai.chat' && isXaiDataLossBug(observation))
      ) {
        reproduced.push(observation.name);
        continue;
      }

      throw new Error(
        `HARNESS_FAILURE: ${observation.name} produced an unrelated result: ${JSON.stringify(
          observation,
        )}`,
      );
    }

    if (reproduced.length > 0) {
      throw new Error(
        `ISSUE_20546_REPRODUCED: empty tool_calls fragmented reasoning streams or lost reasoning text (${reproduced.join(
          ', ',
        )})`,
      );
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
