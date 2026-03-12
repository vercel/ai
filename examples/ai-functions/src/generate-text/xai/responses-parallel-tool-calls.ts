import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    tools: { weather: weatherTool },
    providerOptions: {
      xai: {
        parallelToolCalls: true,
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt:
      'What is the weather in San Francisco and New York? Call the tool for each city separately.',
  });

  console.log('Text:', result.text);
  console.log('Tool Calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool Results:', JSON.stringify(result.toolResults, null, 2));
});
