import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import assert from 'node:assert/strict';

const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

const item = {
  id: 'fc_1',
  type: 'function_call',
  name: 'get_weather',
  call_id: 'c1',
  arguments: '{"city":"BJ"}',
  status: 'completed',
} as const;

function createStream(withOutputIndex: boolean) {
  const outputIndex = withOutputIndex ? { output_index: 0 } : {};

  return (
    event({
      type: 'response.created',
      response: {
        id: 'r',
        object: 'response',
        created_at: 1,
        model: 'm',
        status: 'in_progress',
        output: [],
      },
    }) +
    event({
      type: 'response.output_item.added',
      ...outputIndex,
      item: { ...item, arguments: '', status: 'in_progress' },
    }) +
    event({
      type: 'response.function_call_arguments.delta',
      item_id: 'fc_1',
      ...outputIndex,
      delta: '{"city":"BJ"}',
    }) +
    event({
      type: 'response.function_call_arguments.done',
      item_id: 'fc_1',
      ...outputIndex,
      arguments: '{"city":"BJ"}',
    }) +
    event({
      type: 'response.output_item.done',
      ...outputIndex,
      item,
    }) +
    event({
      type: 'response.completed',
      response: {
        id: 'r',
        object: 'response',
        created_at: 1,
        model: 'm',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 1, output_tokens: 2 },
      },
    })
  );
}

async function collectParts(withOutputIndex: boolean) {
  const provider = createOpenAI({
    apiKey: 'x',
    baseURL: 'https://example.invalid/v1',
    fetch: async () =>
      new Response(createStream(withOutputIndex), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const { stream } = await provider.responses('gpt-5.1').doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  });

  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }
  return parts;
}

async function main() {
  const indexedParts = await collectParts(true);
  const omittedParts = await collectParts(false);

  const indexedFinish = indexedParts.at(-1);
  const omittedFinish = omittedParts.at(-1);
  const omittedErrors = omittedParts.filter(part => part.type === 'error');

  console.log(
    'output_index present:',
    indexedParts.map(part => part.type).join(' '),
  );
  console.log(
    'output_index omitted:',
    omittedParts.map(part => part.type).join(' '),
  );
  console.log(
    'omitted finish reason:',
    omittedFinish?.type === 'finish'
      ? omittedFinish.finishReason.unified
      : omittedFinish?.type,
  );
  console.log('omitted error count:', omittedErrors.length);

  assert.ok(
    indexedParts.some(part => part.type === 'tool-call'),
    'Control stream with output_index must emit a tool call.',
  );
  assert.equal(
    indexedFinish?.type === 'finish'
      ? indexedFinish.finishReason.unified
      : undefined,
    'tool-calls',
    'Control stream with output_index must finish with tool-calls.',
  );

  assert.ok(
    omittedErrors.length > 0,
    'Schema-rejected events must produce an error signal instead of disappearing.',
  );
  assert.equal(
    omittedFinish?.type === 'finish'
      ? omittedFinish.finishReason.unified
      : undefined,
    'error',
    'A stream with schema-rejected tool-call events must not finish as stop.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
