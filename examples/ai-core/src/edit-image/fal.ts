import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { fal } from '@ai-sdk/fal';

/*
    fal.ai Image Editing API
    
    fal.ai provides various image editing models including:
    - fal-ai/flux-pro/kontext: Context-aware editing with natural language
    - fal-ai/flux-general/inpainting: Inpainting with mask
    - fal-ai/flux-general/image-to-image: Image-to-image transformation
    
    The API accepts:
    - image_url: URL or base64 data URI of the input image
    - mask_url: URL or base64 data URI of the mask (for inpainting)
    - prompt: Text description of the edit
    
    Documentation: https://fal.ai/models
*/

const KONTEXT_MODEL = 'fal-ai/flux-pro/kontext';
const INPAINTING_MODEL = 'fal-ai/flux-general/inpainting';

// ============================================================================
// Native Fetch Examples
// ============================================================================

/**
 * Edit image using native fetch with fal.ai API (Kontext model)
 */
async function editImageNative() {
  const imageBuffer = readFileSync('data/comic-cat.png');
  const base64Image = imageBuffer.toString('base64');

  console.log('Editing image with fal.ai Kontext API...');

  const response = await fetch(`https://queue.fal.run/${KONTEXT_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'Turn the cat into a golden retriever dog',
      image_url: `data:image/png;base64,${base64Image}`,
      num_images: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`fal.ai API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));

  // Download the generated image
  if (data.images && data.images[0]) {
    const imageResponse = await fetch(data.images[0].url);
    const arrayBuffer = await imageResponse.arrayBuffer();
    await presentImages([
      {
        base64: '',
        mediaType: 'image/jpeg',
        uint8Array: new Uint8Array(arrayBuffer),
      },
    ]);
  }
}

/**
 * Inpainting using native fetch with fal.ai API
 */
async function inpaintingNative() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png');
  const maskBuffer = readFileSync('data/sunlit_lounge_mask.png');

  const base64Image = imageBuffer.toString('base64');
  const base64Mask = maskBuffer.toString('base64');

  console.log('Inpainting with fal.ai API...');

  const response = await fetch(`https://queue.fal.run/${INPAINTING_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'A sunlit indoor lounge area with a pool containing a flamingo',
      image_url: `data:image/png;base64,${base64Image}`,
      mask_url: `data:image/png;base64,${base64Mask}`,
      num_images: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`fal.ai API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));

  if (data.images && data.images[0]) {
    const imageResponse = await fetch(data.images[0].url);
    const arrayBuffer = await imageResponse.arrayBuffer();
    await presentImages([
      {
        base64: '',
        mediaType: 'image/jpeg',
        uint8Array: new Uint8Array(arrayBuffer),
      },
    ]);
  }
}

// ============================================================================
// AI SDK Examples using generateImage()
// ============================================================================

/**
 * Edit image using AI SDK with Kontext model
 */
async function editImageAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Turn the cat into a golden retriever dog';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: fal.image(KONTEXT_MODEL),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Inpainting using AI SDK
 */
async function inpaintingAi() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png');
  const maskBuffer = readFileSync('data/sunlit_lounge_mask.png');

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
    model: fal.image(INPAINTING_MODEL),
    prompt: {
      text: prompt,
      images: [imageBuffer],
      mask: maskBuffer,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Edit image using provider options (alternative approach)
 */
async function editWithProviderOptionsAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');
  const base64Image = imageBuffer.toString('base64');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Make the cat wear a tiny hat';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: fal.image(KONTEXT_MODEL),
    prompt: prompt,
    providerOptions: {
      fal: {
        imageUrl: `data:image/png;base64,${base64Image}`,
        guidanceScale: 3.5,
        safetyTolerance: 2,
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

// ============================================================================
// Run Examples
// ============================================================================

// Native fetch examples:
// editImageNative().catch(console.error);
// inpaintingNative().catch(console.error);

// AI SDK examples:
// editImageAi().catch(console.error);
// inpaintingAi().catch(console.error);
editWithProviderOptionsAi().catch(console.error);
