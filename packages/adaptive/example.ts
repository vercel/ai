import { ComparisonProvider } from './src/adaptive-chat-options';
import { adaptive } from './src/adaptive-provider';

async function main() {
  const model = adaptive.chat();

  // Send a simple chat prompt with a comparison provider
  const result = await model.doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello, who are you?' }],
      },
    ],
    providerOptions: {
      comparisonProvider: {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
      } satisfies ComparisonProvider,
    },
  });
  console.log('Model response:', result.content);
  console.log('Usage:', result.usage);
  console.log(
    'Provider metadata (cost_saved):',
    result.providerMetadata?.adaptive?.cost_saved,
  );
}

main();
