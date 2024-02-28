import { streamText } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai.chat({ id: 'gpt-3.5-turbo' }),
    tools: [weatherTool],
    prompt: 'What is the weather in San Francisco?',
  });

  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part, null, 2));
  }
}

main();
