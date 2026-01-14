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
    (await reqJson) as PreviousResponseIdRequestBody;

  const previousResponseId: string | undefined =
    typeof previousProviderMetadata?.openai?.responseId === 'string'
      ? previousProviderMetadata?.openai?.responseId
      : undefined;

  const stream = createUIMessageStream<PreviousResponseIdUIMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai('gpt-5-mini'),
        messages: await convertToModelMessages([message]),
        tools,
        stopWhen: stepCountIs(20),
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            reasoningSummary: 'auto',
            store: true,
            previousResponseId,
          } satisfies OpenAIResponsesProviderOptions,
        },
        onFinish: ({ providerMetadata }) => {
          if (!!providerMetadata) {
            writer.write({
              id: `data-providerMetadata-${Date.now()}`,
              type: 'data-providerMetadata',
              data: providerMetadata,
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
