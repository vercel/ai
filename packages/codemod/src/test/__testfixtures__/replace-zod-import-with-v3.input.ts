// @ts-nocheck
import z from 'zod';
import { generateText } from 'ai';

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

const result = await generateText({
  model: openai('gpt-4'),
  prompt: 'Generate a person',
  schema,
});

// Other imports should not be affected
import x from 'other-package';
import { y } from 'zod';

// Default import with different name should not be transformed
import zod from 'zod';
