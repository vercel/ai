import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const failureSignal =
  "ISSUE_18997_REPRODUCED: OpenAI rejected the SDK's built-in web_search allow-list entry";

async function main() {
  try {
    const result = await generateText({
      model: openai.responses('gpt-5.5'),
      tools: {
        weather: tool({
          description: 'Get weather for a city',
          inputSchema: z.object({ city: z.string() }),
        }),
        search: openai.tools.webSearch(),
      },
      providerOptions: {
        openai: {
          allowedTools: {
            toolNames: ['weather', 'search'],
            mode: 'auto',
          },
        },
      },
      prompt: 'Reply with exactly OK. Do not call any tool.',
      maxRetries: 0,
    });

    if (result.text.trim().length === 0) {
      throw new Error(
        'OpenAI returned an empty response after accepting the request.',
      );
    }

    console.log('OpenAI accepted function and web_search allowedTools.');
  } catch (error) {
    const apiError = error as {
      message?: string;
      statusCode?: number;
    };

    if (
      apiError.statusCode === 400 &&
      apiError.message ===
        "Tool choice 'web_search' not found in 'tools' parameter."
    ) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
