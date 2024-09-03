import { openai } from '@ai-sdk/openai';
import { createLanguageModelV1Middleware } from './create-language-model-v1-middleware';

export const yourRagModel = createLanguageModelV1Middleware({
  provider: 'you',
  modelId: 'your-rag-model',
  model: openai('gpt-3.5-turbo'),

  async transformParams({
    params, // full access to the original parameters if you need
    lastUserMessageText,
    addToLastUserMessage,
  }) {
    if (lastUserMessageText == null) {
      return params; // do not use RAG (send unmodified parameters)
    }

    const instruction =
      'Use the following information to answer the question:\n' +
      findSources({ text: lastUserMessageText })
        .map(chunk => JSON.stringify(chunk))
        .join('\n');

    return addToLastUserMessage({ text: instruction });
  },
});

// example, could implement anything here:
function findSources({ text }: { text: string }): Array<{
  title: string;
  previewText: string | undefined;
  url: string | undefined;
}> {
  return [
    {
      title: 'New York',
      previewText: 'New York is a city in the United States.',
      url: 'https://en.wikipedia.org/wiki/New_York',
    },
    {
      title: 'San Francisco',
      previewText: 'San Francisco is a city in the United States.',
      url: 'https://en.wikipedia.org/wiki/San_Francisco',
    },
  ];
}
