// @ts-nocheck
import { z } from 'zod';
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
import { someFunction } from 'zod/v4';

// Mixed import with z and other zod types
import type { ZodSchema } from 'zod';
import { z as zodValidator } from 'zod';

const mixedSchema: ZodSchema = zodValidator.string();