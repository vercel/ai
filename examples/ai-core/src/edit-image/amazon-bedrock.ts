import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';

/*
    Amazon Nova Canvas Image Editing API
    
    API Docs: 
    - https://docs.aws.amazon.com/nova/latest/userguide/image-gen-access.html
    - https://docs.aws.amazon.com/nova/latest/userguide/image-gen-code-examples.html
    
    Supported task types:
    - TEXT_IMAGE: Generate image from text prompt
    - INPAINTING: Modify area inside a mask (add/remove/replace elements)
    - OUTPAINTING: Modify area outside a mask (replace/extend background)
    - IMAGE_VARIATION: Create variations of an image
    - BACKGROUND_REMOVAL: Remove background from image
    - COLOR_GUIDED_GENERATION: Generate based on color palette
    
    Mask behavior:
    - INPAINTING: Black pixels = area to edit, White pixels = preserve
    - OUTPAINTING: White pixels = area to change, Black pixels = preserve
*/

const MODEL_ID = 'amazon.nova-canvas-v1:0';

/**
 * INPAINTING with AI SDK: Edit using a text mask prompt
 */
async function inpaintingWithMaskPromptAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'a cute corgi dog in the same style';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: bedrock.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    providerOptions: {
      bedrock: {
        maskPrompt: 'cat',
        quality: 'standard',
        cfgScale: 7.0,
      },
    },
    seed: 42,
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * INPAINTING with AI SDK: Edit using a mask image
 */
async function inpaintingWithMaskImageAi() {
  const image = readFileSync('data/sunlit_lounge.png');
  const mask = readFileSync('data/sunlit_lounge_mask_white_black.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(image),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt =
    'A sunlit indoor lounge area with a pool containing a flamingo';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: bedrock.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [image],
      mask: mask,
    },
    providerOptions: {
      bedrock: {
        quality: 'standard',
        cfgScale: 7.0,
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * OUTPAINTING with AI SDK: Replace the background
 */
async function outpaintingAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'A beautiful sunset landscape with mountains';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: bedrock.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    providerOptions: {
      bedrock: {
        taskType: 'OUTPAINTING',
        maskPrompt: 'background',
        outPaintingMode: 'DEFAULT',
        quality: 'standard',
        cfgScale: 7.0,
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * BACKGROUND_REMOVAL with AI SDK: Remove background automatically
 */
async function backgroundRemovalAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  console.log('Removing background...');

  const { images } = await generateImage({
    model: bedrock.image(MODEL_ID),
    prompt: {
      images: [imageBuffer],
    },
    providerOptions: {
      bedrock: {
        taskType: 'BACKGROUND_REMOVAL',
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * IMAGE_VARIATION with AI SDK: Create variations
 */
async function imageVariationAi() {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Modernize the style, photo-realistic, 8k, hdr';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: bedrock.image(MODEL_ID),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    providerOptions: {
      bedrock: {
        taskType: 'IMAGE_VARIATION',
        similarityStrength: 0.7,
        negativeText: 'bad quality, low resolution, cartoon',
        quality: 'standard',
        cfgScale: 7.0,
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

// ============================================================================
// Run Examples
// ============================================================================

// AI SDK examples:
// inpaintingWithMaskPromptAi().catch(console.error);
// inpaintingWithMaskImageAi().catch(console.error);
outpaintingAi().catch(console.error);
// backgroundRemovalAi().catch(console.error);
// imageVariationAi().catch(console.error);
