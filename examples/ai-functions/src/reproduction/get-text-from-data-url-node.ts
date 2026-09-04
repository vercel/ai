import assert from 'node:assert/strict';
import { getTextFromDataUrl } from 'ai';

async function main() {
  const dataUrl = 'data:text/plain;base64,aGk=';
  let text: string;

  try {
    text = getTextFromDataUrl(dataUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Error decoding data URL' &&
      typeof window === 'undefined' &&
      typeof globalThis.atob === 'function'
    ) {
      throw new Error(
        'ISSUE #20348: valid text data URL throws in Node.js instead of returning "hi"',
      );
    }

    throw error;
  }

  assert.equal(
    text,
    'hi',
    'ISSUE #20348: valid text data URL did not decode to "hi"',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
