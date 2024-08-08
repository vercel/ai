import { openai } from '@ai-sdk/openai';
import { generateObject, jsonSchema, Schema } from 'ai';
import dotenv from 'dotenv';
import { JSONSchema7 } from 'json-schema';
import * as t from 'tschema';

dotenv.config();

// adapter function to convert tschema to ai schema with type inference
function tSchema<T extends t.Type>(schema: T): Schema<t.Infer<T>> {
  return jsonSchema(schema as JSONSchema7);
}

async function main() {
  const { object: recipe } = await generateObject({
    model: openai('gpt-4o-2024-08-06', {
      structuredOutputs: true,
    }),
    schema: tSchema(
      t.object({
        name: t.string(),
        ingredients: t.array(
          t.object({ name: t.string(), amount: t.string() }),
        ),
        steps: t.array(t.string()),
      }),
    ),
    prompt: 'Generate a lasagna recipe.',
  });

  // recipe is fully
  console.log(JSON.stringify(recipe, null, 2));
}

main().catch(console.error);
