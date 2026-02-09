import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool, jsonSchema } from 'ai';
import { weatherTool } from '../tools/weather-tool';
import 'dotenv/config';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    tools: {
      bash: bedrock.tools.bash_20241022({
        async execute({ command }) {
          return [{ type: 'text', text: `ran: ${command}` }];
        },
      }),
      weather: weatherTool,
    },
    prompt: 'What is the weather in Tokyo?',
    maxRetries: 0,
  });

  console.log('Text:', result.text);
  console.log('Warnings:', JSON.stringify(result.warnings, null, 2));
  console.log('Finish reason:', result.finishReason);
});
