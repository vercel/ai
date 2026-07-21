import type { UserContent } from 'ai';

async function main() {
  const { convertUserContent } = await import(
    new URL('../../../../packages/langchain/src/utils.ts', import.meta.url).href
  );

  const urlMessage = convertUserContent([
    { type: 'text', text: 'Describe this image.' },
    { type: 'image', image: 'https://example.com/image.jpg' },
  ] satisfies UserContent);

  const binaryMessage = convertUserContent([
    { type: 'text', text: 'Describe this image.' },
    {
      type: 'image',
      image: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    },
  ] satisfies UserContent);

  const pdfMessage = convertUserContent([
    { type: 'text', text: 'Summarize this document.' },
    {
      type: 'file',
      data: 'https://example.com/document.pdf',
      mediaType: 'application/pdf',
    },
  ] satisfies UserContent);

  const urlImageBlock = urlMessage.content[1];
  const binaryImageBlock = binaryMessage.content[1];
  const pdfFileBlock = pdfMessage.content[1];

  console.log(
    JSON.stringify(
      {
        urlImageBlock,
        binaryImageBlock,
        pdfFileBlock,
        urlMessageOutputVersion:
          urlMessage.response_metadata.output_version ?? null,
        normalizedUrlContentBlocks: urlMessage.contentBlocks,
      },
      null,
      2,
    ),
  );

  const emittedOpenAIUrlBlock =
    typeof urlImageBlock === 'object' &&
    urlImageBlock != null &&
    urlImageBlock.type === 'image_url';
  const emittedOpenAIBinaryBlock =
    typeof binaryImageBlock === 'object' &&
    binaryImageBlock != null &&
    binaryImageBlock.type === 'image_url';
  const emittedCanonicalPdfBlock =
    typeof pdfFileBlock === 'object' &&
    pdfFileBlock != null &&
    pdfFileBlock.type === 'file';

  if (
    emittedOpenAIUrlBlock &&
    emittedOpenAIBinaryBlock &&
    emittedCanonicalPdfBlock
  ) {
    throw new Error(
      'Reproduced issue #11943: @ai-sdk/langchain emitted OpenAI image_url blocks instead of canonical LangChain image blocks.',
    );
  }

  if (!emittedCanonicalPdfBlock) {
    throw new Error(
      'Expected the non-image PDF input to use a canonical LangChain file block.',
    );
  }

  const expectedUrlBlock = {
    type: 'image',
    url: 'https://example.com/image.jpg',
  };
  const expectedBinaryBlock = {
    type: 'image',
    data: 'AQID',
    mimeType: 'image/png',
  };

  if (
    JSON.stringify(urlImageBlock) !== JSON.stringify(expectedUrlBlock) ||
    JSON.stringify(binaryImageBlock) !== JSON.stringify(expectedBinaryBlock)
  ) {
    throw new Error(
      'Image inputs did not use the expected canonical LangChain image block shapes.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
