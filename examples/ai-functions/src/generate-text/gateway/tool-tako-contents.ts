import { gateway, generateText, isStepCount } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.4-nano',
    prompt:
      'Find a Tako card for Nvidia quarterly revenue, fetch its rows, and report the largest quarter-over-quarter increase.',
    tools: {
      tako_search: gateway.tools.takoSearch(),
      tako_contents: gateway.tools.takoContents(),
    },
    stopWhen: isStepCount(5),
  });

  console.log('Text:', result.text);
  console.log();

  for (const step of result.steps) {
    for (const part of step.content) {
      if (part.type === 'tool-error') console.error('Tool error:', part.error);
    }
    for (const toolResult of step.toolResults) {
      if (toolResult.dynamic || toolResult.toolName !== 'tako_contents') {
        continue;
      }

      const { output } = toolResult;
      if ('error' in output) continue;

      for (const item of output.contents ?? []) {
        console.log(
          `${item.source_url}: ${item.delivery}, ${item.total_rows ?? 0} rows`,
        );
      }
      console.log('Total cost (USD):', output.usage?.total_cost_usd);
    }
  }

  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
