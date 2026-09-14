import { alibaba, type AlibabaLanguageModelChatOptions } from '@ai-sdk/alibaba';
import { streamText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

const providerOptions = {
  alibaba: {
    enableThinking: true,
    preserveThinking: true,
    thinkingBudget: 2048,
  } satisfies AlibabaLanguageModelChatOptions,
};

run(async () => {
  const opening: ModelMessage = {
    role: 'user',
    content:
      'Compare Apache Kafka and Apache RocketMQ for an online store that needs transactional and delayed messages. Think through the tradeoffs, but return only your recommendation in the final answer.',
  };

  const first = streamText({
    model: alibaba('qwen3.7-max'),
    messages: [opening],
    providerOptions,
  });

  for await (const part of first.stream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'error') {
      throw part.error;
    }
  }
  console.log();

  const firstUsage = await first.usage;
  console.log('Turn 1 usage:', firstUsage);
  console.log(
    'Turn 1 produced reasoning:',
    (firstUsage.outputTokenDetails.reasoningTokens ?? 0) > 0,
  );

  const messages: ModelMessage[] = [
    opening,
    ...(await first.responseMessages),
    {
      role: 'user',
      content:
        'Which tradeoff from your earlier reasoning mattered most? Answer in one sentence.',
    },
  ];

  const second = streamText({
    model: alibaba('qwen3.7-max'),
    messages,
    providerOptions,
  });

  for await (const part of second.stream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'error') {
      throw part.error;
    }
  }
  console.log();
  console.log('Turn 2 usage:', await second.usage);
});
