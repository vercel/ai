import { createRequire } from 'node:module';
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

type CodemodTransform = (
  file: { path: string; source: string },
  api: {
    j: unknown;
    jscodeshift: unknown;
    report: (message: string) => void;
    stats: () => void;
  },
  options: Record<string, never>,
) => string | null;

type JscodeshiftModule = {
  withParser(parser: string): unknown;
};

const require = createRequire(import.meta.url);
const j = (
  require('../../../../packages/codemod/node_modules/jscodeshift') as JscodeshiftModule
).withParser('tsx');

class ReproductionChat extends AbstractChat<UIMessage> {}

async function loadCodemod(): Promise<CodemodTransform> {
  const codemodUrl = new URL(
    '../../../../packages/codemod/src/codemods/v7/rename-on-finish-to-on-end.ts',
    import.meta.url,
  ).href;
  const codemodModule = (await import(codemodUrl)) as {
    default: CodemodTransform;
  };

  return codemodModule.default;
}

function applyCodemod(transform: CodemodTransform, source: string): string {
  return (
    transform(
      { path: 'chat-options.ts', source },
      {
        j,
        jscodeshift: j,
        report: () => {},
        stats: () => {},
      },
      {},
    ) ?? source
  );
}

async function runChat(optionsSource: string): Promise<number> {
  let callbackCalls = 0;
  const options = new Function('callback', optionsSource)(() => {
    callbackCalls++;
  }) as Pick<ChatInit<UIMessage>, 'onFinish'>;

  const state: ChatState<UIMessage> = {
    status: 'ready',
    error: undefined,
    messages: [],
    pushMessage(message) {
      this.messages.push(message);
    },
    popMessage() {
      this.messages.pop();
    },
    replaceMessage(index, message) {
      this.messages[index] = message;
    },
    snapshot: value => structuredClone(value),
  };

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      const chunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'reply' },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'Hello' },
        { type: 'text-end', id: 'text' },
        { type: 'finish', finishReason: 'stop' },
      ];

      return new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new ReproductionChat({
    ...options,
    state,
    transport,
  });

  await chat.sendMessage({ text: 'Hi' });

  if (chat.status !== 'ready') {
    throw new Error(`Chat did not complete successfully: ${chat.status}`);
  }

  return callbackCalls;
}

async function main() {
  const transform = await loadCodemod();
  const source = 'return { onFinish: callback };';
  const migrated = applyCodemod(transform, source);
  const beforeCalls = await runChat(source);
  const afterCalls = await runChat(migrated);

  console.log(JSON.stringify({ migrated, beforeCalls, afterCalls }));

  if (beforeCalls !== 1) {
    throw new Error(
      `Reproduction precondition failed: unchanged onFinish ran ${beforeCalls} times instead of once.`,
    );
  }

  if (afterCalls !== 1) {
    throw new Error(
      `ISSUE_23032_REPRODUCED: migrated chat completion callback ran ${afterCalls} times instead of once.`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
