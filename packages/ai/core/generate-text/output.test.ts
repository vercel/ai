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

  it('should parse the output of the model', () => {
    const result = output.parseOutput(
      { text: `{ "content": "test" }` },
      context,
    );

    expect(result).toStrictEqual({ content: 'test' });
  });

  it('should throw NoObjectGeneratedError when parsing fails', async () => {
    expect(() =>
      output.parseOutput({ text: '{ broken json' }, context),
    ).toThrow(
      new NoObjectGeneratedError({
        message: 'No object generated: could not parse the response.',
        text: '{ broken json',
        response: context.response,
        usage: context.usage,
      }),
    );
  });

  it('should throw NoObjectGeneratedError when schema validation fails', async () => {
    expect(() =>
      output.parseOutput({ text: `{ "content": 123 }` }, context),
    ).toThrow(
      new NoObjectGeneratedError({
        message: 'No object generated: response did not match schema.',
        text: `{ "content": 123 }`,
        response: context.response,
        usage: context.usage,
      }),
    );
  });
});
