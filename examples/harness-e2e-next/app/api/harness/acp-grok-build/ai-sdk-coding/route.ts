import { grokBuildACPAiSdkCodingHarnessAgent } from '@/agent/harness/acp-grok-build/ai-sdk-coding-agent';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import {
  detachAndPersist,
  resumeOrCreateSession,
} from '@/util/harness-resume-store';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: UIMessage[];
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }
  const chatId = body.id;
  const messages = await convertToModelMessages(body.messages);

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const session = await resumeOrCreateSession(
          grokBuildACPAiSdkCodingHarnessAgent,
          chatId,
        );
        const result = await grokBuildACPAiSdkCodingHarnessAgent.stream({
          session,
          messages,
        });
        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            onError: getHarnessE2EErrorMessage,
            onFinish: () => detachAndPersist(chatId, session),
          }),
        );
      },
      onError: getHarnessE2EErrorMessage,
    }),
  });
}
