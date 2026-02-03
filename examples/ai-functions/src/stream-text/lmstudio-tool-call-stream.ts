import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText } from 'ai';
import { run } from '../lib/run';
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
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }
      case 'tool-call': {
        console.log(
          `\nTOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.input)}`,
        );
        break;
      }
      case 'tool-result': {
        console.log(
          `TOOL RESULT ${chunk.toolName} ${JSON.stringify(chunk.output)}`,
        );
        break;
      }
      case 'finish-step': {
        console.log();
        console.log('STEP FINISH', chunk.finishReason);
        break;
      }
      case 'finish': {
        console.log('FINISH', chunk.finishReason);
        break;
      }
      case 'error': {
        console.error('Error:', chunk.error);
        break;
      }
    }
  }
});
