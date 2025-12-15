import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { fireworks, FireworksImageModelId } from '@ai-sdk/fireworks';

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

const MODEL_ID: FireworksImageModelId =
  'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0';

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
  console.dir(images);
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

async function getImageUrl(apiKey: string, modelId: string, requestId: string) {
  const url = `https://api.fireworks.ai/inference/v1/workflows/${modelId}/get_result`;

  console.log('checking for result of task %s at %s', requestId, url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ id: requestId }),
  });

  // {"id":"03870241-ee89-49f2-8e0a-99e3b53df97c","status":"Request Moderated","result":null,"progress":null,"details":{"Moderation Reasons":["Safety Filter"]}}
  const result = await response.json();

  console.dir(result);

  if (result.status !== 'Ready') {
    console.log('no result yet, waiting 3s before retrying...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    return getImageUrl(apiKey, modelId, requestId);
  }

  return result.result.sample;
}

// ============================================================================
// Run Examples
// ============================================================================

// AI SDK examples:
editImageAi().catch(console.error);
// styleTransferAi().catch(console.error);
// editWithProviderOptionsAi().catch(console.error);
