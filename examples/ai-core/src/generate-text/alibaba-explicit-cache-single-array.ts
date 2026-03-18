import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const longUserContent = readFileSync(
    join(__dirname, '../../data/anthropic-compaction-data.txt'),
    'utf-8',
  );

  console.log('Request with part-level cache_control on user message...\n');

  const result = await generateText({
    model: alibaba('qwen-plus'),
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: longUserContent + '\n\nSummarize the above in one sentence.',
            providerOptions: {
              alibaba: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
      },
    ],
  });

  console.log('Text:', result.text.substring(0, 50) + '...');
  console.log('Usage:', result.usage);

  const cacheCreated = (result.providerMetadata?.alibaba
    ?.cacheCreationInputTokens ?? 0) as number;
  const cacheHit = result.usage.cachedInputTokens ?? 0;

  console.log(`Cache created: ${cacheCreated}`);
  console.log(`Cache hit: ${cacheHit}`);

  console.log();
  if (cacheCreated > 0 || cacheHit > 0) {
    console.log(
      `SUCCESS: Part-level cache_control was applied (created: ${cacheCreated}, hit: ${cacheHit})`,
    );
  } else {
    console.log(
      'FAILED: Part-level cache_control was not applied - cache_control likely dropped by shortcut path',
    );
  }
}

main().catch(console.error);
