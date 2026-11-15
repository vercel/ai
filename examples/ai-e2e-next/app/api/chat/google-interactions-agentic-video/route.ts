import {
  google,
  type GoogleLanguageModelInteractionsOptions,
  type GoogleInteractionsVideoOptions,
} from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

export const maxDuration = 300;

function addAgenticVideoProcessing(messages: UIMessage[]): UIMessage[] {
  return messages.map(message => ({
    ...message,
    parts: message.parts.map(part => {
      if (part.type !== 'file' || !part.mediaType.startsWith('video/')) {
        return part;
      }

      return {
        ...part,
        providerMetadata: {
          ...part.providerMetadata,
          google: {
            ...part.providerMetadata?.google,
            processing: 'agentic',
          } satisfies GoogleInteractionsVideoOptions,
        },
      };
    }),
  }));
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(
    addAgenticVideoProcessing(messages),
  );

  const result = streamText({
    model: google.interactions('gemini-4-hydrogen'),
    messages: modelMessages,
    abortSignal: req.signal,
    providerOptions: {
      google: {
        // Preserve video context in the submitted history without trusting
        // client-supplied IDs to resume stored conversations.
        store: false,
        thinkingSummaries: 'auto',
      } satisfies GoogleLanguageModelInteractionsOptions,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
