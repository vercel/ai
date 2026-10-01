import { createGoogle } from '@ai-sdk/google';
import assert from 'node:assert/strict';
import { convertToModelMessages, generateText } from 'ai';

type GoogleRequestBody = {
  contents?: Array<{
    role?: string;
    parts?: unknown[];
  }>;
};

async function main() {
  let requestBody: GoogleRequestBody | undefined;

  const google = createGoogle({
    fetch: async (url, options) => {
      const body = options?.body;
      if (typeof body !== 'string') {
        throw new Error('Expected Google request body to be a JSON string');
      }
      requestBody = JSON.parse(body) as GoogleRequestBody;
      return globalThis.fetch(url, options);
    },
  });

  const messages = await convertToModelMessages([
    {
      role: 'user',
      parts: [{ type: 'text', text: 'send the report' }],
    },
    {
      role: 'user',
      parts: [{ type: 'text', text: 'try again please' }],
    },
  ]);

  assert.deepEqual(
    messages.map(message => message.role),
    ['user', 'user'],
    'convertToModelMessages must preserve the reported consecutive user turns',
  );

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    messages,
  });

  assert.deepEqual(
    requestBody?.contents?.map(content => content.role),
    ['user', 'user'],
    'the live request must contain the reported consecutive user contents',
  );

  console.log(
    'Issue #15950 could not be reproduced: Gemini accepted consecutive user contents.',
  );
  console.log(`Response: ${result.text}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
