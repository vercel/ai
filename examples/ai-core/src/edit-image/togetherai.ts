import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import {
  togetherai,
  type TogetherAIImageProviderOptions,
} from '@ai-sdk/togetherai';

/*
    Together AI Image Editing API
    
    Together AI supports image editing using FLUX Kontext models:
    - black-forest-labs/FLUX.1-kontext-pro: Production quality, balanced speed
    - black-forest-labs/FLUX.1-kontext-max: Maximum image fidelity
    - black-forest-labs/FLUX.1-kontext-dev: Development and experimentation
    
    The API accepts:
    - image_url: URL or base64 data URI of the reference image
    - prompt: Text description of the edit to make
    - steps: Number of generation steps (higher = better quality)
    
    Note: Together AI does NOT support mask-based inpainting.
    Instead, use descriptive prompts to specify what to change.
    
    Documentation: https://docs.together.ai/docs/quickstart-flux-kontext
*/

const KONTEXT_MODEL = 'black-forest-labs/FLUX.1-kontext-pro';

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Edit image using native fetch with Together AI Kontext API
 */
async function editImageNative() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png');
  const base64Image = imageBuffer.toString('base64');

  console.log('Editing image with Together AI Kontext API...');

  const response = await fetch(
    'https://api.together.xyz/v1/images/generations',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: KONTEXT_MODEL,
        prompt: 'Add a flamingo to the pool',
        image_url: `data:image/png;base64,${base64Image}`,
        steps: 28,
        width: 1024,
        height: 1024,
        response_format: 'base64',
        disable_safety_checker: true,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`Together AI API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.data && data.data[0]) {
    const uint8Array = base64ToUint8Array(data.data[0].b64_json);
    await presentImages([
      {
        base64: data.data[0].b64_json,
        mediaType: 'image/png',
        uint8Array,
      },
    ]);
  }
}

/**
 * Edit image with URL reference using native fetch
 */
async function editWithUrlNative() {
  console.log('Editing image from URL with Together AI Kontext API...');

  const response = await fetch(
    'https://api.together.xyz/v1/images/generations',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: KONTEXT_MODEL,
        prompt: 'Make the background a flush rainforest',
        image_url: 'https://github.com/gr2m.png',
        steps: 28,
        width: 1024,
        height: 1024,
        response_format: 'base64',
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`Together AI API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.data && data.data[0]) {
    const uint8Array = base64ToUint8Array(data.data[0].b64_json);
    await presentImages([
      {
        base64: data.data[0].b64_json,
        mediaType: 'image/png',
        uint8Array,
      },
    ]);
  }
}

/**
 * Edit image using AI SDK with Kontext model
 */
async function editImageAi() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Add a flamingo to the pool';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: togetherai.image(KONTEXT_MODEL),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    size: '1024x1024',
    providerOptions: {
      togetherai: {
        steps: 28,
        disable_safety_checker: true,
      } satisfies TogetherAIImageProviderOptions,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Edit image using AI SDK with URL reference
 */
async function editWithUrlAi() {
  const prompt = 'Make the background a flush rainforest';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: togetherai.image(KONTEXT_MODEL),
    prompt: {
      text: prompt,
      images: ['https://github.com/gr2m.png'],
    },
    size: '1024x1024',
    providerOptions: {
      togetherai: {
        steps: 28,
      } satisfies TogetherAIImageProviderOptions,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

// Run the examples
// Native fetch examples:
// editImageNative().catch(console.error);
// editWithUrlNative().catch(console.error);

// AI SDK examples:
// editImageAi().catch(console.error);
editWithUrlAi().catch(console.error);
