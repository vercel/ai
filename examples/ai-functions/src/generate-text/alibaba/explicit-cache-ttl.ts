import {
  alibaba,
  type AlibabaLanguageModelChatOptions,
  type AlibabaUsage,
} from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import { run } from '../../lib/run';

/**
 * Demonstrates a 1-hour explicit cache with automatic caching. The cached
 * prefix must contain at least 1,024 tokens.
 */

run(async () => {
  const longDocument = 'Paris is the capital of France. '.repeat(400);

  for (const question of [
    'Summarize this document.',
    'What is the capital of France?',
  ]) {
    const result = await generateText({
      model: alibaba('qwen4-max'),
      providerOptions: {
        alibaba: {
          enableThinking: false,
          promptCacheOptions: { mode: 'implicit', ttl: '1h' },
        } satisfies AlibabaLanguageModelChatOptions,
      },
      messages: [
        { role: 'user', content: longDocument },
        { role: 'assistant', content: 'I have read the document.' },
        { role: 'user', content: question },
      ],
    });

    const raw = result.finalStep.usage.raw as AlibabaUsage | undefined;

    console.log('Question:', question);
    console.log('Text:', result.text.substring(0, 80));
    console.log(
      'Cache read tokens:',
      result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    );
    console.log(
      'Cache write tokens:',
      result.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    );
    console.log(
      'Cache writes by TTL:',
      raw?.prompt_tokens_details?.cache_creation,
    );
    console.log();
  }
});
