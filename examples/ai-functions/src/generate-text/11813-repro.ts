import { generateText, streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { stepCountIs } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  console.log('Step 1: Creating conversation via OpenAI API...');
  const createConvResponse = await fetch(
    'https://api.openai.com/v1/conversations',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );

  if (!createConvResponse.ok) {
    const errorText = await createConvResponse.text();
    throw new Error(
      `Failed to create conversation: ${createConvResponse.status} - ${errorText}`,
    );
  }

  const convData = await createConvResponse.json();
  const conversationId = convData.id;
  console.log(`Created conversation: ${conversationId}\n`);

  console.log('Step 2: Adding initial message to conversation...');
  const initial = await generateText({
    model: openai.responses('gpt-4o'),
    prompt: 'Hi, my name is Alice.',
    providerOptions: {
      openai: { conversation: conversationId },
    },
  });

  console.log('Step 3: Making request with tools');

  try {
    const result = await streamText({
      model: openai.responses('gpt-4o'),
      prompt: 'What is the current weather in San Francisco? Use the tool.',
      tools: {
        getWeather: tool({
          description: 'Get the current weather in a location',
          inputSchema: z.object({
            location: z.string().describe('The city to get weather for'),
          }),
          execute: async ({ location }) => {
            return { location, temperature: 68, condition: 'foggy' };
          },
        }),
      },
      stopWhen: stepCountIs(5),
      providerOptions: {
        openai: { conversation: conversationId },
      },
    });

    // Consume the stream
    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    console.log(`\nFinal response: "${fullText.substring(0, 100)}..."`);
  } catch (error: any) {
    console.log(error.message || error);
  }
});
