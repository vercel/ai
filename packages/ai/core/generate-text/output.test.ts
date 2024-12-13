import { fail } from 'assert';
import { z } from 'zod';
import { NoObjectGeneratedError } from '../../errors';
import { object } from './output';

const context = {
  response: {
    id: '123',
    timestamp: new Date(),
    modelId: '456',
  },
  usage: {
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
  },
};

describe('Output.object', () => {
  const output = object({ schema: z.object({ content: z.string() }) });

  function verifyNoObjectGeneratedError(
    error: unknown,
    { message }: { message: string },
  ) {
    expect(NoObjectGeneratedError.isInstance(error)).toBeTruthy();
    const noObjectGeneratedError = error as NoObjectGeneratedError;
    expect(noObjectGeneratedError.message).toStrictEqual(message);
    expect(noObjectGeneratedError.response).toStrictEqual(context.response);
    expect(noObjectGeneratedError.usage).toStrictEqual(context.usage);
  }

  it('should parse the output of the model', () => {
    const result = output.parseOutput(
      { text: `{ "content": "test" }` },
      context,
    );

    expect(result).toStrictEqual({ content: 'test' });
  });

  it('should throw NoObjectGeneratedError when parsing fails', async () => {
    try {
      output.parseOutput({ text: '{ broken json' }, context);
      fail('must throw error');
    } catch (error) {
      verifyNoObjectGeneratedError(error, {
        message: 'No object generated: could not parse the response.',
      });
    }
  });

  it('should throw NoObjectGeneratedError when schema validation fails', async () => {
    try {
      output.parseOutput({ text: `{ "content": 123 }` }, context);
      fail('must throw error');
    } catch (error) {
      verifyNoObjectGeneratedError(error, {
        message: 'No object generated: response did not match schema.',
      });
    }
  });
});
