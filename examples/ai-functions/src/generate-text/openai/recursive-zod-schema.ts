import { openai } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { run } from '../../lib/run';
import * as z from 'zod/v4';

type Person = {
  firstName: string;
  lastName: string;
  age: number;
  relatives: Person[];
};

const personSchema: z.ZodType<Person> = z.object({
  firstName: z.string(),
  lastName: z.string(),
  age: z.number(),
  relatives: z.array(z.lazy(() => personSchema)),
});

const schema = personSchema.default({
  firstName: 'John',
  lastName: 'Doe',
  age: 30,
  relatives: [],
});

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-2024-08-06'),
    prompt: 'Generate a fictional person with no relatives.',
    output: Output.object({ schema }),
  });

  console.log(JSON.stringify(result.output, null, 2));
});
