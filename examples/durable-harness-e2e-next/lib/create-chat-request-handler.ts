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

    return createUIMessageStreamResponse({
      stream: createUIMessageStream<MESSAGE>({
        execute: async ({ writer }) => {
          const session = await agent.createSession(storedSession);
          /*
           * `stream()` runs the turn's drive in this process. The agent sends
           * a backstop before the drive starts, which continues the turn in a
           * background drive if this process dies or the drive yields at its
           * deadline.
           */
          const result = await agent.stream({ session, messages });

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
