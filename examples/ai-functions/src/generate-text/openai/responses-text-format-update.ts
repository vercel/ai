import {
  openai,
  type OpenAIResponsesSystemMessageOptions,
} from '@ai-sdk/openai';
import type { JSONValue } from '@ai-sdk/provider';
import { asSchema, generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const model = openai.responses('gpt-6-astra');
  const providerOptions = {
    openai: { store: false, textFormat: { type: 'text' as const } },
  };
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'Summarize a shipment of 17 red crates and 26 blue crates.',
    },
  ];
  const first = await generateText({ model, messages, providerOptions });
  console.log(first.text);

  const schema = z.object({ totalCrates: z.number().int() });
  messages.push(
    ...first.responseMessages,
    {
      role: 'system',
      content: '',
      providerOptions: {
        openai: {
          textFormatUpdate: {
            type: 'json_schema',
            name: 'crate_count',
            strict: true,
            schema: (await asSchema(schema).jsonSchema) as Record<
              string,
              JSONValue
            >,
          },
        } satisfies OpenAIResponsesSystemMessageOptions,
      },
    },
    { role: 'user', content: 'How many crates are there altogether?' },
  );

  const second = await generateText({
    model,
    messages,
    allowSystemInMessages: true,
    // Output validates the new schema; textFormat keeps the initial wire format.
    output: Output.object({ schema }),
    providerOptions: {
      openai: {
        ...providerOptions.openai,
        promptCacheOptions: { comparisonResponseId: first.response.id! },
      },
    },
  });
  console.log(second.output);
  console.log(
    'Cache diagnostics:',
    second.providerMetadata?.openai?.promptCacheDiagnostics,
  );
});
