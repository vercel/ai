import { openai } from '@ai-sdk/openai';
import { LanguageModelV3Middleware } from '@ai-sdk/provider';
import { generateText, wrapLanguageModel } from 'ai';
import 'dotenv/config';

const logProviderMetadataMiddleware: LanguageModelV3Middleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    console.log(
      'providerOptions: ' + JSON.stringify(params.providerOptions, null, 2),
    );
    return params;
  },
};

async function main() {
  const { text } = await generateText({
    model: wrapLanguageModel({
      model: openai('gpt-4o'),
      middleware: logProviderMetadataMiddleware,
    }),
    providerOptions: {
      myMiddleware: {
        example: 'value',
      },
    },
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
}

main().catch(console.error);
