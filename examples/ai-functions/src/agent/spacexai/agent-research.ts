import { spacexai } from '@ai-sdk/spacexai';
import { ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

const agent = new ToolLoopAgent({
  model: spacexai.responses('grok-4-fast-non-reasoning'),
  instructions: 'you are a helpful research assistant',
  tools: {
    web_search: spacexai.tools.webSearch(),
    x_search: spacexai.tools.xSearch(),
    code_execution: spacexai.tools.codeExecution(),
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'research prompt caching in llms and explain how it reduces costs',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
