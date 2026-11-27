import { writeFile } from 'node:fs/promises';
import { gateway, generateText, isStepCount } from 'ai';
import { guardedFetch } from 'guarded-fetch';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.4-nano',
    prompt:
      'Find a Tako card for US monthly unemployment since 1990 and export its data.',
    tools: {
      tako_search: gateway.tools.takoSearch(),
      tako_contents: gateway.tools.takoContents({
        // A download link keeps a long export out of the model's context.
        mode: 'url',
        contentFormat: 'csv',
        maxRows: 10_000,
        maxCostUsd: 0.5,
      }),
    },
    stopWhen: isStepCount(3),
  });

  for (const step of result.steps) {
    for (const part of step.content) {
      // A call quoted above maxCostUsd fails here; the error may include the quote.
      if (part.type === 'tool-error') console.error('Tool error:', part.error);
    }
    for (const toolResult of step.toolResults) {
      if (toolResult.dynamic || toolResult.toolName !== 'tako_contents') {
        continue;
      }

      const { output } = toolResult;
      if ('error' in output) continue;

      for (const item of output.contents ?? []) {
        if (item.delivery !== 'url' || !item.url) continue;

        // The link comes from a tool result, so fetch it as untrusted input.
        const response = await guardedFetch(item.url, {
          httpsOnly: true,
          timeoutMs: 30_000,
        });
        if (!response.ok) {
          await response.body?.cancel();
          console.error(`Download failed with HTTP ${response.status}`);
          continue;
        }
        const path = `tako-${output.request_id}.csv`;
        await writeFile(path, await response.text());
        console.log(
          `Saved ${item.total_rows} rows from ${item.source_url} to ${path}`,
        );
      }
      console.log('Total cost (USD):', output.usage?.total_cost_usd);
    }
  }

  console.log();
  console.log('Text:', result.text);
  console.log('Token usage:', result.usage);
}

main().catch(console.error);
