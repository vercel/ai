import { Buffer } from 'node:buffer';
import { runManaged } from './runtime/manager.js';
import { createSignedContinuationCodec } from './continuation-codec.js';
import type {
  Bindings,
  ContinuationCodec,
  RunInput,
  Runner,
  RunnerOptions,
  RunResult,
} from './types.js';

let defaultRunner: Runner<string> | undefined;

/** Executes JavaScript in a fresh, hardened QuickJS context. */
export async function run<OUTPUT = unknown>(
  input: RunInput<string>,
): Promise<RunResult<OUTPUT, string>> {
  defaultRunner ??= createRunner({ continuationAudience: 'run' });
  return await defaultRunner.run<OUTPUT>(input);
}

/** Creates a runner with shared defaults. */
export function createRunner<TOKEN = string>(
  options: RunnerOptions<TOKEN> = {},
): Runner<TOKEN> {
  if (
    options.continuationCodec !== undefined &&
    options.continuationSecret !== undefined
  ) {
    throw new TypeError(
      'Runner continuationCodec and continuationSecret cannot be used together.',
    );
  }
  const configuredSecret =
    options.continuationSecret ?? process.env.RUN_CONTINUATION_SECRET;
  const continuationCodec =
    options.continuationCodec ??
    (configuredSecret === undefined
      ? missingContinuationCodec<TOKEN>()
      : (createSignedContinuationCodec({
          secret: configuredSecret,
        }) as ContinuationCodec<TOKEN>));
  const continuationAudience = options.continuationAudience ?? 'run';
  if (
    continuationAudience.length === 0 ||
    Buffer.byteLength(continuationAudience) > 512
  ) {
    throw new TypeError(
      'Runner continuationAudience must contain between 1 and 512 bytes.',
    );
  }
  return {
    async run<OUTPUT = unknown>(
      input: RunInput<TOKEN>,
    ): Promise<RunResult<OUTPUT, TOKEN>> {
      const bindings = input.bindings ?? {};
      validateBindings(bindings);
      const value = await runManaged({
        ...input,
        bindings,
        limits: {
          ...options.limits,
          ...input.limits,
        },
        continuationCodec,
        continuationAudience,
      });
      return value as RunResult<OUTPUT, TOKEN>;
    },
  };
}

function missingContinuationCodec<TOKEN>(): ContinuationCodec<TOKEN> {
  const error = () => {
    throw new TypeError(
      'Continuation signing is not configured. Set RUN_CONTINUATION_SECRET or pass continuationSecret or continuationCodec to createRunner().',
    );
  };
  return { encode: error, decode: error };
}

const RESERVED_GLOBALS = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'Atomics',
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
  'Infinity',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'InternalError',
  'Intl',
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
  'SharedArrayBuffer',
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
  'WebAssembly',
  'console',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'eval',
  'Function',
  'globalThis',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
  'performance',
  'crypto',
  'undefined',
  'unescape',
]);

const RESERVED_BINDING_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'then',
]);

function validateBindings(bindings: Bindings): void {
  for (const [namespace, group] of Object.entries(bindings)) {
    if (!Object.hasOwn(bindings, namespace)) {
      continue;
    }
    if (
      Buffer.byteLength(namespace) > 512 ||
      !/^[A-Za-z_$][\w$]*$/u.test(namespace)
    ) {
      throw new TypeError(`Invalid binding namespace: ${namespace}`);
    }
    if (RESERVED_GLOBALS.has(namespace) || namespace.startsWith('__run')) {
      throw new TypeError(`Reserved binding namespace: ${namespace}`);
    }
    if (typeof group !== 'object' || group === null || Array.isArray(group)) {
      throw new TypeError(
        `Binding namespace "${namespace}" must be an object.`,
      );
    }
    for (const [name, binding] of Object.entries(group)) {
      if (!Object.hasOwn(group, name)) {
        continue;
      }
      if (
        name.length === 0 ||
        Buffer.byteLength(`${namespace}.${name}`) > 1024 ||
        name.includes('.') ||
        RESERVED_BINDING_NAMES.has(name) ||
        name.startsWith('__run')
      ) {
        throw new TypeError(`Invalid binding name: ${namespace}.${name}`);
      }
      if (typeof binding !== 'function') {
        throw new TypeError(
          `Binding "${namespace}.${name}" must be a function.`,
        );
      }
    }
  }
}
