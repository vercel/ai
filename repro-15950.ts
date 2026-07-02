import { generateText, convertToModelMessages } from 'ai';
import { createGoogle } from '@ai-sdk/google';

async function main() {
  const messages = [
    { role: 'user', parts: [{ type: 'text', text: 'send the report' }] },
    { role: 'user', parts: [{ type: 'text', text: 'try again please' }] },
  ];

  let capturedBody: unknown;
  const google = createGoogle({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        capturedBody = JSON.parse(init.body);
        console.log('REQUEST_CONTENTS=' + JSON.stringify((capturedBody as any).contents));
      }
      return fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      messages: await convertToModelMessages(messages as any),
      maxOutputTokens: 128,
    });
    console.log('RESULT_TEXT=' + JSON.stringify(result.text));
    console.log('STATUS=success');
  } catch (error) {
    console.log('STATUS=error');
    console.log('ERROR_NAME=' + (error as any)?.name);
    console.log('ERROR_MESSAGE=' + (error as any)?.message);
    console.log('ERROR_TEXT=' + (error as any)?.responseBody);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
