import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5-nano',
    prompt: 'United States vs China inflation rate',
    tools: {
      tako_search: gateway.tools.takoSearch({
        effort: 'fast',
        sources: {
          data: {
            contentFormat: 'json_compact',
            includeContents: true,
            maxRows: 100,
          },
          web: {
            count: 3,
          },
        },
        countryCode: 'US',
        locale: 'en-US',
      }),
    },
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Reasoning:', result.reasoning);
  console.log();
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));

  for (const toolResult of result.toolResults) {
    if (toolResult.dynamic) continue;

    const { output } = toolResult;
    if ('error' in output) continue;

    for (const web of output.web_results ?? []) {
      console.log(`${web.source_name} - ${web.url}`);
    }

    for (const card of output.cards ?? []) {
      const dataset = card.content?.dataset;
      if (!dataset) continue;
      console.log(
        card.title,
        dataset.columns.map(c => (c.unit ? `${c.name} (${c.unit})` : c.name)),
        `${dataset.rows.length} of ${dataset.total_rows} rows`,
      );
    }
  }
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
