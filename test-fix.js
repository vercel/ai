import { google } from '@ai-sdk/google';
import { generateObject } from '@ai-sdk/ai';
import { z } from 'zod';

const model = google('gemini-2.5-pro');

async function testGenerateObject() {
  try {
    console.log('Testing generateObject with Gemini...');

    const { object } = await generateObject({
      model: model,
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(z.string()),
          steps: z.array(z.string()),
        }),
      }),
      prompt:
        'Generate a simple lasagna recipe with 3 ingredients and 3 steps.',
    });

    console.log('✅ Success! Generated object:');
    console.log(JSON.stringify(object, null, 2));

    // Verify the structure
    if (
      object.recipe &&
      typeof object.recipe.name === 'string' &&
      Array.isArray(object.recipe.ingredients) &&
      Array.isArray(object.recipe.steps)
    ) {
      console.log('✅ Schema validation passed!');
    } else {
      console.log('❌ Schema validation failed!');
    }
  } catch (error) {
    console.error('❌ Error occurred:');
    console.error(error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
    });
  }
}

testGenerateObject();
