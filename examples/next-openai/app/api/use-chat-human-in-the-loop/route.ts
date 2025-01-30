import { openai } from '@ai-sdk/openai';
import {
  createDataStreamResponse,
  formatDataStreamPart,
  streamText,
  tool,
  ToolInvocation,
} from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createDataStreamResponse({
    execute: async dataStream => {
      const lastMessage = messages[messages.length - 1];
      lastMessage.toolInvocations = await Promise.all(
        lastMessage.toolInvocations?.map(
          async (toolInvocation: ToolInvocation) => {
            if (
              toolInvocation.toolName !== 'getWeatherInformation' ||
              toolInvocation.state !== 'result'
            ) {
              return toolInvocation;
            }

            switch (toolInvocation.result) {
              case 'Yes, confirmed.': {
                const result = await executeWeatherTool(toolInvocation.args);

                // forward updated tool result to the client:
                dataStream.write(
                  formatDataStreamPart('tool_result', {
                    toolCallId: toolInvocation.toolCallId,
                    result,
                  }),
                );

                // update the messages:
                return { ...toolInvocation, result };
              }
              case 'No, denied.': {
                const result =
                  'Error: User denied access to weather information';

                // forward updated tool result to the client:
                dataStream.write(
                  formatDataStreamPart('tool_result', {
                    toolCallId: toolInvocation.toolCallId,
                    result,
                  }),
                );

                // update the messages:
                return { ...toolInvocation, result };
              }
              default:
                return toolInvocation;
            }
          },
        ) ?? [],
      );

      const result = streamText({
        model: openai('gpt-4o'),
        messages,
        tools: {
          // server-side tool with human in the loop:
          getWeatherInformation: tool({
            description: 'show the weather in a given city to the user',
            parameters: z.object({ city: z.string() }),
            // no execute function, we want human in the loop
          }),
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}

async function executeWeatherTool({}: { city: string }) {
  const weatherOptions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
  return weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
}
