import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { experimental_generateImage as generateImage } from 'ai';
import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

/*
    This example demonstrates image editing using the @ai-sdk/openai-compatible package.
    
    The openai-compatible provider can be used with any OpenAI-compatible image API
    that supports the /images/generations and /images/edits endpoints.

    For this example, we're using OpenAI's API directly, but you could configure
    it to work with any compatible provider by changing the baseURL.
*/

// Create an OpenAI-compatible provider pointing to OpenAI's API
const provider = createOpenAICompatible({
  name: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL_ID = 'gpt-image-1';

/**
 * Replace a character in an image
 */
async function replaceCharacter() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;
  const catImage = await new Blob([imageBuffer], {
    type: 'image/png',
  }).arrayBuffer();

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(catImage),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt =
    'Turn the cat into a dog but retain the style and dimensions of the original image';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: provider.imageModel(MODEL_ID),
    prompt: {
      text: prompt,
      images: [catImage],
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Remove background from an image
 */
async function removeBackground() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;
  const catImage = await new Blob([imageBuffer], {
    type: 'image/png',
  }).arrayBuffer();

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(catImage),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'do not change anything';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: provider.imageModel(MODEL_ID),
    prompt: {
      text: prompt,
      images: [catImage],
    },
    providerOptions: {
      openai: {
        background: 'transparent',
        output_format: 'png',
      },
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Upscale an image
 */
async function upscaleImage() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;
  const catImage = await new Blob([imageBuffer], {
    type: 'image/png',
  }).arrayBuffer();

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(catImage),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const { images } = await generateImage({
    model: provider.imageModel(MODEL_ID),
    prompt: {
      text: 'upscale',
      images: [catImage],
    },
    size: '1024x1024',
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
}

/**
 * Combine multiple images into one
 */
async function combineImages() {
  const cat = readFileSync('data/comic-cat.png') as BlobPart;
  const dog = readFileSync('data/comic-dog.png') as BlobPart;
  const owl = readFileSync('data/comic-owl.png') as BlobPart;
  const bear = readFileSync('data/comic-bear.png') as BlobPart;
  const animalsImages = [cat, dog, owl, bear].map(img =>
    new Blob([img], { type: 'image/png' }).arrayBuffer(),
  );

  const { images } = await generateImage({
    model: provider.imageModel(MODEL_ID),
    prompt: {
      text: 'Combine these animals into an image containing all 4 of them, like a group photo, retaining the style and dimensions of the original images',
      images: await Promise.all(animalsImages),
    },
  });

  await presentImages(images);
}

/**
 * Edit an image using a mask to specify the area to edit
 */
async function editWithMask() {
  const image = readFileSync('data/sunlit_lounge.png') as BlobPart;
  const mask = readFileSync('data/sunlit_lounge_mask.png') as BlobPart;

  const { images } = await generateImage({
    model: provider.imageModel(MODEL_ID),
    prompt: {
      text: 'A sunlit indoor lounge area with a pool containing a flamingo',
      images: [await new Blob([image], { type: 'image/png' }).arrayBuffer()],
      mask: await new Blob([mask], { type: 'image/png' }).arrayBuffer(),
    },
  });

  await presentImages(images);
}

/**
 * Outpaint - expand an image beyond its original boundaries
 */
async function outpaint() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;
  const catImage = await new Blob([imageBuffer], {
    type: 'image/png',
  }).arrayBuffer();

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(catImage),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const { images } = await generateImage({
    model: provider.imageModel(MODEL_ID),
    prompt: {
      text: 'Create a new tile showing more background scenery on the left side of the cat, retaining the style and dimensions of the original image. The right side of the image should seamlessly connect to the left side of the original image.',
      images: [catImage],
    },
  });

  await presentImages(images);
}

// Run one of the examples
replaceCharacter().catch(console.error);
// removeBackground().catch(console.error);
// upscaleImage().catch(console.error);
// combineImages().catch(console.error);
// editWithMask().catch(console.error);
// outpaint().catch(console.error);
