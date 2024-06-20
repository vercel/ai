import { generateText, loadSerializedBlueprint } from 'ai';
import dotenv from 'dotenv';
import { registry } from '../registry/setup-registry';

dotenv.config();

const serializedBlueprint = {
  model: 'openai:gpt-4-turbo',
  system: `You are a translator who translates from "English" to "{{language}}".`,
  prompt: `Translate the following sentence:\n\n"{{sentence}}"`,
};

const translate = loadSerializedBlueprint({
  registry,
  blueprint: serializedBlueprint,
});

async function main() {
  const result = await generateText({
    blueprint: translate({
      sentence: 'Hello, how are you?',
      language: 'French',
    }),
  });

  console.log(result.text);
}

main().catch(console.error);
