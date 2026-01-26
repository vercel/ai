import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z as dhiZ } from 'dhi';
import * as zodZ from 'zod/v4';
import { dhiSchema } from '@ai-sdk/dhi';
import 'dotenv/config';

async function main() {
  // Example 1: Using dhi schema
  console.log('=== Testing with dhi schema ===\n');

  const DhiUserSchema = dhiZ.object({
    name: dhiZ.string(),
    age: dhiZ.number(),
    email: dhiZ.string().email(),
  });

  const dhiResult = await generateObject({
    model: google('gemini-2.0-flash'),
    schema: dhiSchema(DhiUserSchema),
    prompt: 'Generate a fictional user named Alice with name, age, and email.',
  });

  console.log('dhi result:', dhiResult.object);

  // Example 2: Using zod schema
  console.log('\n=== Testing with zod schema ===\n');

  const ZodUserSchema = zodZ.object({
    name: zodZ.string(),
    age: zodZ.number(),
    email: zodZ.string().email(),
  });

  const zodResult = await generateObject({
    model: google('gemini-2.0-flash'),
    schema: dhiSchema(ZodUserSchema),
    prompt: 'Generate a fictional user named Bob with name, age, and email.',
  });

  console.log('zod result:', zodResult.object);

  console.log('\n=== Both dhi and zod work with dhiSchema! ===');
}

main().catch(console.error);
