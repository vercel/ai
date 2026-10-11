import { toUIMessageStream } from '../../../../packages/llamaindex/dist/index.js';

type Case = {
  name: string;
  chunks: string[];
};

const cases: Case[] = [
  {
    name: 'spaces split across chunks',
    chunks: ['    ', 'return value\n'],
  },
  {
    name: 'leading tab',
    chunks: ['\t', 'return value\n'],
  },
  {
    name: 'leading newlines split across chunks',
    chunks: ['\n', '\nreturn value\n'],
  },
  {
    name: 'ordinary prose',
    chunks: ['return value\n'],
  },
];

async function* source(chunks: string[]) {
  for (const delta of chunks) {
    yield { delta };
  }
}

async function collectText(stream: ReadableStream) {
  let text = '';

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      text += chunk.delta;
    }
  }

  return text;
}

async function main() {
  const failures: string[] = [];

  for (const testCase of cases) {
    const expected = testCase.chunks.join('');
    let callbackText = '';
    let finalText = '';
    const options = {
      trimStart: false as const,
      onText: (text: string) => {
        callbackText += text;
      },
      onFinal: (text: string) => {
        finalText = text;
      },
    };

    const uiText = await collectText(
      toUIMessageStream(source(testCase.chunks), options),
    );

    if (
      uiText !== expected ||
      callbackText !== expected ||
      finalText !== expected
    ) {
      failures.push(
        `${testCase.name}: expected ${JSON.stringify(expected)}, UI received ${JSON.stringify(uiText)}, onText received ${JSON.stringify(callbackText)}, onFinal received ${JSON.stringify(finalText)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_22808: whitespace-preserving mode did not preserve exact source text\n${failures.join('\n')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
