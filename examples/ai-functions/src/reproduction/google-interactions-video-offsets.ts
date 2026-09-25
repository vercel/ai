import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  let requestProcessing: unknown;
  let responseStatus: number | undefined;
  let responseBody: string | undefined;

  const google = createGoogle({
    fetch: async (input, init) => {
      if (input.toString().endsWith('/interactions')) {
        const body = JSON.parse(init?.body as string);
        requestProcessing = body.input?.[0]?.content?.[0]?.processing;
      }

      const response = await fetch(input, init);

      if (input.toString().endsWith('/interactions')) {
        responseStatus = response.status;
        responseBody = await response.clone().text();
      }

      return response;
    },
  });

  try {
    await generateText({
      model: google.interactions('gemini-3.8-flash'),
      maxOutputTokens: 20,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: await readFile('data/prudence.mp4'),
              providerOptions: {
                google: {
                  processing: {
                    type: 'static',
                    startOffset: 0,
                    endOffset: 3,
                    fps: 24,
                  },
                },
              },
            },
            {
              type: 'text',
              text: 'Briefly describe this video.',
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (
      responseStatus === 400 &&
      responseBody?.includes(
        "Invalid input at 'input[0].content[0].processing'",
      )
    ) {
      console.error(
        'Google Interactions rejected AI SDK numeric video offsets with HTTP 400.',
      );
      console.error(JSON.stringify({ requestProcessing, responseBody }));
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log('Google Interactions accepted the AI SDK video offsets.');
}

main();
