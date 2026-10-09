import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, streamText, TypeValidationError } from 'ai';
import assert from 'node:assert/strict';

const nestedServerError = {
  type: 'error',
  error: {
    type: 'server_error',
    code: null,
    message: 'An error occurred while processing the request.',
    param: null,
  },
  sequence_number: 120,
};

function createSseResponse(events: unknown[]): Response {
  return new Response(
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

function createSuccessfulResponse(): Response {
  return createSseResponse([
    {
      type: 'response.created',
      response: {
        id: 'resp_issue_22409',
        created_at: 1,
        model: 'gpt-5',
        service_tier: null,
      },
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'message',
        id: 'msg_issue_22409',
      },
    },
    {
      type: 'response.output_text.delta',
      item_id: 'msg_issue_22409',
      output_index: 0,
      delta: 'retry succeeded',
    },
    {
      type: 'response.completed',
      response: {
        incomplete_details: null,
        usage: {
          input_tokens: 1,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 2,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 3,
        },
        service_tier: null,
      },
    },
  ]);
}

async function verifyCallerReceivesServerError() {
  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () => createSseResponse([nestedServerError]),
  });

  const model = openai.responses('gpt-5');

  try {
    await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
    assert.fail('Expected the early Responses stream error to reject');
  } catch (error) {
    assert.equal(
      TypeValidationError.isInstance(error),
      false,
      'Caller received AI_TypeValidationError for a null error.code',
    );
    assert.equal(
      APICallError.isInstance(error),
      true,
      'Caller did not receive the OpenAI server error as an APICallError',
    );

    if (!APICallError.isInstance(error)) {
      throw error;
    }

    assert.equal(
      error.message,
      'An error occurred while processing the request.',
    );
    assert.equal(error.statusCode, 500);
    assert.equal(error.isRetryable, true);
  }
}

async function verifyEarlyServerErrorIsRetried() {
  let requestCount = 0;
  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () => {
      requestCount++;
      return requestCount === 1
        ? createSseResponse([nestedServerError])
        : createSuccessfulResponse();
    },
  });

  const result = streamText({
    model: openai.responses('gpt-5'),
    prompt: 'Hello',
    maxRetries: 1,
  });

  assert.equal(await result.text, 'retry succeeded');
  assert.equal(
    requestCount,
    2,
    'The null-code server error was not retried before output',
  );
}

async function main() {
  await verifyCallerReceivesServerError();
  await verifyEarlyServerErrorIsRetried();
  console.log(
    'Issue #22409 does not reproduce: null-code Responses errors remain server errors and are retried.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
