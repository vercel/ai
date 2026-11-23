import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.4-nano',
    prompt: 'How much monthly web traffic does vercel.com get?',
    tools: {
      tako_search: gateway.tools.takoSearch({
        // Keep the data index in every search so variable-cost cards can appear.
        sources: { data: { count: 5 }, web: { count: 3 } },
        maxVariableCostUsd: 0.1,
      }),
    },
  });

  console.log('Text:', result.text);
  console.log();

  for (const toolResult of result.toolResults) {
    if (toolResult.dynamic) continue;

    const { output } = toolResult;
    if ('error' in output) continue;

    console.log('Total cost (USD):', output.usage?.total_cost_usd);
    console.log('Variable cost (USD):', output.usage?.variable_cost?.cost_usd);

    for (const card of output.cards ?? []) {
      if (card.placeholder) {
        const { reason, withheld_source } = card.placeholder;
        console.log(
          `[placeholder:${reason ?? 'not_served'}] ${card.title} (${withheld_source})`,
        );
        continue;
      }

      const maxCost = card.content?.export_pricing?.variable_cost_max_usd;
      if (maxCost != null) {
        console.log(`${card.title}: variable cost up to $${maxCost}`);
      }
    }
  }
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
