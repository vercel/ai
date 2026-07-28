import { createRequire } from 'node:module';
import { cp, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type StreamChunk = {
  type: string;
  delta?: string;
  output?: unknown;
  toolCallId?: string;
};

async function collect(stream: ReadableStream<StreamChunk>) {
  const chunks: StreamChunk[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

async function* createGraphStream(message: unknown) {
  yield ['messages', [message, { langgraph_step: 1 }]];
}

async function main() {
  const workspaceRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const nextLangchainPackage = resolve(
    workspaceRoot,
    'examples/next-langchain/package.json',
  );
  const requireFromCommonJsHost = createRequire(nextLangchainPackage);
  const cjsMessages = requireFromCommonJsHost('@langchain/core/messages');
  const langchainCorePackage = requireFromCommonJsHost(
    '@langchain/core/package.json',
  ) as {
    version: string;
    exports: {
      './messages': { import: { default: string } };
    };
  };
  const langchainCoreRoot = dirname(
    requireFromCommonJsHost.resolve('@langchain/core/package.json'),
  );
  const publishedEsmMessages = await import(
    pathToFileURL(
      resolve(
        langchainCoreRoot,
        langchainCorePackage.exports['./messages'].import.default,
      ),
    ).href
  );

  if (langchainCorePackage.version !== '1.2.3') {
    throw new Error(
      `Reproduction setup error: expected @langchain/core 1.2.3, received ${langchainCorePackage.version}`,
    );
  }

  const cjsAIMessageChunk = new cjsMessages.AIMessageChunk({
    content: 'Hello!',
    id: 'message-1',
  });
  const esmAIMessageChunk = new publishedEsmMessages.AIMessageChunk({
    content: 'Hello!',
    id: 'message-1',
  });

  if (
    cjsMessages.AIMessageChunk === publishedEsmMessages.AIMessageChunk ||
    publishedEsmMessages.AIMessageChunk.isInstance(cjsAIMessageChunk) ||
    !cjsMessages.AIMessageChunk.isInstance(cjsAIMessageChunk)
  ) {
    throw new Error(
      'Reproduction setup error: @langchain/core did not load distinct CJS and ESM message classes',
    );
  }

  // Relocate the target-branch adapter source beside the exact reported
  // @langchain/core dependency. Its ESM import and the CommonJS require above
  // then resolve to the same package installation.
  const relocatedSourcePath = resolve(
    workspaceRoot,
    'examples/next-langchain/.issue-17863-langchain-source',
  );
  await cp(
    resolve(workspaceRoot, 'packages/langchain/src'),
    relocatedSourcePath,
    {
      recursive: true,
    },
  );
  await writeFile(
    resolve(relocatedSourcePath, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );

  try {
    const { toUIMessageStream } = await import(
      `${pathToFileURL(resolve(relocatedSourcePath, 'index.ts')).href}?issue=17863`
    );

    const cjsAIChunks = await collect(
      toUIMessageStream(createGraphStream(cjsAIMessageChunk)),
    );
    const esmAIChunks = await collect(
      toUIMessageStream(createGraphStream(esmAIMessageChunk)),
    );
    const plainAIChunks = await collect(
      toUIMessageStream(createGraphStream({ ...cjsAIMessageChunk })),
    );

    const cjsToolMessage = new cjsMessages.ToolMessage({
      content: 'tool result',
      id: 'tool-message-1',
      tool_call_id: 'tool-call-1',
    });
    const cjsToolChunks = await collect(
      toUIMessageStream(createGraphStream(cjsToolMessage)),
    );
    const plainToolChunks = await collect(
      toUIMessageStream(createGraphStream({ ...cjsToolMessage })),
    );

    const cjsTextDeltas = cjsAIChunks.filter(
      chunk => chunk.type === 'text-delta',
    );
    const plainTextDeltas = plainAIChunks.filter(
      chunk => chunk.type === 'text-delta',
    );
    const esmTextDeltas = esmAIChunks.filter(
      chunk => chunk.type === 'text-delta',
    );
    const cjsToolOutputs = cjsToolChunks.filter(
      chunk => chunk.type === 'tool-output-available',
    );
    const plainToolOutputs = plainToolChunks.filter(
      chunk => chunk.type === 'tool-output-available',
    );

    console.log(
      JSON.stringify(
        {
          langchainCoreVersion: langchainCorePackage.version,
          cjsAndEsmClassesAreIdentical:
            cjsMessages.AIMessageChunk === publishedEsmMessages.AIMessageChunk,
          esmRecognizesCjsInstance:
            publishedEsmMessages.AIMessageChunk.isInstance(cjsAIMessageChunk),
          cjsAIEventTypes: cjsAIChunks.map(chunk => chunk.type),
          cjsTextDeltas,
          esmTextDeltas,
          plainObjectTextDeltas: plainTextDeltas,
          esmRecognizesCjsToolMessage:
            publishedEsmMessages.ToolMessage.isInstance(cjsToolMessage),
          cjsToolOutputs,
          plainObjectToolOutputs: plainToolOutputs,
        },
        null,
        2,
      ),
    );

    if (
      plainTextDeltas.length !== 1 ||
      plainTextDeltas[0].delta !== 'Hello!' ||
      esmTextDeltas.length !== 1 ||
      esmTextDeltas[0].delta !== 'Hello!' ||
      plainToolOutputs.length !== 1 ||
      plainToolOutputs[0].toolCallId !== 'tool-call-1'
    ) {
      throw new Error(
        'Reproduction setup error: the ESM comparison or reported plain-object workaround did not emit the expected events',
      );
    }

    if (cjsTextDeltas.length === 0) {
      throw new Error(
        'ISSUE_17863_REPRODUCED: toUIMessageStream silently dropped the text-delta event from a CommonJS AIMessageChunk',
      );
    }

    if (cjsTextDeltas[0]?.delta !== 'Hello!') {
      throw new Error(
        `Expected a text-delta containing "Hello!", received ${JSON.stringify(cjsTextDeltas)}`,
      );
    }
  } finally {
    await rm(relocatedSourcePath, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
