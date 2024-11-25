import { google } from '@ai-sdk/google';
import { generateObject, generateText, NoSuchToolError, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = await generateText({
    model: google('gemini-1.5-flash'),
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        parameters: z.object({ city: z.string() }),
      }),
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',

    experimental_repairToolCall: async ({
      toolCall,
      tools,
      error,
      messages,
      system,
    }) => {
      if (NoSuchToolError.isInstance(error)) {
        return null; // do not attempt to fix invalid tool names
      }

      const tool = tools[toolCall.toolName as keyof typeof tools];

      // attempt to repair the tool call arguments
      const repairedArgs = await generateObject({
        model: google('gemini-1.5-pro'), // use a more powerful model to attempt to repair the tool call arguments
        schema: z.object({ args: z.string() }),
        prompt: [
          `The model tried to call the tool "${
            toolCall.toolName
          }" with the following arguments: ${JSON.stringify(toolCall.args)}.`,
          // TODO get correct json schema string
          `The tool accepts the following schema: ${tool?.parameters}.`,
          'Please try to fix the arguments.',
        ].join('\n'),
      });

      return {
        ...toolCall,
        args: repairedArgs.object.args,
      };
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
