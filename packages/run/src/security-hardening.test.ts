import { describe, expect, it } from 'vitest';
import { getBindingContext, run, type Bindings } from '../dist/index.js';

describe('guest sandbox hardening', () => {
  it('exposes only the reviewed global surface', async () => {
    await expectValue(
      'return Object.getOwnPropertyNames(globalThis).sort();',
    ).resolves.toEqual([
      'AggregateError',
      'Array',
      'ArrayBuffer',
      'BigInt',
      'BigInt64Array',
      'BigUint64Array',
      'Boolean',
      'DataView',
      'Date',
      'Error',
      'EvalError',
      'FinalizationRegistry',
      'Float16Array',
      'Float32Array',
      'Float64Array',
      'Function',
      'Infinity',
      'Int16Array',
      'Int32Array',
      'Int8Array',
      'InternalError',
      'Iterator',
      'JSON',
      'Map',
      'Math',
      'NaN',
      'Number',
      'Object',
      'Promise',
      'Proxy',
      'RangeError',
      'ReferenceError',
      'Reflect',
      'RegExp',
      'Set',
      'String',
      'Symbol',
      'SyntaxError',
      'TypeError',
      'URIError',
      'Uint16Array',
      'Uint32Array',
      'Uint8Array',
      'Uint8ClampedArray',
      'WeakMap',
      'WeakRef',
      'WeakSet',
      '__runAssertNoDetachedBridgeCalls',
      '__runCreateBridgePromise',
      '__runSerializeJsonPayload',
      'console',
      'decodeURI',
      'decodeURIComponent',
      'encodeURI',
      'encodeURIComponent',
      'escape',
      'eval',
      'globalThis',
      'isFinite',
      'isNaN',
      'parseFloat',
      'parseInt',
      'undefined',
      'unescape',
    ]);
  });

  it('does not expose ambient host authority or nondeterministic APIs', async () => {
    await expectValue(`
      return Object.fromEntries([
        'process', 'require', 'module', 'Buffer', 'fetch', 'XMLHttpRequest',
        'WebSocket', 'crypto', 'performance', 'setTimeout', 'setInterval',
        'queueMicrotask', 'WebAssembly', 'SharedArrayBuffer', 'Deno', 'Bun'
      ].map(name => [name, typeof globalThis[name]]));
    `).resolves.toEqual({
      process: 'undefined',
      require: 'undefined',
      module: 'undefined',
      Buffer: 'undefined',
      fetch: 'undefined',
      XMLHttpRequest: 'undefined',
      WebSocket: 'undefined',
      crypto: 'undefined',
      performance: 'undefined',
      setTimeout: 'undefined',
      setInterval: 'undefined',
      queueMicrotask: 'undefined',
      WebAssembly: 'undefined',
      SharedArrayBuffer: 'undefined',
      Deno: 'undefined',
      Bun: 'undefined',
    });
  });

  it('blocks the dynamic-code constructor corpus', async () => {
    const results = (await value(`
      const results = [];
      for (const attempt of [
        () => eval('1'),
        () => (0, eval)('1'),
        () => globalThis.eval('1'),
        () => Function('return 1')(),
        () => new Function('return 1')(),
        () => Reflect.construct(Function, ['return 1'])(),
        () => (async function(){}).constructor('return 1')(),
        () => Object.getPrototypeOf(async function(){}).constructor('return 1')(),
        () => (function*(){}).constructor('yield 1')().next(),
        () => Object.getPrototypeOf(function*(){}).constructor('yield 1')().next(),
        () => (async function*(){}).constructor('yield 1')().next(),
        () => Object.getPrototypeOf(async function*(){}).constructor('yield 1')().next(),
        () => (() => {}).constructor('return 1')(),
        () => (function(){}).bind(null).constructor('return 1')(),
        () => (class {}).constructor('return 1')(),
        () => Object.constructor('return 1')(),
        () => Object.getPrototypeOf(Function).constructor('return 1')(),
        () => console.log.constructor('return 1')(),
        () => Object.getPrototypeOf(console.log).constructor('return 1')(),
        () => globalThis.constructor.constructor('return 1')()
      ]) {
        try { attempt(); results.push('allowed'); }
        catch (error) { results.push(String(error.message)); }
      }
      return results;
    `)) as string[];
    expect(results).toHaveLength(20);
    expect(results).not.toContain('allowed');
  });

  it('rejects dynamic module loading', async () => {
    await expect(
      run({ source: "return await import('node:fs');" }),
    ).rejects.toThrow();
  });

  it('freezes builtins, binding proxies, and internal helpers', async () => {
    await expectValue(
      `
      const attempts = [
        () => { Object.prototype.polluted = true; },
        () => { Array.prototype.polluted = true; },
        () => { Promise.prototype.polluted = true; },
        () => { JSON.parse = () => ({ polluted: true }); },
        () => { Math.random = () => 1; },
        () => { Date.now = () => 1; },
        () => { globalThis.Map = function FakeMap() {}; },
        () => { globalThis.Set = function FakeSet() {}; },
        () => { globalThis.__runSerializeJsonPayload = () => '"polluted"'; },
        () => { tools = {}; },
      ];
      for (const attempt of attempts) { try { attempt(); } catch {} }
      return {
        object: Boolean(({}).polluted),
        array: Boolean([].polluted),
        promise: Boolean(Promise.prototype.polluted),
        json: JSON.parse('{"ok":true}'),
        randomWasReplaced: Math.random() === 1,
        dateWasReplaced: Date.now() === 1,
        mapName: Map.name,
        setName: Set.name,
        toolsType: typeof tools,
      };
      `,
      { tools: { ok: () => true } },
    ).resolves.toMatchObject({
      object: false,
      array: false,
      promise: false,
      json: { ok: true },
      randomWasReplaced: false,
      dateWasReplaced: false,
      mapName: 'Map',
      setName: 'Set',
      toolsType: 'function',
    });
  });

  it('starts with a clean realm after mutation, failure, and interruption', async () => {
    await expectValue(`
      try { Object.prototype.leaked = 'yes'; } catch {}
      try { globalThis.leaked = 'yes'; } catch {}
      return true;
    `).resolves.toBe(true);

    await expect(
      run({ source: "throw new Error('terminal');" }),
    ).rejects.toThrow('terminal');

    const interrupted = await run({
      source: 'return await tools.pause();',
      bindings: {
        tools: {
          pause: () => getBindingContext().interrupt({ kind: 'pause' }),
        },
      },
    });
    expect(interrupted.status).toBe('interrupted');

    await expectValue(`
      return {
        object: ({}).leaked,
        global: globalThis.leaked,
      };
    `).resolves.toEqual({});
  });

  it.each([
    'Object',
    'Promise',
    'JSON',
    'Math',
    'Date',
    'Iterator',
    'InternalError',
    'console',
    'globalThis',
  ])('rejects a binding namespace that collides with %s', async namespace => {
    await expect(
      run({
        source: 'return 1;',
        bindings: { [namespace]: { call: () => true } },
      }),
    ).rejects.toThrow('Reserved binding namespace');
  });

  it.each(['__proto__', 'constructor', 'prototype', 'then', '__runBridge'])(
    'rejects the dangerous declared binding name %s',
    async name => {
      const group = Object.create(null) as Record<string, () => boolean>;
      Object.defineProperty(group, name, {
        enumerable: true,
        value: () => true,
      });
      await expect(
        run({ source: 'return 1;', bindings: { tools: group } }),
      ).rejects.toThrow('Invalid binding name');
    },
  );
});

function expectValue(source: string, bindings?: Bindings) {
  return expect(value(source, bindings));
}

async function value(source: string, bindings?: Bindings): Promise<unknown> {
  const result = await run({
    source,
    ...(bindings === undefined ? {} : { bindings }),
  });
  if (result.status !== 'completed')
    throw new Error('Unexpected interruption.');
  return result.value;
}
