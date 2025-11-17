// import { openai } from '@ai-sdk/openai';
// import { experimental_generateImage as generateImage } from 'ai';
import { readFileSync } from 'fs';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

/* 
    for reference: edit image using curl
    https://platform.openai.com/docs/api-reference/images/createEdit

    difference between creation and edit

    - parameters
      - create (https://api.openai.com/v1/images/generations)
        - moderation
        - style
        - url: 
      - edit (https://api.openai.com/v1/images/edits)
        - image
        - input_fidelity
        - mask
*/

type Input = {
  /**
   * Allows to set transparency for the background of the generated image(s).
   * This parameter is only supported for `gpt-image-1`. Must be one of
   * `transparent`, `opaque` or `auto` (default value). When `auto` is used, the
   * model will automatically determine the best background for the image.
   *
   * If `transparent`, the output format needs to support transparency, so it
   * should be set to either `png` (default value) or `webp`.
   *
   */
  background?: 'transparent' | 'opaque' | 'auto';
  /**
   * The image(s) to edit. Must be a supported image file or an array of images.
   *
   * For `gpt-image-1`, each image should be a `png`, `webp`, or `jpg` file less
   * than 50MB. You can provide up to 16 images.
   *
   * For `dall-e-2`, you can only provide one image, and it should be a square
   * `png` file less than 4MB.
   *
   */
  image: Blob | Blob[];
  input_fidelity?: ('high' | 'low') | null;
  /**
   * An additional image whose fully transparent areas (e.g. where alpha is zero) indicate where `image` should be edited. If there are multiple images provided, the mask will be applied on the first image. Must be a valid PNG file, less than 4MB, and have the same dimensions as `image`.
   */
  mask?: Blob;
  /**
   * The model to use for image generation. Only `dall-e-2` and `gpt-image-1` are supported. Defaults to `dall-e-2` unless a parameter specific to `gpt-image-1` is used.
   */
  model?: 'dall-e-2' | 'gpt-image-1' | 'gpt-image-1-mini' | string & {};
  /**
   * The number of images to generate. Must be between 1 and 10.
   */
  n?: number;
  /**
   * The compression level (0-100%) for the generated images. This parameter
   * is only supported for `gpt-image-1` with the `webp` or `jpeg` output
   * formats, and defaults to 100.
   *
   */
  output_compression?: number;
  /**
   * The format in which the generated images are returned. This parameter is
   * only supported for `gpt-image-1`. Must be one of `png`, `jpeg`, or `webp`.
   * The default value is `png`.
   *
   */
  output_format?: 'png' | 'jpeg' | 'webp';
  partial_images?: number | null;
  /**
   * A text description of the desired image(s). The maximum length is 1000 characters for `dall-e-2`, and 32000 characters for `gpt-image-1`.
   */
  prompt?: string;
  /**
   * The quality of the image that will be generated. `high`, `medium` and `low` are only supported for `gpt-image-1`. `dall-e-2` only supports `standard` quality. Defaults to `auto`.
   *
   */
  quality?: 'standard' | 'low' | 'medium' | 'high' | 'auto';
  /**
   * The format in which the generated images are returned. Must be one of `url` or `b64_json`. URLs are only valid for 60 minutes after the image has been generated. This parameter is only supported for `dall-e-2`, as `gpt-image-1` will always return base64-encoded images.
   */
  response_format?: 'url' | 'b64_json';
  /**
   * The size of the generated images. Must be one of `1024x1024`, `1536x1024` (landscape), `1024x1536` (portrait), or `auto` (default value) for `gpt-image-1`, and one of `256x256`, `512x512`, or `1024x1024` for `dall-e-2`.
   */
  size?:
    | '256x256'
    | '512x512'
    | '1024x1024'
    | '1536x1024'
    | '1024x1536'
    | 'auto';
  /**
   * Edit the image in streaming mode. Defaults to `false`. See the
   * [Image generation guide](https://platform.openai.com/docs/guides/image-generation) for more information.
   *
   */
  stream?: boolean;
  /**
   * A unique identifier representing your end-user, which can help OpenAI to monitor and detect abuse. [Learn more](https://platform.openai.com/docs/guides/safety-best-practices#end-user-ids).
   *
   */
  user?: string;
};

async function replaceCharacter() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;
  const input: Input = {
    image: new Blob([imageBuffer], { type: 'image/png' }),
    prompt:
      'Turn the cat into a dog but retain the style and dimensions of the original image',
  };
  await sendRequestAndHandleResponse(input);
}

async function createVariations() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;

  const input: Input = {
    model: 'gpt-image-1',
    n: 3,
    image: new Blob([imageBuffer], { type: 'image/png' }),
  };
  await sendRequestAndHandleResponse(input, 'https://api.openai.com/v1/images/variations');
}

async function removeBackground() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;

  const input: Input = {
    model: 'gpt-image-1',
    image: new Blob([imageBuffer], { type: 'image/png' }),
    background: 'transparent',
    prompt: 'do not change anything',
    output_format: 'png',
  };
  await sendRequestAndHandleResponse(input);
}

async function upscaleImage() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;

  const input: Input = {
    model: 'gpt-image-1',
    image: new Blob([imageBuffer], { type: 'image/png' }),
    prompt: 'do not change anything',
    size: '1024x1024',
  };
  await sendRequestAndHandleResponse(input);
}

async function combineImages() {
  const cat = readFileSync('data/comic-cat.png') as BlobPart;
  const dog = readFileSync('data/comic-dog.png') as BlobPart;
  const owl = readFileSync('data/comic-owl.png') as BlobPart;
  const bear = readFileSync('data/comic-bear.png') as BlobPart;
  const images = [cat, dog, owl, bear].map(
    (img) => new Blob([img], { type: 'image/png' }) as Blob,
  );

  const input: Input = {
    model: 'gpt-image-1',
    image: images,
    prompt: 'Combine these animals into an image containing all 4 ouf them, like a group photo, retaining the style and dimensions of the original images',
  };
  await sendRequestAndHandleResponse(input);
}

async function editWithMask() {
  const image = readFileSync('data/sunlit_lounge.png') as BlobPart;
  const mask = readFileSync('data/sunlit_lounge_mask.png') as BlobPart;

  const input: Input = {
    // model: 'dall-e-2',
    model: 'gpt-image-1',
    image: new Blob([image], { type: 'image/png' }),
    mask: new Blob([mask], { type: 'image/png' }),
    prompt: 'A sunlit indoor lounge area with a pool containing a flamingo',
  };
  await sendRequestAndHandleResponse(input);
}

async function outpaint() {
  const imageBuffer = readFileSync('data/comic-cat.png') as BlobPart;

  const input: Input = {
    model: 'gpt-image-1',
    image: new Blob([imageBuffer], { type: 'image/png' }),
    prompt: 'Expand the image to show more background scenery on the left side of the cat, retaining the style and dimensions of the original image',
    size: '1536x1024',
  };
  await sendRequestAndHandleResponse(input);
}

// replaceCharacter().catch(console.error);
createVariations().catch(console.error);
// removeBackground().catch(console.error);
// upscaleImage().catch(console.error);
// combineImages().catch(console.error);
// editWithMask().catch(console.error);
// outpaint().catch(console.error);

function inputToFormData(input: Input): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(`${key}[]`, item as string | Blob);
      }
      continue;
    }

    formData.append(key, value as string | string);
  }

  return formData;
}

async function sendRequestAndHandleResponse(input: Input, url = 'https://api.openai.com/v1/images/edits') {
  const formData = inputToFormData(input);
  console.log(formData)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(text);
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText}`,
    );
  }

  const { data, ...rest } = await response.json();
  console.log(rest);

  for (const { b64_json, revised_prompt, url } of data) {
    if (url) {
      // download image from URL and convert to base64
      const imageResponse = await fetch(url);
      const arrayBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await presentImages([
        {
          uint8Array,
          base64: '',
          mediaType: '',
        },
      ]);
      continue;
    }

    try {
      console.log(Object.keys(JSON.parse(b64_json)));
    } catch (error) {
      console.error('Error parsing b64_json');
    }

    await presentImages([
      {
        uint8Array: Buffer.from(b64_json, 'base64'),
        base64: '',
        mediaType: '',
      },
    ]);
  }
}