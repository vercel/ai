import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

async function main() {
  // Example 1: Edit a single image using ImageInput with media type
  console.log('Editing an existing image with ImageInput format...');
  const imageBuffer = fs.readFileSync(
    path.join(__dirname, '../../data/comic-cat.png'),
  );

  const editResult = await generateImage({
    model: openai.imageModel('gpt-image-1'),
    images: [
      {
        image: imageBuffer, // Buffer is supported
        mediaType: 'image/png',
      },
    ],
    prompt: 'Add a rainbow in the sky above the cat',
    size: '1024x1024',
  });

  fs.writeFileSync(
    'edited-image.png',
    Buffer.from(editResult.image.uint8Array),
  );

  // Example 2: Edit using base64-encoded image with media type
  console.log('Editing an existing image with base64 and media type...');
  const base64Image = imageBuffer.toString('base64');

  const editResultBase64 = await generateImage({
    model: openai.imageModel('gpt-image-1'),
    images: [
      {
        image: base64Image,
        mediaType: 'image/png',
      },
    ],
    prompt: 'Add stars in the night sky',
  });

  fs.writeFileSync(
    'edited-image-base64.png',
    Buffer.from(editResultBase64.image.uint8Array),
  );

  // Example 3: Using ArrayBuffer
  console.log('Editing with ArrayBuffer...');
  const arrayBuffer = imageBuffer.buffer.slice(
    imageBuffer.byteOffset,
    imageBuffer.byteOffset + imageBuffer.byteLength,
  );

  const editResultArrayBuffer = await generateImage({
    model: openai.imageModel('gpt-image-1'),
    images: [
      {
        image: arrayBuffer,
        mediaType: 'image/png',
      },
    ],
    prompt: 'Make the image more vibrant and colorful',
  });

  fs.writeFileSync(
    'edited-image-arraybuffer.png',
    Buffer.from(editResultArrayBuffer.image.uint8Array),
  );

  // Example 4: Edit multiple images with explicit media types
  console.log('Editing multiple images...');
  const secondImage = fs.readFileSync(
    path.join(__dirname, '../../data/screenshot-editor.png'),
  );

  const multiEditResult = await generateImage({
    model: openai.imageModel('gpt-image-1'),
    images: [
      {
        image: imageBuffer,
        mediaType: 'image/png',
      },
      {
        image: secondImage,
        mediaType: 'image/png',
      },
    ],
    prompt: 'Create a creative collage combining these images',
    n: 2, // Generate 2 variations
    providerOptions: {
      openai: {
        quality: 'high',
        background: 'transparent',
      },
    },
  });

  multiEditResult.images.forEach((image, index) => {
    fs.writeFileSync(`multi-edit-${index}.png`, Buffer.from(image.uint8Array));
  });

  // Example 5: Using mask for inpainting (edit specific parts of the image)
  console.log('Editing with mask for inpainting...');
  const maskBuffer = fs.readFileSync(
    path.join(__dirname, '../../data/comic-cat-mask.png'),
  );

  const inpaintResult = await generateImage({
    model: openai.imageModel('gpt-image-1'),
    images: [
      {
        image: imageBuffer,
        mediaType: 'image/png',
      },
    ],
    mask: maskBuffer,
    prompt: 'Use a techno style on the masked area',
    size: '1024x1024',
  });

  fs.writeFileSync(
    'inpainted-image.png',
    Buffer.from(inpaintResult.image.uint8Array),
  );

  console.log('All operations completed!');
}

main().catch(console.error);
