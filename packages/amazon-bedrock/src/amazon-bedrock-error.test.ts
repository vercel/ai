import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { amazonBedrockFailedResponseHandler } from './amazon-bedrock-error';

function makeResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 400,
    statusText: 'Bad Request',
    headers: { 'content-type': 'application/json' },
  });
}

async function getErrorMessage(body: object) {
  const { value } = await amazonBedrockFailedResponseHandler({
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test/invoke',
    requestBodyValues: {},
    response: makeResponse(body),
  });

  expect(value).toBeInstanceOf(APICallError);
  return value.message;
}

describe('amazonBedrockFailedResponseHandler', () => {
  it('preserves the provider message when the error type is omitted', async () => {
    await expect(getErrorMessage({ message: 'boom' })).resolves.toBe('boom');
  });

  it('prefixes the provider message when the error type is present', async () => {
    await expect(
      getErrorMessage({ type: 'ValidationException', message: 'boom' }),
    ).resolves.toBe('ValidationException: boom');
  });
});

describe('amazonBedrockFailedResponseHandler failureReason', () => {
  const call = async (body: object) =>
    (
      await amazonBedrockFailedResponseHandler({
        url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/test/converse',
        requestBodyValues: {},
        response: makeResponse(body),
      })
    ).value;

  it.each([
    'Input is too long for requested model.',
    'prompt is too long: 215000 tokens > 200000 maximum',
  ])('flags context window errors: %s', async message => {
    const value = await call({ type: 'ValidationException', message });

    expect(value.failureReason).toBe('context-length-exceeded');
  });

  it('does not flag other validation errors', async () => {
    const value = await call({
      type: 'ValidationException',
      message: 'The provided model identifier is invalid.',
    });

    expect(value.failureReason).toBeUndefined();
  });
});
