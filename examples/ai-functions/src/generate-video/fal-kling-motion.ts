/**
 * FAL Kling Motion Control Example
 *
 * Transfers motion from a reference video to a character image.
 *
 * Usage:
 *   FAL_API_KEY="key" pnpm tsx src/generate-video/fal-kling-motion.ts
 */

import { fal } from '@ai-sdk/fal';
import { experimental_generateVideo as generateVideo } from 'ai';
import * as fs from 'fs';
import * as path from 'path';

// You'll need to provide URLs for your image and video
// These can be:
// - Public URLs (https://...)
// - FAL storage URLs (https://v3b.fal.media/...)
const CHARACTER_IMAGE_URL = 'YOUR_IMAGE_URL_HERE';
const MOTION_VIDEO_URL = 'YOUR_VIDEO_URL_HERE';

async function main() {
  console.log('=== FAL Kling Motion Control ===\n');
  console.log('Generating video...');
  const startTime = Date.now();

  const result = await generateVideo({
    model: fal.video('kling-video/v2.6/pro/motion-control'),
    prompt: {
      // Pass the character image URL directly
      files: [CHARACTER_IMAGE_URL],
      text: 'natural lighting, high quality',
    },
    providerOptions: {
      fal: {
        // Reference video URL - motion will be transferred from this
        video_url: MOTION_VIDEO_URL,
        // Output orientation: 'image' or 'video'
        character_orientation: 'image',
        // Keep audio from reference video
        keep_original_sound: true,
        // Increase timeout for long generations
        pollTimeoutMs: 600000, // 10 minutes
      },
    },
  });

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nCompleted in ${elapsed}s`);

  // Save the video
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `kling-motion-${Date.now()}.mp4`);
  fs.writeFileSync(outputPath, Buffer.from(await result.video.uint8Array));
  console.log('Saved to:', outputPath);
}

main().catch(console.error);
