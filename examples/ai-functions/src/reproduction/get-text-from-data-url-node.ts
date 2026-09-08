import { getTextFromDataUrl } from 'ai';

const failureSignal =
  'ISSUE_20348_REPRODUCED: valid Node.js data URL did not decode to "hi"';

async function main() {
  let decodedText: string;

  try {
    decodedText = getTextFromDataUrl('data:text/plain;base64,aGk=');
  } catch (error) {
    console.error(failureSignal);
    console.error(
      `Observed error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  if (decodedText !== 'hi') {
    console.error(failureSignal);
    console.error(`Observed decoded text: ${JSON.stringify(decodedText)}`);
    process.exitCode = 1;
    return;
  }

  console.log('Decoded valid Node.js data URL to "hi".');
}

main().catch(error => {
  console.error('Unexpected reproduction harness failure:', error);
  process.exitCode = 1;
});
