import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUITools,
  streamText,
  type ToolSet,
  type UIMessage,
} from 'ai';

const tools = {
  shell: openai.tools.shell({
    environment: {
      type: 'containerAuto',
    },
  }),
} satisfies ToolSet;
type Tools = InferUITools<typeof tools>;

export type StatelessContainerBody = {
  messages: StatelessContainerUIMessage[];
  containerId?: string;
};

export type StatelessContainerUIMessage = UIMessage<
  never,
  {
    container: {
      containerId: string | undefined;
    };
  },
  Tools
>;

export async function POST(req: Request) {
  const { messages: prevMessages, containerId }: StatelessContainerBody =
    await req.json();

  const messages = prevMessages.map(message => {
    const parts = message.parts.filter(part => part.type != 'tool-shell');
    const fixedMessage: StatelessContainerUIMessage = {
      ...message,
      parts,
    };
    return fixedMessage;
  });

  console.log('containerId:', containerId ?? 'undefined');
  const tools = {
    shell: openai.tools.shell({
      environment: containerId
        ? {
            type: 'containerReference',
            containerId,
          }
        : {
            type: 'containerAuto',
          },
    }),
  } satisfies ToolSet;

  const stream = createUIMessageStream<StatelessContainerUIMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai('gpt-5.4-mini'),
        messages: await convertToModelMessages(messages),
        tools,
        includeRawChunks: true,
        providerOptions: {
          openai: {
            store: false,
          } satisfies OpenAILanguageModelResponsesOptions,
        },
      });

      for await (const part of result.fullStream) {
        if (part.type === 'raw') {
          const { rawValue } = part;
          if (
            typeof rawValue === 'object' &&
            !!rawValue &&
            'type' in rawValue &&
            rawValue.type === 'response.created' &&
            'response' in rawValue
          ) {
            const { type, response } = rawValue;
            // console.log('rawValueResponse:', JSON.stringify(response));
            if (
              typeof response === 'object' &&
              response &&
              'tools' in response &&
              Array.isArray(response.tools)
            ) {
              const { tools } = response;
              // console.log("tools",tools)
              const shellTool = tools.find(
                (
                  tool,
                ): tool is {
                  type: 'shell';
                  environment: { container_id: string };
                } =>
                  'type' in tool &&
                  tool.type === 'shell' &&
                  'environment' in tool &&
                  typeof tool.environment === 'object' &&
                  'container_id' in tool.environment &&
                  typeof tool.environment.container_id === 'string',
              );
              if (shellTool) {
                const {
                  environment: { container_id },
                } = shellTool;

                writer.write({
                  type: 'data-container',
                  data: {
                    containerId: container_id,
                  },
                });
                break;
              }
            }
          }
        }
      }
      writer.merge(result.toUIMessageStream({ originalMessages: messages }));
    },
  });
  return createUIMessageStreamResponse({ stream });
}
