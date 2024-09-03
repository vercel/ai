import { openai } from '@ai-sdk/openai';
import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { customRagModel } from './custom-rag-model';

export const myRagModel = ({
  maxChunks,
}: {
  maxChunks: number; // example for custom parameters
}) =>
  customRagModel({
    provider: 'custom',
    modelId: 'custom-model',
    delegateModel: openai('gpt-3.5-turbo'), // this could also be passed in as a parameter

    // The key for RAG is to transform the prompt, e.g. by injecting retrieved content
    // You can transform the prompt & settings any way you want:
    transform({ parameters }) {
      const { prompt: messages, ...rest } = parameters;

      // only use RAG if the last message is a user message
      // (this is an example of a criteria for when to use RAG)
      const lastMessage = messages.at(-1);
      if (lastMessage?.role !== 'user') {
        return { ...rest, prompt: messages };
      }

      // Retrieve content using the prompt:
      const sources = findSources({ messages, maxChunks });

      // inject the retrieved content into the prompt
      // (this is just an example of how the information could be injected)
      return {
        ...rest,
        prompt: [
          ...messages.slice(0, -1),
          {
            ...lastMessage,
            content: [
              {
                type: 'text',
                text:
                  // example, could be formatted / injected differently:
                  'Use the following information to answer the question: \n' +
                  sources.map(chunk => JSON.stringify(chunk)).join('\n'),
              },
              ...lastMessage.content,
            ],
          },
        ],
      };
    },
  });

// example, could implement anything here:
function findSources({
  messages,
  maxChunks,
}: {
  messages: LanguageModelV1Prompt;
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
