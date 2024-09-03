import { openai } from '@ai-sdk/openai';
import { customRagModel } from './custom-rag-model';
import { getLastUserMessageText } from './get-last-user-message-text';
import { injectIntoLastUserMessage } from './inject-into-last-user-message';

export const yourRagModel = ({
  maxChunks,
}: {
  maxChunks: number; // example for custom parameters
}) =>
  customRagModel({
    provider: 'you',
    modelId: 'your-rag-model',
    baseModel: openai('gpt-3.5-turbo'), // this could also be passed in as a parameter

    // The key for RAG is to transform the prompt, e.g. by injecting retrieved content
    // You can transform the prompt & settings any way you want:
    transform({ parameters }) {
      const lastUserMessageText = getLastUserMessageText({
        prompt: parameters.prompt,
      });

      // only use RAG if the last message is a user message
      // (this is an example of a criteria for when to use RAG)
      if (lastUserMessageText == undefined) {
        return parameters; // do not use RAG (send unmodified parameters)
      }

      // Retrieve content using the prompt:
      // example, could be formatted / injected differently:
      const instruction =
        'Use the following information to answer the question:\n' +
        findSources({ text: lastUserMessageText, maxChunks })
          .map(chunk => JSON.stringify(chunk))
          .join('\n');

      // inject the retrieved content into the prompt
      // (this is just an example of how the information could be injected)
      return injectIntoLastUserMessage({
        text: instruction,
        params: parameters,
      });
    },
  });

// example, could implement anything here:
function findSources({
  text,
  maxChunks,
}: {
  text: string;
  maxChunks: number;
}): Array<{
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
