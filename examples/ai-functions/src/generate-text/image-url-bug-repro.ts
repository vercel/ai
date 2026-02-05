import { anthropic } from '@ai-sdk/anthropic';
import { generateText, convertToModelMessages, UIMessage, tool } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

const weatherTool = tool({
  description: 'Get the current weather for a location',
  inputSchema: z.object({
    location: z.string().describe('The city and country'),
  }),
  execute: async ({ location }) => {
    return { temperature: 22, condition: 'sunny', location };
  },
});

async function main() {
  const gcsImageUrl =
    'https://uakbpaijetdfixvc.public.blob.vercel-storage.com/test-images/sunlit_lounge.png';
  const uiMessages: UIMessage[] = [];

  uiMessages.push({
    id: 'msg-1',
    role: 'user',
    parts: [
      { type: 'text', text: 'Describe this image briefly.' },
      {
        type: 'file',
        url: gcsImageUrl,
        mediaType: 'image/png',
        filename: 'test-image.png',
      },
    ],
  });

  const modelMessages1 = await convertToModelMessages(uiMessages);
  console.log('Converted messages:', JSON.stringify(modelMessages1, null, 2));

  const result1 = await generateText({
    model: 'anthropic/claude-sonnet-4.5',
    messages: modelMessages1,
    tools: { weather: weatherTool },
  });
  console.log('Response 1:', result1.text);

  uiMessages.push({
    id: 'msg-2',
    role: 'assistant',
    parts: [{ type: 'text', text: result1.text }],
  });

  for (let turn = 2; turn <= 10; turn++) {
    uiMessages.push({
      id: `msg-user-${turn}`,
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `Follow-up question ${turn - 1}: What else can you tell me?`,
        },
      ],
    });

    const modelMessages = await convertToModelMessages(uiMessages);
    console.log(
      `Turn ${turn} - messages history`,
      JSON.stringify(modelMessages, null, 2),
    );

    const result = await generateText({
      model: 'anthropic/claude-sonnet-4.5',
      messages: modelMessages,
      tools: { weather: weatherTool },
    });
    console.log(`Response ${turn}:`, result.text);

    uiMessages.push({
      id: `msg-asst-${turn}`,
      role: 'assistant',
      parts: [{ type: 'text', text: result.text }],
    });
  }
}

main().catch(console.error);
