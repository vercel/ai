import { describe, expect, it } from 'vitest';
import { experimental_runCodeMode as runCodeMode } from '../../dist/index.js';

describe('security hardening', () => {
  it('does not expose dynamic code compilation or Node globals', async () => {
    await expect(
      runCodeMode({
        js: `
          let functionMessage = '';
          try { Function('return 1')(); } catch (error) { functionMessage = error.message; }
          return {
            evalType: typeof eval,
            functionMessage,
            processType: typeof process,
            requireType: typeof require
          };
        `,
        tools: {},
      }),
    ).resolves.toMatchObject({
      evalType: 'undefined',
      processType: 'undefined',
      requireType: 'undefined',
    });
  });

  it('prevents prototype pollution from affecting later invocations', async () => {
    await expect(
      runCodeMode({
        js: `
          try { Array.prototype.hacked = true; } catch {}
          return Boolean(Array.prototype.hacked);
        `,
        tools: {},
      }),
    ).resolves.toBe(false);

    await expect(
      runCodeMode({
        js: 'return Boolean(Array.prototype.hacked);',
        tools: {},
      }),
    ).resolves.toBe(false);
  });

  it('prevents object prototype pollution inside the same invocation', async () => {
    await expect(
      runCodeMode({
        js: `
          try { Object.prototype.hacked = true; } catch {}
          return {
            assigned: Boolean(Object.prototype.hacked),
            leaked: Boolean(({}).hacked)
          };
        `,
        tools: {},
      }),
    ).resolves.toEqual({
      assigned: false,
      leaked: false,
    });
  });

  it('does not expose module loading primitives', async () => {
    await expect(
      runCodeMode({
        js: 'return { require: typeof require, process: typeof process, module: typeof module };',
        tools: {},
      }),
    ).resolves.toEqual({
      require: 'undefined',
      process: 'undefined',
      module: 'undefined',
    });
  });

  it('does not expose crypto APIs', async () => {
    await expect(
      runCodeMode({
        js: `
          return {
            cryptoType: typeof crypto,
            cryptoGlobalType: typeof globalThis.crypto,
          };
        `,
        tools: {},
      }),
    ).resolves.toEqual({
      cryptoType: 'undefined',
      cryptoGlobalType: 'undefined',
    });
  });

  it('does not expose performance APIs', async () => {
    await expect(
      runCodeMode({
        js: `
          return {
            performanceType: typeof performance,
            performanceGlobalType: typeof globalThis.performance,
          };
        `,
        tools: {},
      }),
    ).resolves.toEqual({
      performanceType: 'undefined',
      performanceGlobalType: 'undefined',
    });
  });

  it('blocks constructor-based dynamic code compilation escapes', async () => {
    await expect(
      runCodeMode({
        js: `
          const messages = [];
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
            try {
              attempt();
              messages.push("allowed");
            } catch (error) {
              messages.push(error.message);
            }
          }
          return messages;
        `,
        tools: {},
      }),
    ).resolves.toEqual([
      'not a function',
      'not a function',
      'not a function',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
      'Function constructor is not allowed',
    ]);
  });

  it('does not allow JSON methods to be replaced', async () => {
    await expect(
      runCodeMode({
        js: `
          try { JSON.parse = () => ({ hacked: true }); } catch {}
          try { JSON.stringify = () => "hacked"; } catch {}
          return {
            parsed: JSON.parse('{"ok":true}'),
            stringified: JSON.stringify({ ok: true })
          };
        `,
        tools: {},
      }),
    ).resolves.toEqual({
      parsed: { ok: true },
      stringified: '{"ok":true}',
    });
  });

  it('does not allow the result serializer to be replaced', async () => {
    await expect(
      runCodeMode({
        js: `
          try { globalThis.__codeModeSerializeJsonPayload = () => '"hacked"'; } catch {}
          return 1n;
        `,
        tools: {},
      }),
    ).rejects.toThrow(/JSON-serializable|bigint/i);
  });
});
