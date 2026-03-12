import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      console.log('Tool call:', part.toolName, JSON.stringify(part.input));
    }
    if (part.type === 'tool-result') {
      console.log('Tool result:', part.toolName, JSON.stringify(part.output));
    }
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Usage:', await result.usage);
});
