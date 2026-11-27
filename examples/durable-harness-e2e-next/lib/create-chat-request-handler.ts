import { isStoredAgentSession } from '@/lib/stored-agent-session';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import type { HarnessV2 } from '@ai-sdk/harness';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUITools,
  type ToolSet,
  type UIMessage,
} from 'ai';

export function createChatRequestHandler<
  THarness extends HarnessV2,
  TUserTools extends ToolSet,
>({ agent }: { agent: HarnessAgent<THarness, TUserTools> }) {
  type MESSAGE = UIMessage<unknown, never, InferUITools<typeof agent.tools>>;

  return async function POST(request: Request) {
    const body: {
      id?: string;
      messages: MESSAGE[];
      session?: unknown;
    } = await request.json();

    if (!body.id) {
      return new Response('Missing chat id', { status: 400 });
    }
    if (!isStoredAgentSession(body.session)) {
      return new Response('Missing session', { status: 400 });
    }
    const storedSession = body.session;
    const messages = await convertToModelMessages(body.messages);

    let result: Awaited<ReturnType<typeof agent.stream>>;
    try {
      const session = await agent.createSession(storedSession);
      /*
       * `stream()` appends the prompt (or tool approval responses) to the
       * session's log and starts or signals the drive before the HTTP response
       * is returned, so a caller queueing a follow-up prompt knows the
       * submission is committed as soon as the response headers arrive.
       */
      result = await agent.stream({ session, messages });
    } catch (error) {
      return new Response(getHarnessE2EErrorMessage(error), { status: 500 });
    }

    return createUIMessageStreamResponse({
      stream: createUIMessageStream<MESSAGE>({
        execute: ({ writer }) => {
          /*
           * The result's own `toUIMessageStream()` is used instead of the
           * standalone helper, since only it turns a retraction (the output of
           * an attempt that a retry replaces) into a `reset-step` chunk.
           */
          writer.merge(
            result.toUIMessageStream({
              onError: getHarnessE2EErrorMessage,
              originalMessages: body.messages,
            }),
          );
        },
        onError: getHarnessE2EErrorMessage,
      }),
    });
  };
}
