import type { Experimental_GeneratedImage as GeneratedImage } from 'ai';
import fs from 'node:fs';
import imageType from 'image-type';
import path from 'node:path';
import sharp from 'sharp';
import terminalImage from 'terminal-image';

const OUTPUT_DIR = 'output';

/**
 * Displays images in the terminal using a downsampled preview and saves the
 * original, full-resolution files to the output directory with unique
 * timestamps.
 * @param images - An array of generated images to process and display.
 */
export async function presentImages(images: GeneratedImage[]) {
  const timestamp = Date.now();
  for (const [index, image] of images.entries()) {
    let srcBuffer = image.uint8Array;

    // Determine the format of the image.
    const format = await imageType(srcBuffer);
    const extension = format?.ext;
    if (!extension) {
      throw new Error('Unknown image format');
    }

    if (extension === 'webp') {
      // `terminal-image` doesn't support WebP, so convert to PNG.
      srcBuffer = await sharp(srcBuffer).png().toBuffer();
    }

    // Render the image to the terminal.
    console.log(await terminalImage.buffer(Buffer.from(srcBuffer)));

    // Save the original image to a file.
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(
      OUTPUT_DIR,
      `image-${timestamp}-${index}.${extension}`,
    );
    await fs.promises.writeFile(filePath, srcBuffer);
    console.log(`Saved image to ${filePath}`);
  }

  console.log(`Processed ${images.length} images`);
}
