import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v5/rename-message-to-ui-message';
import { applyTransform, testTransform } from './test-utils';

describe('rename-message-to-ui-message', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rename-message-to-ui-message');
  });
  it.each([
    ['Message', 'UIMessage', 'ChatMessage'],
    ['CreateMessage', 'CreateUIMessage', 'NewMessage'],
    ['Message', 'UIMessage', 'CreateMessage'],
    ['CreateMessage', 'CreateUIMessage', 'Message'],
  ])(
    'preserves %s imported as %s with local alias %s',
    (name, renamed, alias) => {
      const input = `import type { ${name} as ${alias} } from 'ai';
type History = ${alias}[];
type Batch = Array<${alias}>;
function identity(message: ${alias}): ${alias} {
  return message;
}
declare function generic<T>(): T;
const result = generic<${alias}>();`;
      const expected = input.replace(
        `{ ${name} as ${alias} }`,
        `{ ${renamed} as ${alias} }`,
      );

      const output = applyTransform(transformer, input);
      expect(output).toBe(expected);
      expect(applyTransform(transformer, output)).toBe(output);
    },
  );
});
