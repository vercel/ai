import { alibaba, type AlibabaLanguageModelOptions } from '@ai-sdk/alibaba';
import { generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

// qwen3-max supports thinking but is not on Alibaba's preserved-thinking
// model list, so prior reasoning is omitted from follow-up requests and the
// conversation continues from visible text only.
const providerOptions = {
  alibaba: {
    enableThinking: true,
    thinkingBudget: 2048,
  } satisfies AlibabaLanguageModelOptions,
};

run(async () => {
  const opening: ModelMessage = {
    role: 'user',
    content:
      'Is Kafka or RocketMQ a better fit for an online store that needs transactional messages? Think it through, but return only the recommendation.',
  };

  const first = await generateText({
    model: alibaba('qwen3-max'),
    messages: [opening],
    providerOptions,
  });

  console.log('Turn 1 reasoning:', first.reasoningText);
  console.log('Turn 1 answer:', first.text);
  console.log('Turn 1 usage:', first.usage);

  const second = await generateText({
    model: alibaba('qwen3-max'),
    messages: [
      opening,
      ...first.response.messages,
      {
        role: 'user',
        content: 'Summarize your recommendation in one sentence.',
      },
    ],
    providerOptions,
  });

  console.log('Turn 2 answer:', second.text);
  console.log(
    'Turn 2 input tokens (reasoning omitted, so no replay cost):',
    second.usage.inputTokens,
  );
  console.log('Turn 2 usage:', second.usage);
});
