import { gateway, isStepCount, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'openai/gpt-5.4-nano',
    prompt:
      'Find recent reporting on US inflation, read the passages of the most relevant article that discuss the next Fed meeting, and summarize them.',
    tools: {
      tako_search: gateway.tools.takoSearch({ sources: { web: { count: 5 } } }),
      tako_contents: gateway.tools.takoContents(),
    },
    stopWhen: isStepCount(5),
  });

  for await (const part of result.stream) {
    switch (part.type) {
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'tool-call':
        console.log('\nTool call:', JSON.stringify(part, null, 2));
        break;
      case 'tool-result':
        console.log('\nTool result:', JSON.stringify(part, null, 2));
        break;
      case 'tool-error':
        console.log('\nTool error:', JSON.stringify(part, null, 2));
        break;
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
