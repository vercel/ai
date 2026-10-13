import { getTextFromDataUrl } from 'ai';

function toBase64(text: string, encoding: BufferEncoding = 'utf8') {
  return Buffer.from(text, encoding).toString('base64');
}

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrows(
  action: () => unknown,
  expectedMessage: string,
  label: string,
) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) {
      return;
    }

    throw new Error(
      `${label}: expected error ${JSON.stringify(expectedMessage)}, received ${String(error)}`,
    );
  }

  throw new Error(
    `${label}: expected error ${JSON.stringify(expectedMessage)}, but no error was thrown`,
  );
}

async function main() {
  const utf8Cases = [
    { label: 'two-byte character', text: 'café' },
    { label: 'three-byte characters', text: 'こんにちは' },
    { label: 'four-byte character', text: 'hello 🌍' },
    { label: 'combining mark', text: 'cafe\u0301' },
    { label: 'multiline text', text: 'first line\ncafé\n日本語 🌍' },
    { label: 'Markdown', text: '# Café\n\nこんにちは **🌍**' },
  ];

  // Controls from the report: ASCII, empty text, a declared single-byte
  // charset, the legacy no-charset behavior, and existing input errors.
  assertEqual(
    getTextFromDataUrl('data:text/plain;charset=utf-8;base64,aGk='),
    'hi',
    'ASCII control',
  );
  assertEqual(
    getTextFromDataUrl('data:text/plain;charset=utf-8;base64,'),
    '',
    'empty text control',
  );
  assertEqual(
    getTextFromDataUrl(
      `data:text/plain;charset=iso-8859-1;base64,${toBase64('café', 'latin1')}`,
    ),
    'café',
    'Latin-1 control',
  );
  assertEqual(
    getTextFromDataUrl(`data:text/plain;base64,${toBase64('café', 'utf8')}`),
    'cafÃ©',
    'no-charset compatibility control',
  );
  assertThrows(
    () => getTextFromDataUrl('not-a-data-url'),
    'Invalid data URL format',
    'malformed input control',
  );
  assertThrows(
    () => getTextFromDataUrl('data:text/plain;base64,%%invalid%%'),
    'Error decoding data URL',
    'invalid base64 control',
  );

  const corruptions: string[] = [];

  for (const testCase of utf8Cases) {
    const dataUrl =
      `data:text/plain;charset=utf-8;base64,` + toBase64(testCase.text);
    const actual = getTextFromDataUrl(dataUrl);
    const platformDecoded = await (await fetch(dataUrl)).text();

    assertEqual(
      platformDecoded,
      testCase.text,
      `${testCase.label} platform decoder`,
    );

    if (actual !== testCase.text) {
      corruptions.push(
        `${testCase.label}: expected ${JSON.stringify(testCase.text)}, received ${JSON.stringify(actual)}`,
      );
    }
  }

  if (corruptions.length > 0) {
    throw new Error(
      `ISSUE #21097 REPRODUCED: getTextFromDataUrl corrupted ${corruptions.length} valid UTF-8 base64 data URLs.\n${corruptions.join('\n')}`,
    );
  }

  console.log(
    `All ${utf8Cases.length} valid UTF-8 base64 data URLs decoded correctly.`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
