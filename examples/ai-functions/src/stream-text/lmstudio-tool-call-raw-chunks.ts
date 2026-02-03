import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';
import { weatherTool } from '../tools/weather-tool';

const lmstudio = createOpenResponses({
  name: 'lmstudio',
  url: 'http://localhost:1234/v1/responses',
});

run(async () => {
  const result = streamText({
    model: lmstudio('zai-org/glm-4.7-flash'),
    tools: {
      weather: weatherTool,
    },
    toolChoice: 'required',
    prompt: 'What is the weather in San Francisco?',
    includeRawChunks: true,
  });

  await saveRawChunks({ result, filename: 'lmstudio-tool-call' });
});
