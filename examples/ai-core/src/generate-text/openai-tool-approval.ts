import { openai } from '@ai-sdk/openai';
import { generateText, ModelMessage, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
  needsApproval: true,
});

async function main() {
  const messages: ModelMessage[] = [
    { role: 'user', content: 'What is the weather in San Francisco?' },
  ];

  const result = await generateText({
    model: openai('gpt-5-mini'),
    tools: { weather: weatherTool },
    messages,
  });

  console.log(JSON.stringify(result.content, null, 2));
  console.log(JSON.stringify(result.response.messages, null, 2));

  messages.push(...result.response.messages);

  // (messages[1].content[1] as any).approvalState = 'approved';

  // console.log(JSON.stringify(messages, null, 2));

  // const result2 = await generateText({
  //   model: openai('gpt-5-mini'),
  //   tools: { weather: weatherTool },
  //   messages,
  // });

  // console.log(JSON.stringify(result2.content, null, 2));
}

main().catch(console.error);
