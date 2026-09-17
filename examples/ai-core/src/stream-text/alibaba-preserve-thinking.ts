import { alibaba, type AlibabaLanguageModelOptions } from '@ai-sdk/alibaba';
import { streamText, type ModelMessage } from 'ai';
import 'dotenv/config';

// qwen3.7-max supports preserved thinking, so prior reasoning is replayed as
// `reasoning_content` by default. Set `preserveThinking: false` to opt out.
const providerOptions = {
  alibaba: {
    enableThinking: true,
    thinkingBudget: 2048,
  } satisfies AlibabaLanguageModelOptions,
};

async function main() {
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

  for await (const part of first.fullStream) {
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
    (firstUsage.reasoningTokens ?? 0) > 0,
  );

  const messages: ModelMessage[] = [
    opening,
    ...(await first.response).messages,
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

  for await (const part of second.fullStream) {
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
}

main().catch(console.error);
