import { convertModelMessages } from '@ai-sdk/langchain';
import type { ModelMessage } from 'ai';
import { isDeepStrictEqual } from 'node:util';

async function main() {
  const urlImageMessage: ModelMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image.' },
      {
        type: 'image',
        image: new URL('https://example.com/image.jpg'),
      },
    ],
  };

  const binaryImageMessage: ModelMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image.' },
      {
        type: 'image',
        image: new Uint8Array([1, 2, 3]),
        mediaType: 'image/png',
      },
    ],
  };

  const nonImageFileMessage: ModelMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'Summarize this file.' },
      {
        type: 'file',
        data: { type: 'data', data: 'JVBERi0xLjQK' },
        mediaType: 'application/pdf',
      },
    ],
  };

  const [urlImage] = convertModelMessages([urlImageMessage]);
  const [binaryImage] = convertModelMessages([binaryImageMessage]);
  const [nonImageFile] = convertModelMessages([nonImageFileMessage]);

  const actual = {
    urlImage: urlImage.content,
    binaryImage: binaryImage.content,
    nonImageFile: nonImageFile.content,
  };

  const expected = {
    urlImage: [
      { type: 'text', text: 'Describe this image.' },
      { type: 'image', url: 'https://example.com/image.jpg' },
    ],
    binaryImage: [
      { type: 'text', text: 'Describe this image.' },
      { type: 'image', data: 'AQID', mimeType: 'image/png' },
    ],
    nonImageFile: [
      { type: 'text', text: 'Summarize this file.' },
      {
        type: 'file',
        data: 'JVBERi0xLjQK',
        mimeType: 'application/pdf',
        filename: 'file.pdf',
      },
    ],
  };

  const urlImageIsCanonical = isDeepStrictEqual(
    actual.urlImage,
    expected.urlImage,
  );
  const binaryImageIsCanonical = isDeepStrictEqual(
    actual.binaryImage,
    expected.binaryImage,
  );
  const nonImageFileIsCanonical = isDeepStrictEqual(
    actual.nonImageFile,
    expected.nonImageFile,
  );

  console.log(JSON.stringify({ expected, actual }, null, 2));

  if (!urlImageIsCanonical || !binaryImageIsCanonical) {
    throw new Error(
      'Reproduced issue #11943: image inputs emit OpenAI-specific image_url blocks instead of LangChain canonical image ContentBlocks',
    );
  }

  if (!nonImageFileIsCanonical) {
    throw new Error(
      'Comparison failed: non-image files did not emit the expected LangChain canonical file ContentBlock',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
