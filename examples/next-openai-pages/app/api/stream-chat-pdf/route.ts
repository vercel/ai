import { CoreMessage, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { UnstructuredClient } from 'unstructured-client';
import {
  PartitionRequest,
  PartitionResponse,
} from 'unstructured-client/sdk/models/operations';

const client = new UnstructuredClient({
  serverURL: 'https://api.unstructuredapp.io/general/v0/general',
  security: {
    apiKeyAuth: process.env.UNSTRUCTURED_API_KEY || '',
  },
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const updatedMessages: CoreMessage[] = [];

  for (const message of messages) {
    const { files } = message;

    for (const file of files || []) {
      if (file.type === 'url') {
        const { url } = file;
        const blob = await fetch(url).then(res => res.blob());

        const payload: PartitionRequest = {
          partitionParameters: {
            files: blob,
          },
        };

        await client.general
          .partition(payload)
          .then((res: PartitionResponse) => {
            if (res.statusCode == 200) {
              const { elements } = res;

              updatedMessages.push({
                ...message,
                content: elements
                  ? [
                      { type: 'text', text: message.content },
                      {
                        type: 'text',
                        text: elements.map(element => element.text).join(),
                      },
                    ]
                  : message.content,
              });
            }
          })
          .catch(error => {
            console.log(error);
          });
      }
    }
  }

  console.log(updatedMessages.map(m => m.content));

  const result = await streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages: updatedMessages,
  });

  return result.toAIStreamResponse();
}
