import { experimental_createWebFetchTool as createWebFetchTool } from '@ai-sdk/tool-web-fetch';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const agent = new ToolLoopAgent({
    model: 'openai/gpt-6-astra',
    tools: { webFetch: createWebFetchTool() },
    stopWhen: isStepCount(10),
  });

  const result = await agent.generate({
    prompt:
      'Read https://ai-sdk.dev/docs/introduction and summarize what the AI SDK is in three bullet points.',
  });

  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.dynamic) {
        continue;
      }

      const output = toolResult.output;
      console.log(
        'webFetch',
        toolResult.input,
        output.type === 'document'
          ? `${output.contentType}, ${output.totalLength} characters`
          : output,
      );
    }
  }

  console.log();
  console.log(result.text);
});
