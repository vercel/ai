import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';
import { AwsV4Signer } from 'aws4fetch';
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

type TaskInput =
  | {
      taskType: 'INPAINTING';
      inPaintingParams: {
        image: string;
        maskPrompt?: string;
        maskImage?: string;
        text?: string;
        negativeText?: string;
      };
      imageGenerationConfig?: ImageGenerationConfig;
    }
  | {
      taskType: 'OUTPAINTING';
      outPaintingParams: {
        image: string;
        maskPrompt?: string;
        maskImage?: string;
        text?: string;
        negativeText?: string;
        outPaintingMode?: 'DEFAULT' | 'PRECISE';
      };
      imageGenerationConfig?: ImageGenerationConfig;
    }
  | {
      taskType: 'BACKGROUND_REMOVAL';
      backgroundRemovalParams: {
        image: string;
      };
    }
  | {
      taskType: 'IMAGE_VARIATION';
      imageVariationParams: {
        images: string[];
        text?: string;
        negativeText?: string;
        similarityStrength?: number;
      };
      imageGenerationConfig?: ImageGenerationConfig;
    };

type ImageGenerationConfig = {
  numberOfImages?: number;
  quality?: 'standard' | 'premium';
  cfgScale?: number;
  seed?: number;
  width?: number;
  height?: number;
};

type Output = {
  images: string[];
  error?: string;
};

const MODEL_ID = 'amazon.nova-canvas-v1:0';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const API_URL = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/invoke`;

async function getSignedHeaders(body: string): Promise<HeadersInit> {
  const signer = new AwsV4Signer({
    url: API_URL,
    method: 'POST',
    headers: [['Content-Type', 'application/json']],
    body,
    region: REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    service: 'bedrock',
  });

  const signingResult = await signer.sign();
  return signingResult.headers;
}

async function callBedrockApi(input: TaskInput): Promise<Output> {
  const body = JSON.stringify(input);
  const response = await fetch(API_URL, {
    method: 'POST',
    body,
    headers: await getSignedHeaders(body),
  });

  if (!response.ok) {
    const textResponse = await response.text();
    console.error('Error response:', textResponse);
    throw new Error(
      `Bedrock API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

// ============================================================================
// Native Fetch Examples
// ============================================================================

/**
 * INPAINTING: Edit image using a text mask prompt
 * The model will automatically detect the described area to mask
 */
async function inpaintingWithMaskPrompt() {
  const image = readFileSync('data/comic-cat.png');

  const input: TaskInput = {
    taskType: 'INPAINTING',
    inPaintingParams: {
      image: image.toString('base64'),
      maskPrompt: 'cat',
      text: 'a cute corgi dog in the same style',
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      quality: 'standard',
      cfgScale: 7.0,
      seed: 42,
    },
  };

  console.log('INPAINTING with maskPrompt...');
  const data = await callBedrockApi(input);
  console.log(`Generated ${data.images.length} image(s)`);

  await presentImages(
    data.images.map(b64 => ({
      base64: '',
      mediaType: '',
      uint8Array: Uint8Array.from(Buffer.from(b64, 'base64')),
    })),
  );
}

/**
 * INPAINTING: Edit image using a provided mask image
 * Black pixels = area to edit, White pixels = area to preserve
 */
async function inpaintingWithMaskImage() {
  const image = readFileSync('data/sunlit_lounge.png');
  const mask = readFileSync('data/sunlit_lounge_mask_white_black.png');

  const input: TaskInput = {
    taskType: 'INPAINTING',
    inPaintingParams: {
      image: image.toString('base64'),
      maskImage: mask.toString('base64'),
      text: 'A sunlit indoor lounge area with a pool containing a flamingo',
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      quality: 'standard',
      cfgScale: 7.0,
    },
  };

  console.log('INPAINTING with maskImage...');
  const data = await callBedrockApi(input);
  console.log(`Generated ${data.images.length} image(s)`);

  await presentImages(
    data.images.map(b64 => ({
      base64: '',
      mediaType: '',
      uint8Array: Uint8Array.from(Buffer.from(b64, 'base64')),
    })),
  );
}

/**
 * OUTPAINTING: Extend/replace the background outside a masked region
 * White pixels = area to change, Black pixels = preserve
 */
async function outpainting() {
  const image = readFileSync('data/comic-cat.png');

  const input: TaskInput = {
    taskType: 'OUTPAINTING',
    outPaintingParams: {
      image: image.toString('base64'),
      maskPrompt: 'background',
      text: 'A beautiful sunset landscape with mountains',
      outPaintingMode: 'DEFAULT',
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      quality: 'standard',
      cfgScale: 7.0,
    },
  };

  console.log('OUTPAINTING...');
  const data = await callBedrockApi(input);
  console.log(`Generated ${data.images.length} image(s)`);

  await presentImages(
    data.images.map(b64 => ({
      base64: '',
      mediaType: '',
      uint8Array: Uint8Array.from(Buffer.from(b64, 'base64')),
    })),
  );
}

/**
 * BACKGROUND_REMOVAL: Automatically remove the background
 */
async function backgroundRemoval() {
  const image = readFileSync('data/comic-cat.png');

  const input: TaskInput = {
    taskType: 'BACKGROUND_REMOVAL',
    backgroundRemovalParams: {
      image: image.toString('base64'),
    },
  };

  console.log('BACKGROUND_REMOVAL...');
  const data = await callBedrockApi(input);
  console.log(`Generated ${data.images.length} image(s)`);

  await presentImages(
    data.images.map(b64 => ({
      base64: '',
      mediaType: '',
      uint8Array: Uint8Array.from(Buffer.from(b64, 'base64')),
    })),
  );
}

/**
 * IMAGE_VARIATION: Create variations of an image
 */
async function imageVariation() {
  const image = readFileSync('data/comic-cat.png');

  const input: TaskInput = {
    taskType: 'IMAGE_VARIATION',
    imageVariationParams: {
      images: [image.toString('base64')],
      text: 'Modernize the style, photo-realistic, 8k, hdr',
      negativeText: 'bad quality, low resolution, cartoon',
      similarityStrength: 0.7,
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      quality: 'standard',
      cfgScale: 7.0,
    },
  };

  console.log('IMAGE_VARIATION...');
  const data = await callBedrockApi(input);
  console.log(`Generated ${data.images.length} image(s)`);

  await presentImages(
    data.images.map(b64 => ({
      base64: '',
      mediaType: '',
      uint8Array: Uint8Array.from(Buffer.from(b64, 'base64')),
    })),
  );
}

// ============================================================================
// AI SDK Examples using generateImage()
// ============================================================================

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

  const prompt = 'A sunlit indoor lounge area with a pool containing a flamingo';
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

// Native fetch examples:
// inpaintingWithMaskPrompt().catch(console.error);
// inpaintingWithMaskImage().catch(console.error);
// outpainting().catch(console.error);
// backgroundRemoval().catch(console.error);
// imageVariation().catch(console.error);

// AI SDK examples:
// inpaintingWithMaskPromptAi().catch(console.error);
// inpaintingWithMaskImageAi().catch(console.error);
outpaintingAi().catch(console.error);
// backgroundRemovalAi().catch(console.error);
// imageVariationAi().catch(console.error);
