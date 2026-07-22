import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { DownloadError, generateText } from 'ai';

async function main() {
  try {
    await generateText({
      model: amazonBedrock('anthropic.claude-3-haiku-20240307-v1:0'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the image.' },
            {
              type: 'file',
              data: new URL('s3://ai-sdk-reproduction-15792/path/to/image.png'),
              mediaType: 'image/png',
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (
      DownloadError.isInstance(error) &&
      error.message.includes('URL scheme must be http, https, or data, got s3:')
    ) {
      console.error(
        'ISSUE_REPRODUCED: Amazon Bedrock rejected an s3:// image URL before inference: URL scheme must be http, https, or data, got s3:',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log('Amazon Bedrock accepted the s3:// image URL.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
