import { fail } from 'assert';
import { z } from 'zod';
import { verifyNoObjectGeneratedError } from '../../errors/no-object-generated-error';
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
        response: context.response,
        usage: context.usage,
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
        response: context.response,
        usage: context.usage,
      });
    }
  });
});
