import { createGoogle } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

type GoogleRequestBody = {
  generationConfig?: {
    thinkingConfig?: unknown;
  };
  toolConfig?: unknown;
  tools?: unknown;
};

let requestBody: GoogleRequestBody | undefined;

// Use a synthetic response because gemini-99 is deliberately chosen to remain
// an unknown future-model fixture as new Gemini generations are released.
const google = createGoogle({
  apiKey: 'not-used',
  fetch: async (_url, options) => {
    requestBody = (await new Response(
      options?.body as BodyInit,
    ).json()) as GoogleRequestBody;

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'Request prepared successfully.' }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    );
  },
});

run(async () => {
  const { text } = await generateText({
    model: google('gemini-99-pro-preview'),
    prompt: 'Research a city and prepare a weather summary.',
    reasoning: 'high',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city.',
        inputSchema: z.object({ city: z.string() }),
      }),
      google_search: google.tools.googleSearch({}),
      url_context: google.tools.urlContext({}),
      code_execution: google.tools.codeExecution({}),
      file_search: google.tools.fileSearch({
        fileSearchStoreNames: ['fileSearchStores/example-store'],
      }),
    },
  });

  console.log(text);
  console.log(
    JSON.stringify(
      {
        thinkingConfig: requestBody?.generationConfig?.thinkingConfig,
        tools: requestBody?.tools,
        toolConfig: requestBody?.toolConfig,
      },
      null,
      2,
    ),
  );
});
