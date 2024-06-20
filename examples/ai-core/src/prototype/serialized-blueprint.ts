import { generateText, resolveSerializedBlueprint } from 'ai';
import { registry } from '../registry/setup-registry';

const serializedBlueprint = {
  model: 'openai:gpt-4-turbo',
  system: `You are a translator who translates from "English" to "{{language}}".`,
  prompt: `Translate the following sentence:\n\n"{{sentence}}"`,
  temperature: 0,
};

async function main() {
  const result = await generateText({
    blueprint: resolveSerializedBlueprint({
      registry,
      blueprint: serializedBlueprint,
      input: {
        sentence: 'Hello, how are you?',
        language: 'French',
      },
    }),
  });

  console.log(result.text);
}

main().catch(console.error);
