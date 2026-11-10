import {
  google,
  type GoogleLanguageModelInteractionsOptions,
} from '@ai-sdk/google';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { isLocalDevelopmentRequest } from '../../code-execution-files/is-local-development-request';

export const maxDuration = 30;

function findLatestInteractionId(messages: UIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      const id = (
        part as {
          providerMetadata?: { google?: { interactionId?: unknown } };
        }
      ).providerMetadata?.google?.interactionId;
      if (typeof id === 'string') {
        return id;
      }
    }
  }
  return undefined;
}

export async function POST(req: Request) {
  // This stateful demo has no user or conversation ownership model. Public
  // deployments should use the stateless example or authorize IDs server-side.
  if (!isLocalDevelopmentRequest(req)) {
    return new Response(
      'Stateful Google Interactions is only available in local development.',
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const previousInteractionId = findLatestInteractionId(messages);

  const result = streamText({
    model: google.interactions('gemini-3.1-flash-image-preview'),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      google: {
        responseModalities: ['text', 'image'],
        thinkingLevel: 'high',
        thinkingSummaries: 'auto',
        ...(previousInteractionId != null ? { previousInteractionId } : {}),
      } satisfies GoogleLanguageModelInteractionsOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
