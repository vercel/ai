import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, generateText, tool } from 'ai';
import { z } from 'zod';

const FAILURE_SIGNAL =
  "ISSUE_18997_REPRODUCED: OpenAI rejected the SDK's built-in web_search allow-list entry";

async function main() {
  let capturedRequest:
    | {
        input: Parameters<typeof fetch>[0];
        init?: Parameters<typeof fetch>[1];
        body: Record<string, unknown>;
      }
    | undefined;

  const openai = createOpenAI({
    fetch: async (input, init) => {
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};

      capturedRequest = { input, init, body };
      return fetch(input, init);
    },
  });

  try {
    await generateText({
      model: openai.responses('gpt-5.5'),
      tools: {
        weather: tool({
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
      prompt: 'Use web search to find the current weather in San Francisco.',
    });

    console.log(
      'Issue 18997 is fixed: OpenAI accepted the SDK-generated allow-list.',
    );
    return;
  } catch (error) {
    if (
      !APICallError.isInstance(error) ||
      error.statusCode !== 400 ||
      !error.responseBody?.includes(
        "Tool choice 'web_search' not found in 'tools' parameter.",
      )
    ) {
      throw error;
    }

    if (capturedRequest == null) {
      throw new Error('The OpenAI request was not captured.');
    }

    const tools = capturedRequest.body.tools as
      | Array<Record<string, unknown>>
      | undefined;
    const toolChoice = capturedRequest.body.tool_choice as
      | {
          tools?: Array<Record<string, unknown>>;
        }
      | undefined;

    const declaredWebSearch = tools?.some(tool => tool.type === 'web_search');
    const malformedAllowedWebSearch = toolChoice?.tools?.some(
      entry => entry.type === 'function' && entry.name === 'web_search',
    );

    if (!declaredWebSearch || !malformedAllowedWebSearch) {
      throw new Error(
        'The provider error occurred without the reported SDK request shape.',
      );
    }

    const correctedBody = structuredClone(capturedRequest.body) as {
      tool_choice: {
        tools: Array<Record<string, unknown>>;
      };
    };
    correctedBody.tool_choice.tools = correctedBody.tool_choice.tools.map(
      entry =>
        entry.type === 'function' && entry.name === 'web_search'
          ? { type: 'web_search' }
          : entry,
    );

    const correctedResponse = await fetch(capturedRequest.input, {
      ...capturedRequest.init,
      body: JSON.stringify(correctedBody),
    });

    if (!correctedResponse.ok) {
      throw new Error(
        `The direct corrected OpenAI request failed with HTTP ${correctedResponse.status}: ${await correctedResponse.text()}`,
      );
    }

    console.error(`Live OpenAI error response: ${error.responseBody}`);
    console.error(FAILURE_SIGNAL);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
