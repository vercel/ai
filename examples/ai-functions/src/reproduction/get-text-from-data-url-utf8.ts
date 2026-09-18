import { getTextFromDataUrl, InvalidArgumentError } from 'ai';

const utf8Cases = [
  ['two-byte character', 'café'],
  ['three-byte characters', '日本語'],
  ['four-byte character', 'emoji 🙂'],
  ['combining mark', 'Cafe\u0301'],
  ['multiline text', 'first line\ncafé\n日本語 🙂'],
  ['markdown', '# Café\n\n日本語 **🙂**'],
] as const;

function toDataUrl(text: string, charset = 'utf-8') {
  return `data:text/plain;charset=${charset};base64,${Buffer.from(
    text,
    charset === 'iso-8859-1' ? 'latin1' : 'utf8',
  ).toString('base64')}`;
}

function assertControl(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Control assertion failed: ${message}`);
  }
}

function assertInvalidInput(dataUrl: string, expectedMessage: string): void {
  try {
    getTextFromDataUrl(dataUrl);
  } catch (error) {
    if (!InvalidArgumentError.isInstance(error)) {
      throw new Error(
        `Control assertion failed: ${JSON.stringify(
          dataUrl,
        )} should throw InvalidArgumentError`,
      );
    }

    assertControl(
      error.message.includes(expectedMessage),
      `${JSON.stringify(dataUrl)} should report ${JSON.stringify(expectedMessage)}`,
    );
    return;
  }

  throw new Error(
    `Control assertion failed: ${JSON.stringify(dataUrl)} should throw`,
  );
}

async function main() {
  assertControl(
    getTextFromDataUrl(toDataUrl('hi')) === 'hi',
    'ASCII with charset=utf-8 should remain unchanged',
  );
  assertControl(
    getTextFromDataUrl('data:text/plain;base64,aGk=') === 'hi',
    'ASCII without an explicit charset should remain unchanged',
  );
  assertControl(
    getTextFromDataUrl('data:text/plain;charset=utf-8;base64,') === '',
    'empty text should remain empty',
  );
  assertControl(
    getTextFromDataUrl(toDataUrl('café', 'iso-8859-1')) === 'café',
    'explicitly declared Latin-1 text should retain its current behavior',
  );
  assertInvalidInput('not-a-data-url', 'Invalid data URL format');
  assertInvalidInput(
    'data:text/plain;base64,invalid-base64',
    'Error decoding data URL',
  );

  const failures = utf8Cases.flatMap(([name, expected]) => {
    const dataUrl = toDataUrl(expected);
    const actual = getTextFromDataUrl(dataUrl);

    return actual === expected ? [] : [{ name, expected, actual, dataUrl }];
  });

  if (failures.length > 0) {
    console.error(
      'ISSUE #21097 REPRODUCED: getTextFromDataUrl corrupted UTF-8 base64 text',
    );

    for (const failure of failures) {
      console.error(
        `${failure.name}: expected ${JSON.stringify(
          failure.expected,
        )}, received ${JSON.stringify(failure.actual)} (${failure.dataUrl})`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    'PASS: getTextFromDataUrl decoded all UTF-8 base64 text correctly',
  );
}

main().catch(error => {
  console.error('REPRODUCTION HARNESS FAILURE', error);
  process.exitCode = 2;
});
