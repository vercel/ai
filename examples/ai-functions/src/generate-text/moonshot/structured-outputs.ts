import { moonshotai } from '@ai-sdk/moonshotai';
import type { JSONSchema7 } from '@ai-sdk/provider';
import { generateText, jsonSchema, Output } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

type PairOutput = {
  pair: [string, number];
};

const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
    },
  },
  required: ['pair'],
  additionalProperties: false,
};

run(async () => {
  const result = await generateText({
<<<<<<< HEAD
    model: moonshotai('kimi-k3'),
=======
    model: moonshotai('moonshot-v1-8k'),
    include: { requestBody: true },
>>>>>>> 8037158f5e (fix: enable native structured outputs for official Moonshot V1 models (#19583))
    output: Output.object({
      name: 'named_pair',
      schema: jsonSchema<PairOutput>(schema),
    }),
    prompt: 'Return a pair containing the string "age" and the number 42.',
  });

  print('Output:', result.output);
  print('Request:', result.request.body);
});
