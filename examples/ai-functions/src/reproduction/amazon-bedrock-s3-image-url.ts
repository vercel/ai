import { bedrock } from '@ai-sdk/amazon-bedrock';
import { DownloadError, generateText, UnsupportedFunctionalityError } from 'ai';

const s3ImageUrl = new URL('s3://ai-sdk-reproduction-15792/path/to/image.png');

const messages = [
  {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'Describe the image.' },
      {
        type: 'file' as const,
        data: s3ImageUrl,
        mediaType: 'image/png',
      },
    ],
  },
];

async function main() {
  let downloadError: unknown;

  try {
    await generateText({
      model: bedrock('us.amazon.nova-2-lite-v1:0'),
      messages,
    });
  } catch (error) {
    downloadError = error;
  }

  if (
    !DownloadError.isInstance(downloadError) ||
    !downloadError.message.includes(
      'URL scheme must be http, https, or data, got s3:',
    )
  ) {
    throw downloadError;
  }

  try {
    await generateText({
      model: bedrock('us.amazon.nova-2-lite-v1:0'),
      messages,
      experimental_download: requests =>
        Promise.resolve(requests.map(() => null)),
    });
  } catch (error) {
    if (
      UnsupportedFunctionalityError.isInstance(error) &&
      error.message.includes("'File URL data' functionality not supported")
    ) {
      console.error(
        'CUSTOM_DOWNLOAD_ALSO_FAILED: Passing through the s3:// URL produced AI_UnsupportedFunctionalityError.',
      );
      console.error(
        'ISSUE_REPRODUCED: Amazon Bedrock rejected an s3:// image URL before inference: URL scheme must be http, https, or data, got s3:',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  throw new Error(
    'Default downloading rejected the s3:// URL, but custom pass-through unexpectedly succeeded.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
