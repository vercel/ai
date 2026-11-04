import { describe, expect, it } from 'vitest';
import type { HarnessV1StreamPart } from '../../v1';
import {
  createToolInputWorkDirStripper,
  stripParsedToolInputWorkDir,
  stripWorkDir,
} from './strip-work-dir';

const WORK_DIR = '/vercel/sandbox/claude-code-abc123';

describe('stripWorkDir', () => {
  it('strips the prefix from a tool-call input string', () => {
    const part: HarnessV1StreamPart = {
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'readFile',
      input: JSON.stringify({ path: `${WORK_DIR}/src/foo.ts` }),
    };
    const out = stripWorkDir(part, WORK_DIR);
    expect(out).toEqual({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'readFile',
      input: JSON.stringify({ path: 'src/foo.ts' }),
    });
  });

  it('strips the prefix from a tool-input delta', () => {
    const part: HarnessV1StreamPart = {
      type: 'tool-input-delta',
      id: 'c1',
      delta: JSON.stringify({ path: `${WORK_DIR}/src/foo.ts` }),
    };
    const out = stripWorkDir(part, WORK_DIR);
    expect(out).toEqual({
      type: 'tool-input-delta',
      id: 'c1',
      delta: JSON.stringify({ path: 'src/foo.ts' }),
    });
  });

  it('strips every occurrence in free-form tool-result string output', () => {
    const part: HarnessV1StreamPart = {
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'bash',
      result: `${WORK_DIR}/a.ts\n${WORK_DIR}/b.ts\n`,
    };
    const out = stripWorkDir(part, WORK_DIR) as Extract<
      HarnessV1StreamPart,
      { type: 'tool-result' }
    >;
    expect(out.result).toBe('a.ts\nb.ts\n');
  });

  it('strips paths nested in objects and arrays of a tool-result', () => {
    const part: HarnessV1StreamPart = {
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'grep',
      result: {
        matches: [
          { file: `${WORK_DIR}/src/a.ts`, line: 1 },
          { file: `${WORK_DIR}/src/b.ts`, line: 2 },
        ],
        cwd: WORK_DIR,
      },
    };
    const out = stripWorkDir(part, WORK_DIR) as Extract<
      HarnessV1StreamPart,
      { type: 'tool-result' }
    >;
    expect(out.result).toEqual({
      matches: [
        { file: 'src/a.ts', line: 1 },
        { file: 'src/b.ts', line: 2 },
      ],
      cwd: '.',
    });
  });

  it('maps a bare reference to the work dir to "."', () => {
    const part: HarnessV1StreamPart = {
      type: 'file-change',
      event: 'modify',
      path: WORK_DIR,
    };
    const out = stripWorkDir(part, WORK_DIR) as Extract<
      HarnessV1StreamPart,
      { type: 'file-change' }
    >;
    expect(out.path).toBe('.');
  });

  it.each([
    ['whitespace', 'cd /work && pwd', 'cd . && pwd'],
    ['a quote in JSON', '{"cwd":"/work"}', '{"cwd":"."}'],
    ['a shell delimiter', 'cd /work;pwd', 'cd .;pwd'],
  ])(
    'maps a bare work dir followed by %s to "." in a complete value',
    (_description, input, expected) => {
      const part: HarnessV1StreamPart = {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'bash',
        input,
      };
      const out = stripWorkDir(part, '/work') as Extract<
        HarnessV1StreamPart,
        { type: 'tool-call' }
      >;
      expect(out.input).toBe(expected);
    },
  );

  it('strips the prefix from a file-change path', () => {
    const part: HarnessV1StreamPart = {
      type: 'file-change',
      event: 'create',
      path: `${WORK_DIR}/notes.md`,
    };
    const out = stripWorkDir(part, WORK_DIR) as Extract<
      HarnessV1StreamPart,
      { type: 'file-change' }
    >;
    expect(out.path).toBe('notes.md');
  });

  it('preserves the work dir text inside longer path segments', () => {
    const part: HarnessV1StreamPart = {
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'bash',
      result: {
        command:
          'ls .github/workflows && echo origin/workcell && cat /work/a.ts',
        path: '/work/.github/workflows/ci.yml',
        branch: 'origin/workcell/topic',
      },
    };
    const out = stripWorkDir(part, '/work') as Extract<
      HarnessV1StreamPart,
      { type: 'tool-result' }
    >;
    expect(out.result).toEqual({
      command: 'ls .github/workflows && echo origin/workcell && cat a.ts',
      path: '.github/workflows/ci.yml',
      branch: 'origin/workcell/topic',
    });
  });

  it('preserves repeated work dir text after an embedded occurrence in complete and streamed values', () => {
    const value = 'origin/work/work/foo';
    const toolCall = stripWorkDir(
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'bash',
        input: value,
      },
      '/work',
    ) as Extract<HarnessV1StreamPart, { type: 'tool-call' }>;
    const toolResult = stripWorkDir(
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'bash',
        result: value,
      },
      '/work',
    ) as Extract<HarnessV1StreamPart, { type: 'tool-result' }>;
    const fileChange = stripWorkDir(
      {
        type: 'file-change',
        event: 'modify',
        path: value,
      },
      '/work',
    ) as Extract<HarnessV1StreamPart, { type: 'file-change' }>;

    const strip = createToolInputWorkDirStripper({
      sessionWorkDir: '/work',
    });
    const streamed = [
      { type: 'tool-input-start', id: 'c1', toolName: 'bash' },
      { type: 'tool-input-delta', id: 'c1', delta: value },
      { type: 'tool-input-end', id: 'c1' },
    ]
      .flatMap(part =>
        strip(
          part as Extract<
            HarnessV1StreamPart,
            {
              type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-end';
            }
          >,
        ),
      )
      .filter(part => part.type === 'tool-input-delta')
      .map(part => part.delta)
      .join('');

    expect(toolCall.input).toBe(streamed);
    expect(toolResult.result).toBe(streamed);
    expect(fileChange.path).toBe(streamed);
    expect(streamed).toBe(value);
  });

  it.each([
    ['whitespace', ['cd /work', ' && pwd'], 'cd . && pwd'],
    ['a quote in JSON', ['{"cwd":"/work', '"}'], '{"cwd":"."}'],
    ['a shell delimiter', ['cd /work', ';pwd'], 'cd .;pwd'],
  ])(
    'maps a streamed bare work dir followed by %s to "."',
    (_description, deltas, expected) => {
      const strip = createToolInputWorkDirStripper({
        sessionWorkDir: '/work',
      });
      const parts: HarnessV1StreamPart[] = [
        { type: 'tool-input-start', id: 'c1', toolName: 'bash' },
        ...deltas.map(
          delta =>
            ({
              type: 'tool-input-delta',
              id: 'c1',
              delta,
            }) as const,
        ),
        { type: 'tool-input-end', id: 'c1' },
      ];

      const output = parts.flatMap(part =>
        strip(
          part as Extract<
            HarnessV1StreamPart,
            {
              type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-end';
            }
          >,
        ),
      );

      expect(
        output
          .filter(part => part.type === 'tool-input-delta')
          .map(part => part.delta)
          .join(''),
      ).toBe(expected);
    },
  );

  it('preserves embedded work dir text split across tool-input deltas', () => {
    const strip = createToolInputWorkDirStripper({
      sessionWorkDir: '/work',
    });
    const parts: HarnessV1StreamPart[] = [
      { type: 'tool-input-start', id: 'c1', toolName: 'bash' },
      {
        type: 'tool-input-delta',
        id: 'c1',
        delta: '{"command":"ls .github/wor',
      },
      {
        type: 'tool-input-delta',
        id: 'c1',
        delta: 'kflows && cat /wo',
      },
      { type: 'tool-input-delta', id: 'c1', delta: 'rk/a.ts"}' },
      { type: 'tool-input-end', id: 'c1' },
    ];

    const output = parts.flatMap(part =>
      strip(
        part as Extract<
          HarnessV1StreamPart,
          {
            type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-end';
          }
        >,
      ),
    );

    expect(
      output
        .filter(part => part.type === 'tool-input-delta')
        .map(part => part.delta)
        .join(''),
    ).toBe('{"command":"ls .github/workflows && cat a.ts"}');
  });

  it('preserves a work dir prefix after a non-boundary character in a previous delta', () => {
    const strip = createToolInputWorkDirStripper({
      sessionWorkDir: '/work',
    });
    const parts: HarnessV1StreamPart[] = [
      { type: 'tool-input-start', id: 'c1', toolName: 'bash' },
      { type: 'tool-input-delta', id: 'c1', delta: 'foo' },
      { type: 'tool-input-delta', id: 'c1', delta: '/work/bar' },
      { type: 'tool-input-end', id: 'c1' },
    ];

    const output = parts.flatMap(part =>
      strip(
        part as Extract<
          HarnessV1StreamPart,
          {
            type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-end';
          }
        >,
      ),
    );

    expect(
      output
        .filter(part => part.type === 'tool-input-delta')
        .map(part => part.delta)
        .join(''),
    ).toBe('foo/work/bar');
  });

  it('passes through variants with no path-bearing fields unchanged', () => {
    const part: HarnessV1StreamPart = {
      type: 'text-delta',
      id: 't1',
      delta: `wrote ${WORK_DIR}/foo.ts`,
    };
    expect(stripWorkDir(part, WORK_DIR)).toBe(part);
  });
});

describe('stripParsedToolInputWorkDir', () => {
  it('preserves cycles and shared references without modifying the validated input', () => {
    const shared = { path: `${WORK_DIR}/shared.ts` };
    const source: {
      first: typeof shared;
      second: typeof shared;
      self?: unknown;
      values?: unknown[];
    } = { first: shared, second: shared };
    const values: unknown[] = [source];
    source.self = source;
    source.values = values;
    values.push(values);

    const display = stripParsedToolInputWorkDir({
      value: source,
      sessionWorkDir: WORK_DIR,
    }) as typeof source;

    expect(display).not.toBe(source);
    expect(display.first).toBe(display.second);
    expect(display.first).not.toBe(shared);
    expect(display.first.path).toBe('shared.ts');
    expect(display.self).toBe(display);
    expect(display.values?.[0]).toBe(display);
    expect(display.values?.[1]).toBe(display.values);
    expect(source.first.path).toBe(`${WORK_DIR}/shared.ts`);
  });

  it('strips deeply nested paths without overflowing the stack', () => {
    const depth = 12_000;
    const source: { child?: unknown; path?: string } = {};
    let current = source;
    for (let index = 0; index < depth; index++) {
      const child = {};
      current.child = child;
      current = child;
    }
    current.path = `${WORK_DIR}/deep.ts`;

    const display = stripParsedToolInputWorkDir({
      value: source,
      sessionWorkDir: WORK_DIR,
    });
    let projected = display;
    for (let index = 0; index < depth; index++) {
      projected = (projected as { child: unknown }).child;
    }
    expect(projected).toEqual({ path: 'deep.ts' });
    expect(current.path).toBe(`${WORK_DIR}/deep.ts`);
  });
});
