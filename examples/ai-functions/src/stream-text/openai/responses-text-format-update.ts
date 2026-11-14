import {
  openai,
  type OpenAIResponsesSystemMessageOptions,
} from '@ai-sdk/openai';
import type { JSONValue } from '@ai-sdk/provider';
import { asSchema, streamText, Output, type ModelMessage } from 'ai';
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
  const first = streamText({ model, messages, providerOptions });
  for await (const text of first.textStream) process.stdout.write(text);
  console.log();

  const schema = z.object({ totalCrates: z.number().int() });
  messages.push(
    ...(await first.responseMessages),
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

  const second = streamText({
    model,
    messages,
    allowSystemInMessages: true,
    output: Output.object({ schema }),
    // Keep the original text format while validating the latest schema.
    providerOptions: {
      openai: {
        ...providerOptions.openai,
        promptCacheOptions: {
          comparisonResponseId: (await first.response).id!,
        },
      },
    },
  });
  for await (const partial of second.partialOutputStream) console.log(partial);
  console.log('Final output:', await second.output);
  console.log(
    'Cache diagnostics:',
    (await second.providerMetadata)?.openai?.promptCacheDiagnostics,
  );
});
