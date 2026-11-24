import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v7/rename-system-to-instructions';
import { applyTransform, testTransform } from './test-utils';

describe('rename-system-to-instructions', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rename-system-to-instructions');
  });

  it('does not modify files without ai imports', () => {
    const input = `
const keystoneField = {
  system: true,
  label: 'System Name',
};
const { system } = req.body;
console.log(db.system);
`;
    expect(applyTransform(transformer, input)).toBe(input);
  });

  it('does not modify unrelated domain objects or member expressions in files with ai imports', () => {
    const input = `import { generateText } from 'ai';

const metadata = {
  system: 'keystone-field',
  version: 1,
};

const user = {
  id: 123,
  system: 'admin',
};

const { system } = getSystemConfig();

console.log(user.system);
`;
    expect(applyTransform(transformer, input)).toBe(input);
  });

  it('transforms inline generateText options object', () => {
    const input = `import { generateText } from 'ai';

await generateText({
  model: 'gpt-4o',
  system: 'You are helpful',
  prompt: 'Hello',
});
`;
    const expected = `import { generateText } from 'ai';

await generateText({
  model: 'gpt-4o',
  instructions: 'You are helpful',
  prompt: 'Hello',
});
`;
    expect(applyTransform(transformer, input)).toBe(expected);
  });

  it('transforms new Agent options object', () => {
    const input = `import { Agent } from 'ai';

const agent = new Agent({
  model: 'gpt-4o',
  system: 'You are a helpful agent',
});
`;
    const expected = `import { Agent } from 'ai';

const agent = new Agent({
  model: 'gpt-4o',
  instructions: 'You are a helpful agent',
});
`;
    expect(applyTransform(transformer, input)).toBe(expected);
  });

  it('transforms prepareStep returned object and callback member access', () => {
    const input = `import { streamText } from 'ai';

await streamText({
  model: 'gpt-4o',
  prompt: 'Hello',
  prepareStep: () => ({
    system: 'concise',
  }),
  onStart: (event) => {
    console.log(event.system);
  },
});
`;
    const expected = `import { streamText } from 'ai';

await streamText({
  model: 'gpt-4o',
  prompt: 'Hello',
  prepareStep: () => ({
    instructions: 'concise',
  }),
  onStart: (event) => {
    console.log(event.instructions);
  },
});
`;
    expect(applyTransform(transformer, input)).toBe(expected);
  });
});
