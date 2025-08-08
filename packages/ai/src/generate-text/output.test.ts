import { fail } from 'assert';
import { z } from 'zod/v4';
import { verifyNoObjectGeneratedError } from '../error/no-object-generated-error';
import { object } from './output';
import { FinishReason } from '../types';

const context = {
  response: {
    id: '123',
    timestamp: new Date(),
    modelId: '456',
  },
  usage: {
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  finishReason: 'length' as FinishReason,
};

describe('Output.object', () => {
  const output = object({ schema: z.object({ content: z.string() }) });

  it('should parse the output of the model', async () => {
    const result = await output.parseOutput(
      { text: `{ "content": "test" }` },
      context,
    );

    expect(result).toStrictEqual({ content: 'test' });
  });

  it('should throw NoObjectGeneratedError when parsing fails', async () => {
    try {
      await output.parseOutput({ text: '{ broken json' }, context);
      fail('must throw error');
    } catch (error) {
      verifyNoObjectGeneratedError(error, {
        message: 'No object generated: could not parse the response.',
        response: context.response,
        usage: context.usage,
        finishReason: context.finishReason,
      });
    }
  });

  it('should throw NoObjectGeneratedError when schema validation fails', async () => {
    try {
      await output.parseOutput({ text: `{ "content": 123 }` }, context);
      fail('must throw error');
    } catch (error) {
      verifyNoObjectGeneratedError(error, {
        message: 'No object generated: response did not match schema.',
        response: context.response,
        usage: context.usage,
        finishReason: context.finishReason,
      });
    }
  });
});
