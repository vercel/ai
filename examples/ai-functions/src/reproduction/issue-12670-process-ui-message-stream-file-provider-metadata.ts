import {
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const expectedProviderMetadata = {
  customProvider: {
    fileId: 'file-12670',
  },
};

function createChunkStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

async function main() {
  const stream = createChunkStream([
    { type: 'start', messageId: 'msg-12670' },
    { type: 'start-step' },
    {
      type: 'file',
      mediaType: 'image/png',
      url: 'data:image/png;base64,ZmFrZS1wbmc=',
      providerMetadata: expectedProviderMetadata,
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ]);

  let latestMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({ stream })) {
    latestMessage = message;
  }

  const filePart = latestMessage?.parts.find(part => part.type === 'file');
  const providerMetadataPreserved =
    JSON.stringify(filePart?.providerMetadata) ===
    JSON.stringify(expectedProviderMetadata);

  console.log(
    JSON.stringify(
      {
        providerMetadataPreserved,
        filePart,
      },
      null,
      2,
    ),
  );

  if (filePart == null) {
    throw new Error('No file part was produced from the UI message stream.');
  }

  if (!providerMetadataPreserved) {
    throw new Error(
      'Reproduced issue #12670: providerMetadata was not preserved on the file part.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
