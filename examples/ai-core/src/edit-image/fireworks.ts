import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { fireworks } from '@ai-sdk/fireworks';

/*
    Fireworks Image Editing API
    
    Fireworks provides image editing through FLUX Kontext models:
    - accounts/fireworks/models/flux-kontext-pro: Context-aware editing
    - accounts/fireworks/models/flux-kontext-max: Higher quality version
    
    The API accepts:
    - prompt: Text description of the edit
    - input_image: Base64 data URI or URL of the input image
    - aspect_ratio: Optional aspect ratio
    - output_format: 'jpeg' or 'png'
    - safety_tolerance: 0-6 (moderation level)
    
    Note: Fireworks Kontext models do NOT support explicit masks.
    Editing is prompt-driven - describe what you want to change.
    
    Documentation: https://fireworks.ai/docs/api-reference/generate-or-edit-image-using-flux-kontext
*/

const MODEL_ID = 'accounts/fireworks/models/flux-kontext-pro';

// ============================================================================
// Native Fetch Examples
// ============================================================================

/**
 * Edit image using native fetch with Fireworks API
 */
async function editImageNative() {
  const imageBuffer = readFileSync('data/comic-cat.png');
  const base64Image = imageBuffer.toString('base64');

  console.log('Editing image with Fireworks Kontext API...');

  const response = await fetch(
    `https://api.fireworks.ai/inference/v1/workflows/${MODEL_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Turn the cat into a golden retriever dog',
        input_image: base64Image
      }),
    },
  );

  
  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`Fireworks API error: ${response.status}`);
  }

  // first response returns {"request_id":"<id>"}

  // Response is binary image data
  console.dir(await response.text())

  // const arrayBuffer = await response.arrayBuffer();
  // await presentImages([
  //   {
  //     base64: '',
  //     mediaType: 'image/jpeg',
  //     uint8Array: new Uint8Array(arrayBuffer),
  //   },
  // ]);
}

/**
 * Edit image with URL using native fetch
 */
async function editImageWithUrlNative() {
  console.log('Editing image with URL using Fireworks API...');

  const response = await fetch(
    `https://api.fireworks.ai/inference/v1/workflows/${MODEL_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Add a colorful sunset in the background',
        input_image:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg',
        output_format: 'jpeg',
        aspect_ratio: '16:9',
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`Fireworks API error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await presentImages([
    {
      base64: '',
      mediaType: 'image/jpeg',
      uint8Array: new Uint8Array(arrayBuffer),
    },
  ]);
}

// ============================================================================
// AI SDK Examples using generateImage()
// ============================================================================

/**
 * Edit image using AI SDK
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
    model: fireworks.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    providerOptions: {
      fireworks: {
        output_format: 'jpeg',
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Edit image with styling using AI SDK
 */
async function styleTransferAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Transform this into a watercolor painting style';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: fireworks.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    aspectRatio: '1:1',
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Edit image with provider options using AI SDK
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

  const prompt = 'Make the cat wear a tiny party hat';
  console.log(`PROMPT: ${prompt}`);

  // Using provider options to pass input_image directly
  const { images } = await generateImage({
    model: fireworks.image(MODEL_ID),
    prompt: prompt,
    providerOptions: {
      fireworks: {
        input_image: `data:image/png;base64,${base64Image}`,
        output_format: 'jpeg',
        safety_tolerance: 2,
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
editImageNative().catch(console.error);
// editImageWithUrlNative().catch(console.error);

// AI SDK examples:
// editImageAi().catch(console.error);
// styleTransferAi().catch(console.error);
// editWithProviderOptionsAi().catch(console.error);
