import { generateText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

async function main() {
  const result = await generateText({
    model: openai.chat({ id: 'gpt-3.5-turbo' }),
    tools: [weatherTool],
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(JSON.stringify(result, null, 2));
}

main();
