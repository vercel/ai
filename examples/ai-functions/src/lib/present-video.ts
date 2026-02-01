import { GeneratedFile } from 'ai';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';

/**
 * Saves generated video files to the output directory with unique timestamps.
 * Videos are typically too large to display in the terminal, so we just save them.
 * @param videos - An array of generated videos to process and save.
 */
export async function presentVideos(videos: GeneratedFile[]) {
  const timestamp = Date.now();
  for (const [index, video] of videos.entries()) {
    // Videos from providers may be URLs (stored as base64 strings) or actual video data
    const videoData = video.uint8Array;

    // Determine the file extension based on media type
    const mediaType = video.mediaType || 'video/mp4';
    const extension = mediaType.split('/')[1] || 'mp4';

    // Save the video to a file
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(
      OUTPUT_DIR,
      `video-${timestamp}-${index}.${extension}`,
    );

    await fs.promises.writeFile(filePath, videoData);
    console.log(`Saved video to ${filePath}`);
    console.log(`  Media type: ${mediaType}`);
    console.log(`  Size: ${(videoData.length / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log(`\nProcessed ${videos.length} video(s)`);
}
