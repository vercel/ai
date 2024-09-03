import { openai } from '@ai-sdk/openai';
import { inputTransformationModel } from './input-transformation-model';

export const yourRagModel = inputTransformationModel({
  provider: 'you',
  modelId: 'your-rag-model',
  baseModel: openai('gpt-3.5-turbo'),

  // The key for RAG is to transform the parameters for the original model,
  // e.g. by injecting retrieved content as instructions:
  transformInput({
    parameters,
    lastUserMessageText,
    injectIntoLastUserMessage,
  }) {
    // only use RAG if the last message is a user message
    // (this is an example of a criteria for when to use RAG)
    if (lastUserMessageText == undefined) {
      return parameters; // do not use RAG (send unmodified parameters)
    }

    // Retrieve content using the prompt:
    // example, could be formatted / injected differently:
    const instruction =
      'Use the following information to answer the question:\n' +
      findSources({ text: lastUserMessageText })
        .map(chunk => JSON.stringify(chunk))
        .join('\n');

    // inject the retrieved content into the prompt
    // (this is just an example of how the information could be injected)
    return injectIntoLastUserMessage({ text: instruction });
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
