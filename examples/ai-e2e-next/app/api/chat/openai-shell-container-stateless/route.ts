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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// OpenAI includes the shell container id in the raw `response.created` chunk.
function extractContainerIdFromRawChunk(rawValue: unknown): string | undefined {
  if (
    !isRecord(rawValue) ||
    rawValue.type !== 'response.created' ||
    !isRecord(rawValue.response)
  ) {
    return undefined;
  }

  const { tools } = rawValue.response;
  if (!Array.isArray(tools)) {
    return undefined;
  }

  for (const tool of tools) {
    if (
      !isRecord(tool) ||
      tool.type !== 'shell' ||
      !isRecord(tool.environment)
    ) {
      continue;
    }

    const containerId = tool.environment.container_id;
    if (typeof containerId === 'string') {
      return containerId;
    }
  }

  return undefined;
}

export async function POST(req: Request) {
  const { messages: prevMessages, containerId }: StatelessContainerBody =
    await req.json();

  const messages = prevMessages.map(message => {
    // Drop previous shell tool parts because their call ids are not available in
    // a stateless follow-up request. Keeping them can cause:
    // "No tool call found for shell call output with call_id call_xxxx."
    const parts = message.parts.filter(part => part.type != 'tool-shell');
    const fixedMessage: StatelessContainerUIMessage = {
      ...message,
      parts,
    };
    return fixedMessage;
  });

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
          const containerId = extractContainerIdFromRawChunk(part.rawValue);
          if (containerId) {
            // Send the container id to the client so it can be reused on the
            // next request with `containerReference`.
            writer.write({
              type: 'data-container',
              data: {
                containerId,
              },
            });
            break;
          }
        }
      }
      writer.merge(result.toUIMessageStream({ originalMessages: messages }));
    },
  });
  return createUIMessageStreamResponse({ stream });
}
