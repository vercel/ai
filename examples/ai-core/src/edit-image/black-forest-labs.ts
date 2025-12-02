import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';

import 'dotenv/config';

type Flux2EditArguments = {
  /** Text description of the edit to be applied. Supports up to 32K tokens for long-form prompts. */
  prompt: string;
  /** Base64 encoded image or URL of image to use as reference. Supports up to 20MB or 20 megapixels. Input resolution: minimum 64x64, recommended up to 2MP, maximum 4MP (e.g., 2048x2048). Dimensions must be multiples of 16. */
  input_image: string;
  /** Additional reference images for multi-reference editing. Each parameter accepts base64 encoded image or URL. */
  input_image_2?: string | null;
  input_image_3?: string | null;
  input_image_4?: string | null;
  input_image_5?: string | null;
  input_image_6?: string | null;
  input_image_7?: string | null;
  input_image_8?: string | null;
  input_image_9?: string | null;
  /** Output width in pixels. Must be a multiple of 16. If omitted, matches input image width. */
  width?: number | null;
  /** Output height in pixels. Must be a multiple of 16. If omitted, matches input image height. */
  height?: number | null;
  /** Seed for reproducibility. If null or omitted, a random seed is used. Accepts any integer. */
  seed?: number | null;
  /** Moderation level for inputs and outputs. Value ranges from 0 (most strict) to 6 (more permissive). Default: 2 */
  safety_tolerance?: number;
  /** Desired format of the output image. Can be "jpeg" or "png". Default: "jpeg" */
  output_format?: 'jpeg' | 'png';
  /** [flex only] Guidance scale for generation. Controls how closely the output follows the prompt. Minimum: 1.5, maximum: 10, default: 4.5. */
  guidance?: number | null;
  /** [flex only] Number of inference steps. Maximum: 50, default: 50. */
  steps?: number | null;
  /** URL for asynchronous completion notification. Must be a valid HTTP/HTTPS URL. */
  webhook_url?: string | null;
  /** Secret for webhook signature verification, sent in the X-Webhook-Secret header. */
  webhook_secret?: string | null;
}

async function imagePathToBase64(imagePath: string): Promise<string> {
  const imageBuffer = readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

async function awaitImageAndRender(pollingUrl: string) {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const pollResponse = await fetch(`${pollingUrl}`, {
      headers: {
        accept: 'application/json',
        'x-key': process.env.BFL_API_KEY!,
      },
    });

    const result = await pollResponse.json();
    const status = result.status;
    console.log(`Status: ${status}`);

    if (status === 'Ready') {
      console.log(`Ready: ${result.result.sample}`);

      const imageResponse = await fetch(result.result.sample);
      const arrayBuffer = await imageResponse.arrayBuffer();
      presentImages([
        {
          uint8Array: new Uint8Array(arrayBuffer),
          base64: '',
          mediaType: '',
        },
      ]);
      break;
    } else if (status === 'Error' || status === 'Failed') {
      console.log(`Generation failed: ${JSON.stringify(result)}`);
      break;
    }
  }
}

async function generateImage() {
  const response = await fetch('https://api.bfl.ai/v1/flux-kontext-pro', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'x-key': process.env.BFL_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt:
        'A cat on its back legs running like a human is holding a big silver fish with its arms. The cat is running away from the shop owner and has a panicked look on his face. The scene is situated in a crowded market.',
      aspect_ratio: '1:1',
    }),
  });

  const request = await response.json();
  console.log(request);

  const requestId = request.id;
  const pollingUrl = request.polling_url;
  console.log(`Request ID: ${requestId}`);
  console.log(`Polling URL: ${pollingUrl}`);
  await awaitImageAndRender(pollingUrl);
}

async function editImage() {
  const args: Flux2EditArguments = {
    prompt: 'A baby elephant with a shirt that has the logo from input image 1. Do not change the text of the logo.',
    input_image: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
    width: 1024,
    height: 768,
  };  
  const response = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
    method: 'POST',
    headers: { accept: 'application/json', 'x-key': process.env.BFL_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const request = await response.json();
  console.log(request);
  const requestId = request.id;
  const pollingUrl = request.polling_url;
  console.log(`Request ID: ${requestId}`);
  console.log(`Polling URL: ${pollingUrl}`);
  await awaitImageAndRender(pollingUrl);
}

editImage().catch(console.error);
