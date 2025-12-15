import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import {
  replicate,
  type ReplicateImageProviderOptions,
} from '@ai-sdk/replicate';

/*
    Replicate Image Editing API
    
    Replicate provides various image editing models including:
    - black-forest-labs/flux-fill-pro: FLUX Fill Pro inpainting/outpainting
    - black-forest-labs/flux-fill-dev: FLUX Fill Dev (open access)
    - Many other img2img and editing models
    
    The API accepts:
    - image: URL or base64 data URI of the input image
    - mask: URL or base64 data URI of the mask (white = inpaint, black = keep)
    - prompt: Text description of the edit
    - Model-specific parameters via providerOptions
    
    Note: Different models have different parameter names and capabilities.
    Use providerOptions.replicate to pass model-specific parameters.
    
    Documentation: https://replicate.com/docs
*/

const INPAINTING_MODEL = 'black-forest-labs/flux-fill-pro';

/**
 * Inpainting using native fetch with Replicate API
 */
async function inpaintingNative() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png');
  const maskBuffer = readFileSync('data/sunlit_lounge_mask_black_white.png');

  const base64Image = imageBuffer.toString('base64');
  const base64Mask = maskBuffer.toString('base64');

  console.log('Inpainting with Replicate API...');

  const response = await fetch(
    `https://api.replicate.com/v1/models/${INPAINTING_MODEL}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait', // Wait for the result synchronously
      },
      body: JSON.stringify({
        input: {
          prompt:
            'A sunlit indoor lounge area with a pool containing a flamingo',
          image: `data:image/png;base64,${base64Image}`,
          mask: `data:image/png;base64,${base64Mask}`,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 30,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`Replicate API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('Response status:', data.status);

  // Download the generated image
  const outputUrls = Array.isArray(data.output) ? data.output : [data.output];
  if (outputUrls[0]) {
    const imageResponse = await fetch(outputUrls[0]);
    const arrayBuffer = await imageResponse.arrayBuffer();
    await presentImages([
      {
        base64: '',
        mediaType: 'image/webp',
        uint8Array: new Uint8Array(arrayBuffer),
      },
    ]);
  }
}

/**
 * Inpainting using AI SDK
 */
async function inpaintingAi() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png');
  const maskBuffer = readFileSync('data/sunlit_lounge_mask_black_white.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt =
    'A sunlit indoor lounge area with a pool containing a flamingo';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: replicate.image(INPAINTING_MODEL),
    prompt: {
      text: prompt,
      images: [imageBuffer],
      mask: maskBuffer,
    },
    providerOptions: {
      replicate: {
        guidance_scale: 7.5,
        num_inference_steps: 30,
      } satisfies ReplicateImageProviderOptions,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

// Run the inpainting examples
// inpaintingNative().catch(console.error);
inpaintingAi().catch(console.error);
