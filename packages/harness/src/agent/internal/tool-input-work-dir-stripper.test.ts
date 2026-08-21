import { describe, expect, it } from 'vitest';
import { createToolInputWorkDirStripper } from './tool-input-work-dir-stripper';

const WORK_DIR = '/vercel/sandbox/claude-code-abc123';

/** Feed fragments through the stripper and concatenate everything it releases. */
function streamThrough(fragments: string[], workDir = WORK_DIR): string {
  const stripper = createToolInputWorkDirStripper(workDir);
  const out = fragments
    .map(fragment => stripper.push('call_1', fragment))
    .join('');
  return out + stripper.flush('call_1');
}

describe('createToolInputWorkDirStripper', () => {
  it('strips a work dir contained in a single fragment', () => {
    expect(streamThrough([`{"path":"${WORK_DIR}/src/a.ts"}`])).toBe(
      '{"path":"src/a.ts"}',
    );
  });

  it('strips a work dir split across two fragments', () => {
    // The split falls inside the session id — neither half matches on its own.
    expect(
      streamThrough(['{"path":"/vercel/sandbox/claude-code-', 'abc123/a.ts"}']),
    ).toBe('{"path":"a.ts"}');
  });

  it('strips a work dir split one character at a time', () => {
    expect(streamThrough([...`{"path":"${WORK_DIR}/a.ts"}`])).toBe(
      '{"path":"a.ts"}',
    );
  });

  it('strips a bare work dir split across fragments', () => {
    expect(
      streamThrough([
        `{"cwd":"${WORK_DIR.slice(0, 20)}`,
        `${WORK_DIR.slice(20)}"}`,
      ]),
    ).toBe('{"cwd":"."}');
  });

  it('releases a held tail that turns out not to be a work dir', () => {
    // `/vercel/sandbox/other` shares a prefix with the work dir, then diverges.
    expect(streamThrough(['{"path":"/vercel/sandbox/', 'other/a.ts"}'])).toBe(
      '{"path":"/vercel/sandbox/other/a.ts"}',
    );
  });

  it('flushes a partial prefix left dangling when the input ends', () => {
    const stripper = createToolInputWorkDirStripper(WORK_DIR);
    // Ends mid-prefix, so it is held...
    expect(stripper.push('call_1', '{"path":"/vercel/sand')).toBe('{"path":"');
    // ...and released verbatim once no more fragments can complete it.
    expect(stripper.flush('call_1')).toBe('/vercel/sand');
  });

  it('holds no more than the work dir length', () => {
    const stripper = createToolInputWorkDirStripper(WORK_DIR);
    const released = stripper.push('call_1', 'a'.repeat(500));
    expect(released).toBe('a'.repeat(500));
    expect(stripper.flush('call_1')).toBe('');
  });

  it('keeps concurrent tool calls independent', () => {
    const stripper = createToolInputWorkDirStripper(WORK_DIR);
    const one: string[] = [];
    const two: string[] = [];

    // Interleaved: call_1 carries a work dir, call_2 an unrelated path whose
    // leading `/` is briefly held as a possible start of one.
    one.push(stripper.push('call_1', '{"path":"/vercel/sandbox/claude-code-'));
    two.push(stripper.push('call_2', '{"path":"/tmp/'));
    one.push(stripper.push('call_1', 'abc123/a.ts"}'));
    two.push(stripper.push('call_2', 'b.ts"}'));
    one.push(stripper.flush('call_1'));
    two.push(stripper.flush('call_2'));

    expect(one.join('')).toBe('{"path":"a.ts"}');
    expect(two.join('')).toBe('{"path":"/tmp/b.ts"}');
  });

  it('passes fragments through untouched when there is no work dir', () => {
    const stripper = createToolInputWorkDirStripper('');
    expect(stripper.push('call_1', `{"path":"${WORK_DIR}/a.ts"}`)).toBe(
      `{"path":"${WORK_DIR}/a.ts"}`,
    );
    expect(stripper.flush('call_1')).toBe('');
  });
});
