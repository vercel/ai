import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v6/wrap-tomodeloutput-parameter';
import { applyTransform, testTransform } from './test-utils';

describe('wrap-tomodeloutput-parameter', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'wrap-tomodeloutput-parameter');
  });

  it('preserves identifier bindings in the callback body', () => {
    const transformed = applyTransform(
      transformer,
      `
        const output = 'outer:';
        const definition = tool({
          toModelOutput: result => {
            const output = 'local:';
            const wrap = result => ({ result });
            return {
              value: output + result,
              nested: wrap('nested'),
              shorthand: { result },
            };
          },
        });
        const capturedDefinition = tool({
          toModelOutput: result => output + result,
        });
      `,
    );

    const { callback, capturedCallback } = new Function(
      'tool',
      `${transformed}; return {
        callback: definition.toModelOutput,
        capturedCallback: capturedDefinition.toModelOutput,
      };`,
    )((definition: unknown) => definition);

    expect(callback({ output: 'value' })).toEqual({
      value: 'local:value',
      nested: { result: 'nested' },
      shorthand: { result: 'value' },
    });
    expect(capturedCallback({ output: 'value' })).toBe('outer:value');
  });
});
