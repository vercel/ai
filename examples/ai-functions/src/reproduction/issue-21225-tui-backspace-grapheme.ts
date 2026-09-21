import { EventEmitter } from 'node:events';
import {
  TerminalRenderer,
  type TerminalInput,
  type TerminalOutput,
} from '../../../../packages/tui/src/tui/terminal-renderer';

class ReproductionInput extends EventEmitter implements TerminalInput {
  isTTY = true;

  setRawMode() {
    return this;
  }

  resume() {
    return this;
  }

  pause() {
    return this;
  }
}

class ReproductionOutput extends EventEmitter implements TerminalOutput {
  columns = 80;
  rows = 24;

  write(
    _chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) {
    if (typeof encodingOrCallback === 'function') {
      encodingOrCallback();
    }
    callback?.();
    return true;
  }
}

async function submitAfterBackspace({
  prompt,
  backspace,
}: {
  prompt: string;
  backspace: '\u007f' | '\b';
}) {
  const input = new ReproductionInput();
  const renderer = new TerminalRenderer({
    input,
    output: new ReproductionOutput(),
  });
  const submittedPrompt = renderer.readPrompt({ title: 'Issue #21225' });

  input.emit('data', Buffer.from(prompt));
  input.emit('data', Buffer.from(backspace));
  input.emit('data', Buffer.from('\r'));

  return await submittedPrompt;
}

async function main() {
  const cases = [
    {
      name: 'emoji with DEL Backspace',
      prompt: 'hello 😀',
      backspace: '\u007f' as const,
      expected: 'hello ',
    },
    {
      name: 'emoji with BS Backspace',
      prompt: 'hello 😀',
      backspace: '\b' as const,
      expected: 'hello ',
    },
    {
      name: 'combining-character grapheme',
      prompt: 'hello e\u0301',
      backspace: '\u007f' as const,
      expected: 'hello ',
    },
    {
      name: 'joined-emoji grapheme',
      prompt: 'hello 👨‍👩‍👧‍👦',
      backspace: '\u007f' as const,
      expected: 'hello ',
    },
  ];

  const failures: Array<{
    name: string;
    prompt: string;
    expected: string;
    actual: string;
  }> = [];

  for (const testCase of cases) {
    const actual = await submitAfterBackspace(testCase);

    if (actual !== testCase.expected) {
      failures.push({ ...testCase, actual });
    }
  }

  if (failures.length === 0) {
    console.log('Issue #21225 is not present.');
    return;
  }

  const partialGraphemeWasSubmitted = failures.some(
    ({ prompt, expected, actual }) =>
      actual.startsWith(expected) &&
      prompt.startsWith(actual) &&
      actual.length > expected.length &&
      actual.length < prompt.length,
  );

  if (!partialGraphemeWasSubmitted) {
    throw new Error(
      `Unexpected TUI deletion behavior: ${JSON.stringify(failures)}`,
    );
  }

  console.error(JSON.stringify(failures, null, 2));
  throw new Error(
    'ISSUE_21225_REPRODUCED: TUI Backspace submitted a partial grapheme cluster',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
