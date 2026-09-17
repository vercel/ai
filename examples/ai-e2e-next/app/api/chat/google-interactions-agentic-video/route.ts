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

function findLatestInteractionId(messages: UIMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }
    for (const part of message.parts) {
      const interactionId = (
        part as {
          providerMetadata?: { google?: { interactionId?: unknown } };
        }
      ).providerMetadata?.google?.interactionId;
      if (typeof interactionId === 'string') {
        return interactionId;
      }
    }
  }
  return undefined;
}

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
  const previousInteractionId = findLatestInteractionId(messages);
  const modelMessages = await convertToModelMessages(
    addAgenticVideoProcessing(messages),
  );
  const latestUserMessage = modelMessages.findLast(
    message => message.role === 'user',
  );

  const result = streamText({
    model: google.interactions('gemini-3.7-flash'),
    messages:
      previousInteractionId != null && latestUserMessage != null
        ? [latestUserMessage]
        : modelMessages,
    abortSignal: req.signal,
    providerOptions: {
      google: {
        store: true,
        thinkingSummaries: 'auto',
        ...(previousInteractionId != null ? { previousInteractionId } : {}),
      } satisfies GoogleLanguageModelInteractionsOptions,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
