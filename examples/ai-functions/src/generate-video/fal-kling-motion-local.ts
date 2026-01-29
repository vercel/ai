/**
 * FAL Kling Motion Control - Local Files Example
 *
 * Transfers motion from a reference video to a character image.
 * This version uploads local files to FAL storage first.
 *
 * Usage:
 *   FAL_API_KEY="key" pnpm tsx src/generate-video/fal-kling-motion-local.ts <image-path> <video-path>
 */

import { fal } from '@ai-sdk/fal';
import { fal as falClient } from '@fal-ai/client';
import { experimental_generateVideo as generateVideo } from 'ai';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(
    'Usage: pnpm tsx src/generate-video/fal-kling-motion-local.ts <image-path> <video-path>',
  );
  process.exit(1);
}

const IMAGE_PATH = args[0];
const VIDEO_PATH = args[1];

if (!fs.existsSync(IMAGE_PATH)) {
  console.error(`Error: Image not found: ${IMAGE_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(VIDEO_PATH)) {
  console.error(`Error: Video not found: ${VIDEO_PATH}`);
  process.exit(1);
}

async function uploadToFal(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  const fileName = path.basename(filePath);

  const file = new File([buffer], fileName, { type: mimeType });
  return await falClient.storage.upload(file);
}

async function main() {
  console.log('=== FAL Kling Motion Control (Local Files) ===\n');

  // Upload files to FAL storage
  console.log('Uploading image...');
  const imageUrl = await uploadToFal(IMAGE_PATH);
  console.log(`  → ${imageUrl}`);

  console.log('Uploading video...');
  const videoUrl = await uploadToFal(VIDEO_PATH);
  console.log(`  → ${videoUrl}`);

  console.log('\nGenerating video...');
  const startTime = Date.now();

  const result = await generateVideo({
    model: fal.video('kling-video/v2.6/pro/motion-control'),
    prompt: {
      files: [imageUrl],
      text: 'natural lighting, high quality',
    },
    providerOptions: {
      fal: {
        video_url: videoUrl,
        character_orientation: 'image',
        keep_original_sound: true,
        pollTimeoutMs: 600000,
      },
    },
  });

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nCompleted in ${elapsed}s`);

  // Save video
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `kling-motion-${Date.now()}.mp4`);
  fs.writeFileSync(outputPath, Buffer.from(await result.video.uint8Array));
  console.log('Saved to:', outputPath);
}

main().catch(console.error);
