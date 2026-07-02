// Import the built workspace packages by relative path so this reproduction can
// run from the repository root without adding a temporary package dependency.
import { createGoogleGenerativeAI } from '../../packages/google/dist/index.js';
import {
  jsonSchema as aiJsonSchema,
  stepCountIs,
  streamText,
} from '../../packages/ai/dist/index.js';
import { z } from '../../packages/ai/node_modules/zod/v4/index.js';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
  console.error(
    'Missing GOOGLE_GENERATIVE_AI_API_KEY. Set it to a Gemini API key and rerun: pnpm tsx reproductions/issue-14369/repro.ts',
  );
  process.exit(2);
}

const google = createGoogleGenerativeAI({ apiKey });

// Recursive schema: z.lazy() causes z.toJSONSchema() to emit $ref/$defs.
const filterSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    field: z.string().optional(),
    value: z.string().optional(),
    or: z.array(filterSchema).optional(),
    and: z.array(filterSchema).optional(),
    not: filterSchema.optional(),
  }),
);

// Nesting is important: otherwise Zod emits $ref:"#", not $defs/__schema0.
const findToolSchema = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
  filter: filterSchema.optional(),
});

const schemaWithRefs = z.toJSONSchema(findToolSchema);

console.log('Schema includes $defs:', '$defs' in schemaWithRefs);
console.log(
  'Nested filter $ref:',
  JSON.stringify(schemaWithRefs).includes('"$ref":"#/$defs/'),
);

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash'),
    stopWhen: stepCountIs(3),
    prompt: 'Call the get_schema tool exactly once, then summarize it.',
    onError: () => {},
    tools: {
      // Raw tool definition (not using the tool() helper).
      get_schema: {
        description: 'Returns the JSON Schema for the record filter',
        inputSchema: aiJsonSchema({
          type: 'object' as const,
          properties: {},
        }),
        execute: async () => ({
          tools: [
            {
              name: 'find_records',
              description: 'Find records with filters',
              inputSchema: schemaWithRefs,
            },
          ],
        }),
      },
    },
  });

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.text);
    }
    if (chunk.type === 'error') {
      throw chunk.error;
    }
  }
}

main().catch(error => {
  console.error('\n--- caught error ---');
  console.error(error);

  const message = String(error?.message ?? error);
  if (
    message.includes('function_response.response') ||
    message.includes('#/$defs/__schema0')
  ) {
    console.error(
      '\nReproduced issue #14369: Gemini rejected $ref/$defs in function response content.',
    );
    process.exit(1);
  }

  process.exit(3);
});
