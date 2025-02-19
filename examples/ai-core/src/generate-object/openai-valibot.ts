import { openai } from '@ai-sdk/openai';
import { valibotSchema } from '@ai-sdk/valibot';
import { generateObject } from 'ai';
import 'dotenv/config';
import * as v from 'valibot';

async function main() {
  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: valibotSchema(
      v.object({
        recipe: v.object({
          name: v.string(),
          ingredients: v.array(
            v.object({
              name: v.string(),
              amount: v.string(),
            }),
          ),
          steps: v.array(v.string()),
        }),
      }),
    ),
    prompt: 'Generate a lasagna recipe.',
  });

  console.log(JSON.stringify(result.object.recipe, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
