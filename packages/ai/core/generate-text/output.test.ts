import { z } from 'zod';
import { NoObjectGeneratedError } from '../../errors';
import { object } from './output';

describe('Output.object', () => {
  const output = object({ schema: z.object({ content: z.string() }) });

  it('should parse the output of the model', () => {
    const result = output.parseOutput({ text: `{ "content": "test" }` });

    expect(result).toStrictEqual({ content: 'test' });
  });

  it('should throw NoObjectGeneratedError when parsing fails', async () => {
    expect(() => output.parseOutput({ text: '{ broken json' })).toThrow(
      new NoObjectGeneratedError({
        message: 'No object generated: could not parse the response.',
      }),
    );
  });

  it('should throw NoObjectGeneratedError when schema validation fails', async () => {
    expect(() => output.parseOutput({ text: `{ "content": 123 }` })).toThrow(
      new NoObjectGeneratedError({
        message: 'No object generated: response did not match schema.',
      }),
    );
  });
});
