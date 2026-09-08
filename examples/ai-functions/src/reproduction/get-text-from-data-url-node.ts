import { getTextFromDataUrl } from '../../../../packages/ai/src/index';

async function main() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Reproduction must run in Node.js without a window global.',
    );
  }

  if (typeof globalThis.atob !== 'function') {
    throw new Error('Reproduction requires the Node.js atob global.');
  }

  let result: string;

  try {
    result = getTextFromDataUrl('data:text/plain;base64,aGk=');
  } catch (error) {
    throw new Error(
      'ISSUE #20348 REPRODUCED: valid Node.js data URL threw instead of returning "hi".',
      { cause: error },
    );
  }

  if (result !== 'hi') {
    throw new Error(
      `Expected getTextFromDataUrl to return "hi", received ${JSON.stringify(result)}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
