import { Chat } from '../../../../packages/react/dist/index.mjs';
import type {
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from '../../../../packages/ai/dist/index.mjs';

const originalStructuredClone = globalThis.structuredClone;

const transport: ChatTransport<UIMessage> = {
  async sendMessages() {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.close();
      },
    });
  },
  async reconnectToStream() {
    return null;
  },
};

async function sendWithoutStructuredClone() {
  Reflect.deleteProperty(globalThis, 'structuredClone');

  const chat = new Chat({ transport });
  await chat.sendMessage({ text: 'Hello' });

  return chat.error;
}

async function sendWithDocumentedPolyfill() {
  const structuredClonePolyfill = (
    require('@ungap/structured-clone') as {
      default: typeof structuredClone;
    }
  ).default;

  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    value: structuredClonePolyfill,
    writable: true,
  });

  const chat = new Chat({ transport });
  await chat.sendMessage({ text: 'Hello' });

  if (chat.error != null || chat.status !== 'ready') {
    throw new Error(
      `Expected the documented structuredClone polyfill configuration to work, received status=${chat.status}, error=${chat.error?.message}`,
    );
  }
}

async function main() {
  try {
    const unpolyfilledError = await sendWithoutStructuredClone();

    if (
      !(unpolyfilledError instanceof ReferenceError) ||
      !unpolyfilledError.message.includes('structuredClone')
    ) {
      throw new Error(
        `Expected an unpolyfilled runtime to report a structuredClone ReferenceError, received ${unpolyfilledError?.name}: ${unpolyfilledError?.message}`,
      );
    }

    console.log(
      `Unpolyfilled runtime reproduced the reported failure: ${unpolyfilledError.name}: ${unpolyfilledError.message}`,
    );

    await sendWithDocumentedPolyfill();
    console.log(
      'Documented Expo structuredClone polyfill configuration completed the chat request without an error.',
    );
  } finally {
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: originalStructuredClone,
      writable: true,
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
