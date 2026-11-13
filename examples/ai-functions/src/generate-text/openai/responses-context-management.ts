import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

const ledger = Array.from(
  { length: 400 },
  (_, i) =>
    `Section ${i + 1}: The harbor ledger records shipment ${i * 7} of copper, tea and timber, inspected by clerk ${i % 13} at dawn.`,
).join('\n');

run(async () => {
  const providerOptions = {
    openai: {
      store: false,
      contextManagement: [{ type: 'compaction', compactThreshold: 1000 }],
    } satisfies OpenAILanguageModelResponsesOptions,
  };
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: `Reference:\n${ledger}\n\nIn one sentence, what is this document about?`,
    },
  ];

  const first = await generateText({
    model: openai.responses('gpt-5.4'),
    messages,
    providerOptions,
  });
  console.log(first.text);
  console.log(
    'Compaction parts:',
    first.content.filter(
      part =>
        part.type === 'reasoning' &&
        part.providerMetadata?.openai?.type === 'compaction',
    ).length,
  );

  messages.push(...first.response.messages, {
    role: 'user',
    content: 'Name one key topic from it.',
  });

  const second = await generateText({
    model: openai.responses('gpt-5.4'),
    messages,
    providerOptions,
  });
  console.log(second.text);
});
