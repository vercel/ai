import { anthropic } from '@ai-sdk/anthropic';
import { experimental_createWebFetchTool as createWebFetchTool } from '@ai-sdk/tool-web-fetch';
import { generateText, isStepCount } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    tools: {
      webFetch: createWebFetchTool({
        // Anthropic supports PDF tool results, so pass the PDF to the model.
        pdf: 'file',
        allowedDomains: ['arxiv.org'],
        // Only fetch URLs from the conversation, not URLs the model made up.
        requireUrlInContext: true,
      }),
    },
    stopWhen: isStepCount(5),
    prompt:
      'Summarize the key contributions of the paper at https://arxiv.org/pdf/1706.03762.',
  });

  for (const toolResult of result.toolResults) {
    if (!toolResult.dynamic) {
      console.log('webFetch', toolResult.input, toolResult.output.type);
    }
  }

  console.log();
  console.log(result.text);
});
