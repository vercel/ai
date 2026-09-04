import { alibaba, type AlibabaUsage } from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { run } from '../../lib/run';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

run(async () => {
  const longUserContent = readFileSync(
    join(__dirname, '../../../data/compaction-data.txt'),
    'utf-8',
  );

  console.log('Request with part-level cache_control on user message...\n');

  const result = await generateText({
    model: alibaba('qwen-plus'),
    instructions: 'You are a helpful assistant.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: longUserContent + '\n\nSummarize the above in one sentence.',
            providerOptions: {
              alibaba: {
                cache_control: { type: 'ephemeral' },
              },
            },
          },
        ],
      },
    ],
  });

  console.log('Text:', result.text.substring(0, 50) + '...');
  console.log('Usage:', result.usage);

  // `raw` is per-step: the top-level `usage` sums steps and drops it.
  const raw = result.finalStep.usage.raw as AlibabaUsage | undefined;
  const cacheCreated = result.usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const cacheHit = result.usage.inputTokenDetails?.cacheReadTokens ?? 0;

  console.log();
  console.log('cache_type:', raw?.prompt_tokens_details?.cache_type);
  if (cacheCreated > 0 || cacheHit > 0) {
    console.log(
      `SUCCESS: Part-level cache_control was applied (created: ${cacheCreated}, hit: ${cacheHit})`,
    );
  } else {
    console.log(
      'FAILED: Part-level cache_control was not applied - cache_control likely dropped by shortcut path',
    );
  }
});
