import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { deepinfra } from '@ai-sdk/deepinfra';

/*
    DeepInfra Image Editing API
    
    DeepInfra provides an OpenAI-compatible image editing API at:
    https://api.deepinfra.com/v1/openai/images/edits
    
    Supported models for image editing:
    - black-forest-labs/FLUX.1-Kontext-dev: Natural language image editing
    - black-forest-labs/FLUX.1-Kontext-pro: Professional version with higher quality
    
    The API accepts:
    - image: Input image (form data)
    - mask: Optional mask image (form data) 
    - prompt: Text description of the edit
    - model: Model to use
    - n: Number of images
    - size: Output size
*/

const MODEL_ID = 'Qwen/Qwen-Image-Edit';

// ============================================================================
// Native Fetch Examples
// ============================================================================

/**
 * Edit image using native fetch with DeepInfra's OpenAI-compatible API
 */
async function editImageNative() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;

  const formData = new FormData();
  formData.append('model', MODEL_ID);
  formData.append('prompt', 'Turn the cat into a golden retriever dog');
  formData.append('image', new Blob([imageBuffer], { type: 'image/png' }));
  formData.append('n', '1');
  formData.append('size', '1024x1024');

  console.log('Editing image with DeepInfra API...');

  const response = await fetch(
    'https://api.deepinfra.com/v1/openai/images/edits',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPINFRA_API_KEY}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`DeepInfra API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));

  // Extract base64 image from response
  const base64Image = data.data[0].b64_json;
  await presentImages([
    {
      base64: '',
      mediaType: 'image/png',
      uint8Array: Buffer.from(base64Image, 'base64'),
    },
  ]);
}

/**
 * Edit image with mask using native fetch
 */
async function editImageWithMaskNative() {
  const imageBuffer = readFileSync('data/sunlit_lounge.png') as BlobPart;
  const maskBuffer = readFileSync('data/sunlit_lounge_mask.png') as BlobPart;

  const formData = new FormData();
  formData.append('model', MODEL_ID);
  formData.append(
    'prompt',
    'A sunlit indoor lounge area with a pool containing a flamingo',
  );
  formData.append(
    'image',
    new Blob([imageBuffer], { type: 'image/png' }),
    'image.png',
  );
  formData.append(
    'mask',
    new Blob([maskBuffer], { type: 'image/png' }),
    'mask.png',
  );
  formData.append('n', '1');

  console.log('Editing image with mask using DeepInfra API...');

  const response = await fetch(
    'https://api.deepinfra.com/v1/openai/images/edits',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPINFRA_API_KEY}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    throw new Error(`DeepInfra API error: ${response.status}`);
  }

  const data = await response.json();
  const base64Image = data.data[0].b64_json;
  await presentImages([
    {
      base64: '',
      mediaType: 'image/png',
      uint8Array: Buffer.from(base64Image, 'base64'),
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
    model: deepinfra.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    size: '1024x1024',
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Edit image with mask using AI SDK
 */
async function editImageWithMaskAi() {
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
    model: deepinfra.image(MODEL_ID),
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
 * Combine multiple images using AI SDK
 */
async function combineImagesAi() {
  const cat = readFileSync('data/comic-cat.png');
  const dog = readFileSync('data/comic-dog.png');

  console.log('INPUT IMAGES:');
  await presentImages([
    {
      uint8Array: new Uint8Array(cat),
      base64: '',
      mediaType: 'image/png',
    },
    {
      uint8Array: new Uint8Array(dog),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt =
    'Create a scene with both animals together, a cat and a dog playing as friends';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: deepinfra.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [cat, dog],
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
// editImageWithMaskNative().catch(console.error);

// AI SDK examples:
// editImageAi().catch(console.error);
editImageWithMaskAi().catch(console.error);
// combineImagesAi().catch(console.error);
