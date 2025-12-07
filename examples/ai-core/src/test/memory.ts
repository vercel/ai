/**
 * Standalone script to reproduce memory issues with Vercel AI SDK's experimental_download feature.
 *
 *
 * Usage:
 *   npx tsx scripts/vercel-ai-memory-test.ts [imageCount] [runs]
 *
 * Examples:
 *   npx tsx scripts/vercel-ai-memory-test.ts 20 2    # 20 images, 2 consecutive runs
 *   npx tsx scripts/vercel-ai-memory-test.ts 50 3    # 50 images, 3 consecutive runs
 *   npx tsx scripts/vercel-ai-memory-test.ts 100 1   # 100 images, 1 run
 *
 * Environment:
 *   GOOGLE_GENERATIVE_AI_API_KEY or NEXT_PUBLIC_GOOGLE_KEY must be set
 */

import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

const IMAGE_COUNT = parseInt(process.argv[2] || '20', 10);
const RUN_COUNT = parseInt(process.argv[3] || '2', 10);

// Test image
const TEST_IMAGE_URL = 'https://picsum.photos/1400/1080';

// ============================================================================
// Memory Utilities
// ============================================================================

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const getMemoryInfo = () => {
  const mem = process.memoryUsage();
  return {
    heapUsed: formatBytes(mem.heapUsed),
    heapTotal: formatBytes(mem.heapTotal),
    rss: formatBytes(mem.rss),
    external: formatBytes(mem.external),
    arrayBuffers: formatBytes(mem.arrayBuffers),
  };
};

const logMemory = (label: string) => {
  console.log(`\n[MEMORY] ${label}:`, getMemoryInfo());
};

// ============================================================================
// Download Handler (same as in our codebase)
// ============================================================================

let totalDownloadedBytes = 0;
let totalUrlsDownloaded = 0;
let cachedImageData: Uint8Array | null = null;

const createDownloadHandler = () => {
  let batchDownloadedBytes = 0;

  return async (
    requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
  ) => {
    console.log(`\n[DOWNLOAD] ========== BATCH START ==========`);
    console.log(`[DOWNLOAD] URLs in this batch: ${requestedDownloads.length}`);
    logMemory('BEFORE batch');

    batchDownloadedBytes = 0;

    const results = await Promise.all(
      requestedDownloads.map(async (requestedDownload, index) => {
        const urlText = requestedDownload.url.toString();

        try {
          // Create a fresh copy of the cached image data
          if (!cachedImageData) {
            throw new Error(
              'Image data not cached - should have been preloaded!',
            );
          }

          const data = new Uint8Array(cachedImageData);
          const mediaType = 'image/jpeg';

          batchDownloadedBytes += data.byteLength;
          totalDownloadedBytes += data.byteLength;
          totalUrlsDownloaded++;

          // Log progress every 10 images
          if (
            (index + 1) % 10 === 0 ||
            index === requestedDownloads.length - 1
          ) {
            console.log(
              `[DOWNLOAD] Progress: ${index + 1}/${requestedDownloads.length}, ` +
                `batch: ${formatBytes(batchDownloadedBytes)}, ` +
                `total: ${formatBytes(totalDownloadedBytes)}`,
            );
          }

          return { data, mediaType };
        } catch (error) {
          console.error(`[DOWNLOAD] Error downloading ${urlText}:`, error);
          throw error;
        }
      }),
    );

    console.log(`[DOWNLOAD] ========== BATCH COMPLETE ==========`);
    console.log(`[DOWNLOAD] Batch stats:`, {
      urlsDownloaded: requestedDownloads.length,
      batchBytes: formatBytes(batchDownloadedBytes),
    });
    console.log(`[DOWNLOAD] Cumulative stats:`, {
      totalUrlsDownloaded,
      totalBytes: formatBytes(totalDownloadedBytes),
    });
    logMemory('AFTER batch');

    return results;
  };
};

// ============================================================================
// Image Pre-loading
// ============================================================================

async function preloadTestImage() {
  if (cachedImageData) {
    return;
  }

  console.log(`[PRELOAD] Downloading test image : ${TEST_IMAGE_URL}`);
  const response = await fetch(TEST_IMAGE_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download test image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  cachedImageData = new Uint8Array(arrayBuffer);
  console.log(
    `[PRELOAD] Test image cached: ${formatBytes(cachedImageData.byteLength)}`,
  );
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTest(runNumber: number, imageCount: number) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUN #${runNumber} - Testing with ${imageCount} images`);
  console.log(`${'='.repeat(60)}`);

  logMemory(`START of run #${runNumber}`);

  // Get API key
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing GOOGLE_GENERATIVE_AI_API_KEY or NEXT_PUBLIC_GOOGLE_KEY environment variable',
    );
  }

  // Create provider
  const model = openai('gpt-5-nano');

  // Build the message content with images
  const messageContent: Array<
    { type: 'text'; text: string } | { type: 'image'; image: URL }
  > = [
    {
      type: 'text',
      text: "Describe what you see in these images briefly. Just say 'I see X images' and nothing else.",
    },
  ];

  for (let i = 0; i < imageCount; i++) {
    messageContent.push({ type: 'image', image: new URL(TEST_IMAGE_URL) });
  }

  console.log(`[TEST] Starting streamText with experimental_download...`);

  const startTime = Date.now();

  try {
    const result = streamText({
      model,
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
      experimental_download: createDownloadHandler(),
    });

    // Consume the stream
    let responseText = '';
    for await (const chunk of result.textStream) {
      responseText += chunk;
    }

    const duration = Date.now() - startTime;

    console.log(`\n[TEST] Stream completed in ${duration}ms`);
    console.log(`[TEST] Response: "${responseText}"`);
    console.log(`Response usage : ${JSON.stringify(result.totalUsage)}`);
  } catch (error) {
    console.error(`[TEST] Error during streamText:`, error);
    logMemory('AFTER error');
  }

  // Try to trigger garbage collection if available
  if (global.gc) {
    console.log(`\n[GC] Forcing garbage collection...`);
    global.gc();
    logMemory('AFTER forced GC');
  }

  console.log(`\n[TEST] Run #${runNumber} complete`);
  logMemory(`END of run #${runNumber}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Vercel AI SDK Memory Test - experimental_download               ║
║  Testing memory behavior with image downloads                    ║
╚══════════════════════════════════════════════════════════════════╝

Configuration:
  - Image count per run: ${IMAGE_COUNT}
  - Number of runs: ${RUN_COUNT}
  - Total images to download: ${IMAGE_COUNT * RUN_COUNT}
`);

  logMemory('INITIAL (before any runs)');

  // Preload the test image once before all runs
  await preloadTestImage();

  for (let run = 1; run <= RUN_COUNT; run++) {
    await runTest(run, IMAGE_COUNT);

    // Small delay between runs to allow any async cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`FINAL SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total downloads: ${totalUrlsDownloaded} images`);
  console.log(`Total downloaded bytes: ${formatBytes(totalDownloadedBytes)}`);
  logMemory('FINAL (after all runs)');

  // Final GC attempt
  if (global.gc) {
    console.log(`\n[GC] Final garbage collection...`);
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 2000));
    logMemory('AFTER final GC + 2s wait');
  }
}

main().catch(console.error);
