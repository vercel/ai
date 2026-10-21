import { openai } from '@ai-sdk/openai';
import { experimental_createWebFetchTool as createWebFetchTool } from '@ai-sdk/tool-web-fetch';
import { generateText, isStepCount } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-6-astra'),
    tools: { webFetch: createWebFetchTool() },
    stopWhen: isStepCount(5),
    prompt:
      'Read https://ai-sdk.dev/docs/introduction and summarize what the AI SDK is in three bullet points.',
  });

  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.dynamic) {
        continue;
      }

      const output = toolResult.output;
      console.log('webFetch', toolResult.input);

      if (output.type === 'document') {
        console.log(
          `${output.contentType}, ${output.totalLength} characters:\n`,
        );
        console.log(output.content);
      } else {
        console.log(output);
      }
    }
  }

  console.log();
  console.log(result.text);
});
