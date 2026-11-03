import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  let requestCount = 0;
  const google = createGoogle({
    fetch: async (url, options) => {
      if (options?.method === 'POST') {
        requestCount++;
        console.log(`Foreground request ${requestCount}`);
      }
      return fetch(url, options);
    },
  });

  // Non-streaming hops are capped at 32,768 thinking + output tokens.
  // Request at least 60,000 words so completing the task requires continuation.
  const result = await generateText({
    model: google.interactions('gemini-4-argon'),
    prompt: `Write a comprehensive database engineering handbook containing
exactly 400 numbered sections, from Section 001 through Section 400.

Every section must contain at least 150 words of substantive prose, excluding
its heading. The complete handbook must therefore contain at least 60,000 words.
Include concrete implementation details, examples, and tradeoffs in each section.

Cover storage engines, page layouts, buffer pools, B-trees, LSM trees, indexing,
query parsing, query planning, execution, joins, transactions, concurrency control,
write-ahead logging, recovery, replication, sharding, distributed consensus,
backups, testing, performance, observability, and operational failure scenarios.

Write the full handbook in this response. Start directly with Section 001.
Do not provide an outline, summarize later sections, use placeholders, skip
section numbers, or ask me to request the next part. Keep writing full sections
until you have completed Section 400.`,
    maxOutputTokens: 262_144,
    // Disable request retries so the request count clearly shows continuation.
    maxRetries: 0,
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Raw finish reason:', result.finalStep.rawFinishReason);
  console.log('Foreground requests:', requestCount);
  console.log('Automatic continuation hops:', Math.max(0, requestCount - 1));
});
