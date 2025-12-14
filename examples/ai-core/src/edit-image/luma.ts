import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { luma, type LumaImageProviderOptions } from '@ai-sdk/luma';

/*
    Luma AI Image Editing API
    
    Luma AI supports several image reference types:
    - image_ref: Guide generation using reference images (up to 4 images)
    - style_ref: Apply a specific style to your generation
    - character_ref: Create consistent characters using identity images
    - modify_image_ref: Transform images with prompt guidance and weight control
    
    IMPORTANT LIMITATIONS:
    1. Luma AI ONLY supports URL-based images. Base64 or Uint8Array data is NOT supported.
       You must host your images at publicly accessible URLs.
    2. Luma AI does NOT support mask-based inpainting. Editing is prompt-driven only.
    
    API Documentation: https://docs.lumalabs.ai/docs/image-generation
*/

const MODEL_ID = 'photon-1';

// Example image URLs from Luma documentation
const TIGER_IN_SNOW_IMAGE_URL =
  'https://storage.cdn-luma.com/dream_machine/7e4fe07f-1dfd-4921-bc97-4bcf5adea39a/video_0_thumb.jpg';
const GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL =
  'https://staging.storage.cdn-luma.com/dream_machine/400460d3-cc24-47ae-a015-d4d1c6296aba/38cc78d7-95aa-4e6e-b1ac-4123ce24725e_image0c73fa8a463114bf89e30892a301c532e.jpg';

// ============================================================================
// Native Fetch Examples
// ============================================================================

/**
 * Image Reference - Guide generation using reference images
 * Use this to create variations or when you have a concept that's hard to describe.
 * You can use up to 4 images as references.
 */
async function imageReferenceNative() {
  console.log('Image Reference with Luma API...');

  const createResponse = await fetch(
    'https://api.lumalabs.ai/dream-machine/v1/generations/image',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'sunglasses',
        model: MODEL_ID,
        image_ref: [
          {
            url: TIGER_IN_SNOW_IMAGE_URL,
            weight: 0.85,
          },
        ],
      }),
    },
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Error:', error);
    throw new Error(`Luma API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  console.log('Generation started:', createData.id);

  const imageUrl = await pollForCompletion(createData.id);

  const imageResponse = await fetch(imageUrl);
  const arrayBuffer = await imageResponse.arrayBuffer();
  await presentImages([
    {
      base64: '',
      mediaType: 'image/jpeg',
      uint8Array: new Uint8Array(arrayBuffer),
    },
  ]);
}

/**
 * Style Reference - Apply a specific style to your generation
 * Use the weight parameter to tune the influence of the style image.
 */
async function styleReferenceNative() {
  console.log('Style Reference with Luma API...');

  const createResponse = await fetch(
    'https://api.lumalabs.ai/dream-machine/v1/generations/image',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'dog',
        model: MODEL_ID,
        style_ref: [
          {
            url: GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL,
            weight: 0.8,
          },
        ],
      }),
    },
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Error:', error);
    throw new Error(`Luma API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  console.log('Generation started:', createData.id);

  const imageUrl = await pollForCompletion(createData.id);

  const imageResponse = await fetch(imageUrl);
  const arrayBuffer = await imageResponse.arrayBuffer();
  await presentImages([
    {
      base64: '',
      mediaType: 'image/jpeg',
      uint8Array: new Uint8Array(arrayBuffer),
    },
  ]);
}

/**
 * Character Reference - Create consistent and personalized characters
 * You can use up to 4 images of the same person to build one identity.
 * More images = better character representation.
 */
async function characterReferenceNative() {
  console.log('Character Reference with Luma API...');

  const createResponse = await fetch(
    'https://api.lumalabs.ai/dream-machine/v1/generations/image',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'man as a warrior',
        model: MODEL_ID,
        character_ref: {
          identity0: {
            images: [GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL],
          },
        },
      }),
    },
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Error:', error);
    throw new Error(`Luma API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  console.log('Generation started:', createData.id);

  const imageUrl = await pollForCompletion(createData.id);

  const imageResponse = await fetch(imageUrl);
  const arrayBuffer = await imageResponse.arrayBuffer();
  await presentImages([
    {
      base64: '',
      mediaType: 'image/jpeg',
      uint8Array: new Uint8Array(arrayBuffer),
    },
  ]);
}

/**
 * Modify Image - Transform images with prompt guidance
 * Use weight to control influence: higher = closer to input, lower = more creative.
 * Note: Changing colors works better with lower weight (0.0-0.1).
 */
async function modifyImageNative() {
  console.log('Modify Image with Luma API...');

  const createResponse = await fetch(
    'https://api.lumalabs.ai/dream-machine/v1/generations/image',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'transform all the flowers to sunflowers',
        model: MODEL_ID,
        modify_image_ref: {
          url: GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL,
          weight: 1.0,
        },
      }),
    },
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Error:', error);
    throw new Error(`Luma API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  console.log('Generation started:', createData.id);

  const imageUrl = await pollForCompletion(createData.id);

  const imageResponse = await fetch(imageUrl);
  const arrayBuffer = await imageResponse.arrayBuffer();
  await presentImages([
    {
      base64: '',
      mediaType: 'image/jpeg',
      uint8Array: new Uint8Array(arrayBuffer),
    },
  ]);
}

/**
 * Combined References - No error is thrown but I don't see an effect when combining.
 */
async function combinedReferencesNative() {
  console.log('Combined References with Luma API...');

  const createResponse = await fetch(
    'https://api.lumalabs.ai/dream-machine/v1/generations/image',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'a warrior with sunglasses',
        model: MODEL_ID,
        // Combine image_ref and style_ref for guided generation with style
        image_ref: [
          {
            url: TIGER_IN_SNOW_IMAGE_URL,
            weight: 0.7,
          },
        ],
        style_ref: [
          {
            url: GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL,
            weight: 0.5,
          },
        ],
      }),
    },
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Error:', error);
    throw new Error(`Luma API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  console.log('Generation started:', createData.id);

  const imageUrl = await pollForCompletion(createData.id);

  const imageResponse = await fetch(imageUrl);
  const arrayBuffer = await imageResponse.arrayBuffer();
  await presentImages([
    {
      base64: '',
      mediaType: 'image/jpeg',
      uint8Array: new Uint8Array(arrayBuffer),
    },
  ]);
}

async function pollForCompletion(generationId: string): Promise<string> {
  const maxAttempts = 60;
  const pollInterval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const statusResponse = await fetch(
      `https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        },
      },
    );

    const statusData = await statusResponse.json();
    console.log(`Status: ${statusData.state}`);

    if (statusData.state === 'completed') {
      return statusData.assets.image;
    } else if (statusData.state === 'failed') {
      throw new Error(`Generation failed: ${statusData.failure_reason}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Generation timed out');
}

// ============================================================================
// AI SDK Examples using generateImage()
// ============================================================================

/**
 * Image Reference using AI SDK (default mode)
 *
 * When you pass images via prompt.images, Luma defaults to image_ref mode.
 * IMPORTANT: Luma only supports URL-based images.
 */
async function imageReferenceAi() {
  console.log('Image Reference with AI SDK...');
  const prompt = 'Add sunglasses to the tiger';

  const { images } = await generateImage({
    model: luma.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [TIGER_IN_SNOW_IMAGE_URL], // Uses image_ref by default
    },
    providerOptions: {
      luma: {
        images: [{ weight: 0.85 }],
      } satisfies LumaImageProviderOptions,
    },
  });

  await presentImages(images);
}

/**
 * Style Reference using AI SDK
 *
 * Set referenceType to 'style_ref' to apply a style from reference images.
 */
async function styleReferenceAi() {
  console.log('Style Reference with AI SDK...');
  const prompt = 'dog';

  const { images } = await generateImage({
    model: luma.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL],
    },
    providerOptions: {
      luma: {
        referenceType: 'style_ref',
        images: [{ weight: 0.8 }], // Optional: customize weight per image
      } satisfies LumaImageProviderOptions,
    },
  });

  await presentImages(images);
}

/**
 * Character Reference using AI SDK
 *
 * Set referenceType to 'character_ref' to create consistent characters.
 * Supports up to 4 images for better character representation.
 */
async function characterReferenceAi() {
  console.log('Character Reference with AI SDK...');
  const prompt = 'man as a warrior';

  const { images } = await generateImage({
    model: luma.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL],
    },
    providerOptions: {
      luma: {
        referenceType: 'character_ref',
      } satisfies LumaImageProviderOptions,
    },
  });

  await presentImages(images);
}

/**
 * Modify Image using AI SDK
 *
 * Set referenceType to 'modify_image_ref' to transform an existing image.
 * Only supports a single input image.
 */
async function modifyImageAi() {
  console.log('Modify Image with AI SDK...');
  const prompt = 'transform all the flowers to sunflowers';

  const { images } = await generateImage({
    model: luma.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL],
    },
    providerOptions: {
      luma: {
        referenceType: 'modify_image_ref',
        images: [{ weight: 1.0 }], // Higher weight = closer to input
      } satisfies LumaImageProviderOptions,
    },
  });

  await presentImages(images);
}

/**
 * Multiple Images with Custom Weights
 *
 * For image_ref and character_ref, you can pass up to 4 images
 * with individual weight configurations.
 */
async function multipleImagesAi() {
  console.log('Multiple Images with AI SDK...');
  const prompt = 'a warrior with sunglasses';

  const { images } = await generateImage({
    model: luma.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [TIGER_IN_SNOW_IMAGE_URL, GUY_SMILING_WITH_FLOWERS_AND_HAT_IMAGE_URL],
    },
    providerOptions: {
      luma: {
        referenceType: 'image_ref', // Default, but explicit here
        images: [
          { weight: 0.9 }, // First image has high influence
          { weight: 0.5 }, // Second image has lower influence
        ],
      } satisfies LumaImageProviderOptions,
    },
  });

  await presentImages(images);
}

// ============================================================================
// Run Examples
// ============================================================================

// Native fetch examples:
// imageReferenceNative().catch(console.error);
// styleReferenceNative().catch(console.error);
// characterReferenceNative().catch(console.error);
// modifyImageNative().catch(console.error);
// combinedReferencesNative().catch(console.error);

// AI SDK examples (uncomment one to run):
// imageReferenceAi().catch(console.error);
// styleReferenceAi().catch(console.error);
// characterReferenceAi().catch(console.error);
// modifyImageAi().catch(console.error);
// multipleImagesAi().catch(console.error);
