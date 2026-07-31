import { describe, expect, it } from 'vitest';
import {
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from '../dist/index.js';

setMaxWorkers(32);

describe('core execution', () => {
  it('runs JavaScript and returns a JSON value', async () => {
    await expect(
      runCodeMode({
        js: 'return { answer: 40 + 2 };',
        tools: {},
      }),
    ).resolves.toEqual({ answer: 42 });
  });

  it('returns undefined when the script has no return value', async () => {
    await expect(
      runCodeMode({
        js: 'const value = 1 + 1;',
        tools: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('strips simple TypeScript annotations', async () => {
    await expect(
      runCodeMode({
        js: 'const value: number = 7; return { value };',
        tools: {},
      }),
    ).resolves.toEqual({ value: 7 });
  });

  it('strips interface and satisfies syntax from snippets', async () => {
    await expect(
      runCodeMode({
        js: `
          interface Item { value: number }
          const item = { value: 12 } satisfies Item;
          return item;
        `,
        tools: {},
      }),
    ).resolves.toEqual({ value: 12 });
  });

  it('exposes JSON parse and stringify in the sandbox', async () => {
    await expect(
      runCodeMode({
        js: `
          const parsed = JSON.parse('{"count":2,"items":["a","b"]}');
          parsed.items.push("c");
          return JSON.stringify(parsed);
        `,
        tools: {},
      }),
    ).resolves.toBe('{"count":2,"items":["a","b","c"]}');
  });

  it('creates a fresh global scope for each invocation', async () => {
    await runCodeMode({
      js: 'globalThis.sharedValue = 123; return globalThis.sharedValue;',
      tools: {},
    });

    await expect(
      runCodeMode({
        js: "return globalThis.sharedValue ?? 'missing';",
        tools: {},
      }),
    ).resolves.toBe('missing');
  });

  it('handles many rapid independent invocations', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_value, index) =>
        runCodeMode({
          js: `return ${index} * ${index};`,
          tools: {},
        }),
      ),
    );

    expect(results).toEqual(
      Array.from({ length: 20 }, (_value, index) => index * index),
    );
  });
});
