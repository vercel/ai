import { expect, it, vi } from 'vitest';
import type { StreamTextResult } from 'ai';
import { printStream } from './print-stream';

it('escapes controls in streamed text, reasoning, and serialized tool data', async () => {
  const chunks: string[] = [];
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    chunks.push(String(chunk));
    return true;
  });

  try {
    await printStream({
      fullStream: (async function* () {
        yield { type: 'reasoning-start' };
        yield { type: 'reasoning-delta', text: '\x1b' };
        yield { type: 'reasoning-delta', text: ']52;c;dGVzdA==\x07' };
        yield { type: 'reasoning-end' };
        yield { type: 'text-delta', text: 'hello\n\x1bPtest\x1b\\' };
        yield { type: 'tool-call', input: '\x9dtest\x9c' };
        yield { type: 'tool-result', output: '\x9dtest\x9c' };
      })(),
    } as unknown as StreamTextResult<any, any, any>);
  } finally {
    write.mockRestore();
  }

  const output = chunks.join('');
  expect(output).toContain('\\u001b]52;c;dGVzdA==\\u0007');
  expect(output).toContain('hello\n\\u001bPtest\\u001b\\');
  expect(output).toContain('\\u009dtest\\u009c');
  expect(output).not.toContain('\x9d');
  expect(output).not.toContain('\x9c');
  expect(output).toContain('\x1b[94m');
  expect(output).toContain('\x1b[0m');
});
