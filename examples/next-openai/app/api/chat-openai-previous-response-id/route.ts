import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  InferUITools,
  ProviderMetadata,
  stepCountIs,
  streamText,
  UIMessage,
} from 'ai';
import { rollDieToolWithProgrammaticCalling } from '@/tool/roll-die-tool-with-programmatic-calling';

const tools = {
  rollDieToolWithProgrammaticCalling,
};

type Tools = InferUITools<typeof tools>;
type Data = {
  providerMetadata: ProviderMetadata;
};

export type PreviousResponseIdUIMessage = UIMessage<unknown, Data, Tools>;

export type PreviousResponseIdRequestBody = {
  message: PreviousResponseIdUIMessage;
  previousProviderMetadata: ProviderMetadata | undefined;
};

export async function POST(req: Request) {
  const reqJson = await req.json();

  const { message, previousProviderMetadata } =
    reqJson as PreviousResponseIdRequestBody;

  // Extract the prior OpenAI responseId so the Responses API can replay history.
  const previousResponseId: string | undefined =
    typeof previousProviderMetadata?.openai?.responseId === 'string'
      ? previousProviderMetadata?.openai?.responseId
      : undefined;

  const stream = createUIMessageStream<PreviousResponseIdUIMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai('gpt-5-mini'),
        // Send only the latest user message; OpenAI will fetch prior turns via previousResponseId.
        messages: await convertToModelMessages([message]),
        tools,
        stopWhen: stepCountIs(20),
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            reasoningSummary: 'auto',
            store: true,
            // Enable history lookup by passing the responseId from the previous call.
            previousResponseId,
          } satisfies OpenAIResponsesProviderOptions,
        },
        onFinish: ({ providerMetadata }) => {
          if (!!providerMetadata) {
            // Return provider metadata so the client can persist the latest responseId.
            writer.write({
              type: 'data-providerMetadata',
              data: providerMetadata,
              transient: true,
            });
          }
        },
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
