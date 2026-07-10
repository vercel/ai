import { createGoogle } from '@ai-sdk/google';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs/promises';

const secret = 'ISSUE-17040-TEXT-FILE-ONLY-9f31c7';
const fixturePath =
  '../../packages/google/src/interactions/__fixtures__/issue-17040-text-reference.json';

async function main() {
  let interactionRequest: unknown;
  let interactionResponse: unknown;

  const google = createGoogle({
    fetch: async (input, init) => {
      const url = String(input);

      if (
        url.endsWith('/v1beta/interactions') &&
        typeof init?.body === 'string'
      ) {
        interactionRequest = JSON.parse(init.body);
      }

      const response = await fetch(input, init);

      if (url.endsWith('/v1beta/interactions')) {
        interactionResponse = await response.clone().json();
      }

      return response;
    },
  });

  const { providerReference } = await uploadFile({
    api: google.files(),
    data: new TextEncoder().encode(
      `The secret verification code is ${secret}.`,
    ),
    filename: 'issue-17040.txt',
    mediaType: 'text/plain',
  });

  const result = await generateText({
    model: google.interactions('gemini-3.5-flash'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Return only the secret verification code from the attached text document.',
          },
          {
            type: 'file',
            data: providerReference,
            mediaType: 'text/plain',
          },
        ],
      },
    ],
  });

  await fs.writeFile(
    fixturePath,
    `${JSON.stringify(interactionResponse, null, 2)}\n`,
  );

  const output = {
    providerReference,
    warnings: result.warnings,
    interactionRequest,
    responseText: result.text,
    expectedSecret: secret,
    responseContainsSecret: result.text.includes(secret),
    recordedFixture: fixturePath,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!result.text.includes(secret)) {
    throw new Error(
      'Reproduced issue #17040: the model could not read the uploaded text file because the ProviderReference file part was dropped.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
