import { alibaba, type AlibabaLanguageModelChatOptions } from '@ai-sdk/alibaba';
import { generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

// qwen3.7-max supports preserved thinking, so prior reasoning is replayed as
// `reasoning_content` by default. Set `preserveThinking: false` to opt out.
const providerOptions = {
  alibaba: {
    enableThinking: true,
    thinkingBudget: 2048,
  } satisfies AlibabaLanguageModelChatOptions,
};

run(async () => {
  const opening: ModelMessage = {
    role: 'user',
    content:
      'Compare Apache Kafka and Apache RocketMQ for an online store that needs transactional and delayed messages. Think through the tradeoffs, but return only your recommendation in the final answer.',
  };

  const first = await generateText({
    model: alibaba('qwen3.7-max'),
    messages: [opening],
    providerOptions,
  });

  console.log('Turn 1 reasoning:', first.finalStep.reasoningText);
  console.log('Turn 1 answer:', first.text);
  console.log('Turn 1 usage:', first.usage);
  console.log(
    'Turn 1 produced reasoning:',
    (first.usage.outputTokenDetails.reasoningTokens ?? 0) > 0,
  );

  const messages: ModelMessage[] = [
    opening,
    ...first.responseMessages,
    {
      role: 'user',
      content:
        'Which tradeoff from your earlier reasoning mattered most? Answer in one sentence.',
    },
  ];

  const second = await generateText({
    model: alibaba('qwen3.7-max'),
    messages,
    providerOptions,
  });

  console.log('Turn 2 reasoning:', second.finalStep.reasoningText);
  console.log('Turn 2 answer:', second.text);
  console.log('Turn 2 usage:', second.usage);
});
