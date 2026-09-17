import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import * as z3 from 'zod/v3';
import { globalConfig, version } from 'zod/v4/core';
import {
  parseJsonEventStream,
  safeParseJSON,
  zodSchema,
  asSchema,
} from '../src';
import { createOpenAI } from '../../openai/src/openai-provider';
import {
  createOpenAIChatChunkParser,
  openaiChatChunkSchema,
} from '../../openai/src/chat/openai-chat-api';

const textChunks = readFileSync(
  new URL(
    '../../openai/src/chat/__fixtures__/openai-text.chunks.txt',
    import.meta.url,
  ),
  'utf8',
)
  .trim()
  .split('\n');
const originalJitless = globalConfig.jitless;
afterEach(() => {
  globalConfig.jitless = originalJitless;
});

function response(texts) {
  return new Response(
    [...texts, '[DONE]'].map(text => `data: ${text}\n\n`).join(''),
  );
}

async function collect(stream) {
  const reader = stream.getReader();
  const values = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return values;
      values.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function errorDetails(error) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    issues: error.issues,
    value: error.value,
    cause: errorDetails(error.cause),
  };
}

it('runs the real modern peer without remapping v3 to v4', () => {
  expect(version).toEqual({ major: 4, minor: 5, patch: 4 });
  expect(z.core.version).toEqual(version);
  expect(z3.string()._zod).toBeUndefined();
});

describe.each([zodSchema, asSchema])('generic async validation: %s', wrap => {
  it('awaits ordinary Promise-returning callbacks once, even when strict compilation succeeds', async () => {
    const transform = vi.fn(value => Promise.resolve(value.length));
    const raw = z.string().transform(transform);
    expect(() => z.compile(raw, { strict: true })).not.toThrow();
    const result = wrap(raw).validate('abcd');
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ success: true, value: 4 });
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it('does not replay stateful callbacks, defaults or accessors on invalid input', async () => {
    let calls = 0;
    const raw = z.string().refine(() => ++calls > 1);
    expect(z.compile(raw, { strict: true }).safeParse('x').success).toBe(true);
    expect(calls).toBe(2);
    calls = 0;
    expect(await wrap(raw).validate('x')).toMatchObject({ success: false });
    expect(calls).toBe(1);
    const fallback = vi.fn(() => 'default');
    const getter = vi.fn().mockReturnValueOnce(42).mockReturnValue('ok');
    const schema = z.object({
      missing: z.string().default(fallback),
      text: z.string(),
    });
    expect(
      await wrap(schema).validate(
        Object.defineProperty({}, 'text', { get: getter }),
      ),
    ).toMatchObject({ success: false });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('awaits lazy transforms, nested promises and async superRefine', async () => {
    const transform = vi.fn(async value => value.length);
    const raw = z.object({
      text: z.lazy(() => z.string().transform(transform)),
      promise: z.promise(z.string()),
    });
    expect(
      await wrap(raw).validate({
        text: 'abcd',
        promise: Promise.resolve('ok'),
      }),
    ).toEqual({ success: true, value: { text: 4, promise: 'ok' } });
    expect(transform).toHaveBeenCalledTimes(1);
    const check = vi.fn(async (_value, ctx) => {
      await Promise.resolve();
      ctx.addIssue({ code: 'custom', message: 'rejected' });
    });
    expect(
      await wrap(z.string().superRefine(check)).validate('x'),
    ).toMatchObject({
      success: false,
      error: { issues: [{ message: 'rejected' }] },
    });
    expect(check).toHaveBeenCalledTimes(1);
  });
});

it('preserves actual OpenAI SSE data and exact invalid/malformed JSON errors', async () => {
  const texts = [
    ...textChunks,
    '{"error":{"message":"test","param":null}}',
    '{"choices":[{"index":"bad","delta":{"content":42}}]}',
    'invalid json',
    '{"__proto__":{}}',
  ];
  const compiler = vi.fn(z.compile);
  const results = await collect(
    parseJsonEventStream({
      stream: response(texts).body,
      schema: createOpenAIChatChunkParser(compiler),
    }),
  );
  expect(results).toHaveLength(texts.length);
  for (let i = 0; i < texts.length; i++) {
    const expected = await safeParseJSON({
      text: texts[i],
      schema: openaiChatChunkSchema,
    });
    expect(results[i]).toEqual(expected);
    expect(errorDetails(results[i].error)).toEqual(
      errorDetails(expected.error),
    );
  }
  expect(compiler).toHaveBeenCalledTimes(1);
  expect(compiler.mock.results[0].value).not.toBe(compiler.mock.calls[0][0]);
});

it('bypasses the runtime on valid input, honors changing jitless policy and compiles once', async () => {
  let run;
  const compiler = vi.fn((raw, options) => {
    run = vi.spyOn(raw._zod, 'run');
    return z.compile(raw, options);
  });
  const parser = createOpenAIChatChunkParser(compiler);
  globalConfig.jitless = true;
  await parser.parse(textChunks[0]);
  expect(compiler).not.toHaveBeenCalled();
  globalConfig.jitless = false;
  await parser.parse(textChunks[0]);
  expect(run).not.toHaveBeenCalled();
  globalConfig.jitless = true;
  await parser.parse(textChunks[0]);
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][1]).toMatchObject({ async: true });
  globalConfig.jitless = false;
  await parser.parse(textChunks[0]);
  expect(run).toHaveBeenCalledTimes(1);
  await parser.parse('{"choices":"invalid"}');
  expect(run).toHaveBeenCalledTimes(2);
  expect(compiler).toHaveBeenCalledTimes(1);
});

it('caches compile failure and rejects arbitrary values before touching accessors', async () => {
  const compiler = vi.fn(() => {
    throw new Error('compile unavailable');
  });
  const parser = createOpenAIChatChunkParser(compiler);
  const getter = vi.fn(() => 'x');
  expect(
    await parser.parse(Object.defineProperty({}, 'text', { get: getter })),
  ).toMatchObject({ success: false });
  expect(getter).not.toHaveBeenCalled();
  expect(compiler).not.toHaveBeenCalled();
  expect('validate' in parser).toBe(false);
  for (const text of [textChunks[0], '{"choices":"invalid"}']) {
    expect(await parser.parse(text)).toEqual(
      await safeParseJSON({ text, schema: openaiChatChunkSchema }),
    );
  }
  expect(compiler).toHaveBeenCalledTimes(1);
});

it('keeps the actual OpenAI chunk graph callback-free and structural', async () => {
  function audit(schema) {
    const def = schema._zod.def;
    expect(def.checks ?? []).toEqual([]);
    expect(def.error).toBeUndefined();
    expect(def.coerce).toBeFalsy();
    expect(
      Object.values(def).filter(value => typeof value === 'function'),
    ).toEqual([]);
    switch (def.type) {
      case 'object':
        expect(def.catchall).toBeUndefined();
        for (const descriptor of Object.values(
          Object.getOwnPropertyDescriptors(def.shape),
        )) {
          expect(descriptor.get).toBeUndefined();
          expect(descriptor.set).toBeUndefined();
          audit(descriptor.value);
        }
        break;
      case 'union':
        def.options.forEach(audit);
        break;
      case 'array':
        audit(def.element);
        break;
      case 'optional':
      case 'nullable':
        audit(def.innerType);
        break;
      case 'string':
      case 'number':
      case 'literal':
      case 'enum':
      case 'any':
        break;
      default:
        throw new Error(`Unaudited schema kind: ${def.type}`);
    }
  }
  const compiler = vi.fn(z.compile);
  const parser = createOpenAIChatChunkParser(compiler);
  expect(await parser.parse(textChunks[0])).toMatchObject({ success: true });
  audit(compiler.mock.calls[0][0]);
});

it('uses the opt-in through createOpenAI and caches across chat models', async () => {
  const fetch = async () => response(textChunks.slice(0, 3));
  const compiler = vi.fn(z.compile);
  const provider = createOpenAI({
    apiKey: 'test',
    fetch,
    experimental_compileChatChunks: compiler,
  });
  const baseline = createOpenAI({ apiKey: 'test', fetch });
  expect(compiler).not.toHaveBeenCalled();
  for (let i = 0; i < 2; i++) {
    const options = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };
    const actual = await provider.chat('gpt-4.1').doStream(options);
    const expected = await baseline.chat('gpt-4.1').doStream(options);
    expect(await collect(actual.stream)).toEqual(
      await collect(expected.stream),
    );
  }
  expect(compiler).toHaveBeenCalledTimes(1);
});
