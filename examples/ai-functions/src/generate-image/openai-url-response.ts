import { openai } from '@ai-sdk/openai';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

/**
 * Example demonstrating URL-based image responses with OpenAI DALL-E.
 *
 * OpenAI's DALL-E models support returning images as URLs instead of
 * base64-encoded strings by setting response_format: 'url'.
 * The generateImage function automatically detects and downloads these URLs.
 *
 * This example shows:
 * - How to request URL format from OpenAI
 * - Automatic URL detection and downloading
 * - Custom download function with logging
 * - Handling multiple prompt templates
 */

// Collection of creative prompts for image generation
const PROMPT_TEMPLATES = [
  'A futuristic cityscape at sunset with flying cars and neon lights reflecting on wet streets',
  'A serene mountain landscape with a crystal-clear lake at dawn, surrounded by pine trees',
  'A cyberpunk marketplace in a bustling alien city, with holographic signs and diverse alien species',
  'A cozy coffee shop on a rainy day, with warm lighting and people reading books by the window',
  'An underwater coral reef teeming with colorful tropical fish and marine life',
  'A steampunk airship floating above Victorian-era London with gears and brass mechanisms',
  'A magical forest with bioluminescent plants and fairy lights, under a starry night sky',
  'A modern art gallery with abstract paintings and minimalist architecture, natural light streaming in',
  'A space station orbiting a distant planet, with Earth visible in the background',
  'A Japanese garden in spring with cherry blossoms, koi pond, and traditional architecture',
  'A post-apocalyptic wasteland with abandoned buildings and overgrown nature reclaiming the city',
  'A tropical beach paradise with turquoise water, white sand, and palm trees swaying in the breeze',
  'A medieval castle on a hilltop, surrounded by mist and a dramatic sky at twilight',
  'A bustling street market in Marrakech with vibrant colors, spices, and traditional crafts',
  'A high-tech laboratory with holographic displays, advanced equipment, and scientists at work',
];

/**
 * Selects a random prompt from the templates array
 */
function getRandomPrompt(): string {
  const randomIndex = Math.floor(Math.random() * PROMPT_TEMPLATES.length);
  const selectedPrompt = PROMPT_TEMPLATES[randomIndex];
  console.log(
    `\n🎲 Selected prompt template ${randomIndex + 1} of ${PROMPT_TEMPLATES.length}`,
  );
  return selectedPrompt;
}

/**
 * Formats and displays timing information
 */
function formatTiming(startTime: number, endTime: number): string {
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  return `${duration}s`;
}

run(async () => {
  console.log('='.repeat(80));
  console.log('🚀 OpenAI DALL-E URL Response Example');
  console.log('='.repeat(80));

  // Select a random prompt from templates
  const prompt = getRandomPrompt();
  console.log(`\n📝 PROMPT: "${prompt}"`);
  console.log(`   Length: ${prompt.length} characters`);

  // Store the URLs to display them later
  const urls: string[] = [];
  const downloadStartTimes: Map<string, number> = new Map();

  // Track overall timing
  const overallStartTime = Date.now();
  console.log(`\n⏱️  Started at: ${new Date(overallStartTime).toISOString()}`);

  // Custom download function that logs the URL before downloading
  const downloadWithLogging = async (
    requestedDownloads: Array<{
      url: URL;
      isUrlSupportedByModel: boolean;
    }>,
  ) => {
    console.log(
      `\n📥 Download function called with ${requestedDownloads.length} URL(s)`,
    );

    return Promise.all(
      requestedDownloads.map(async ({ url, isUrlSupportedByModel }, index) => {
        const urlString = url.toString();
        const downloadStartTime = Date.now();
        downloadStartTimes.set(urlString, downloadStartTime);

        urls.push(urlString);
        console.log(`\n  📍 URL ${index + 1}:`);
        console.log(`     Full URL: ${urlString}`);
        console.log(`     Hostname: ${url.hostname}`);
        console.log(`     Protocol: ${url.protocol}`);
        console.log(`     Path: ${url.pathname}`);
        console.log(`     Is URL supported by model: ${isUrlSupportedByModel}`);
        console.log(
          `     Download started at: ${new Date(downloadStartTime).toISOString()}`,
        );

        try {
          // Use default download behavior
          console.log(`     ⏳ Fetching image data...`);
          const fetchStartTime = Date.now();

          const response = await fetch(urlString);
          const fetchDuration = formatTiming(fetchStartTime, Date.now());

          console.log(`     ✅ Fetch completed in ${fetchDuration}`);
          console.log(`     Status: ${response.status} ${response.statusText}`);
          console.log(
            `     Content-Type: ${response.headers.get('content-type') ?? 'unknown'}`,
          );
          console.log(
            `     Content-Length: ${response.headers.get('content-length') ?? 'unknown'} bytes`,
          );

          if (!response.ok) {
            throw new Error(
              `Failed to download image: ${response.status} ${response.statusText}`,
            );
          }

          const arrayBufferStartTime = Date.now();
          const arrayBuffer = await response.arrayBuffer();
          const arrayBufferDuration = formatTiming(
            arrayBufferStartTime,
            Date.now(),
          );

          const mediaType = response.headers.get('content-type') ?? 'image/png';
          const fileSizeKB = (arrayBuffer.byteLength / 1024).toFixed(2);

          console.log(
            `     📦 ArrayBuffer conversion completed in ${arrayBufferDuration}`,
          );
          console.log(`     File size: ${fileSizeKB} KB`);
          console.log(`     Media type: ${mediaType}`);

          const totalDownloadTime = formatTiming(downloadStartTime, Date.now());
          console.log(`     ⏱️  Total download time: ${totalDownloadTime}`);

          return {
            data: new Uint8Array(arrayBuffer),
            mediaType,
          };
        } catch (error) {
          const errorTime = Date.now();
          const errorDuration = formatTiming(downloadStartTime, errorTime);
          console.error(`     ❌ Download failed after ${errorDuration}`);
          console.error(
            `     Error: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      }),
    );
  };

  // Configuration for image generation
  const modelId = 'dall-e-3';
  const imageSize = '1024x1024';
  const numberOfImages = 1;

  console.log(`\n⚙️  Configuration:`);
  console.log(`   Model: ${modelId}`);
  console.log(`   Size: ${imageSize}`);
  console.log(`   Number of images: ${numberOfImages}`);
  console.log(`   Response format: url (instead of base64)`);

  const generationStartTime = Date.now();
  console.log(`\n🎨 Starting image generation...`);
  console.log(`   Started at: ${new Date(generationStartTime).toISOString()}`);

  const result = await generateImage({
    model: openai.image(modelId),
    prompt,
    n: numberOfImages,
    size: imageSize as `${number}x${number}`,
    providerOptions: {
      openai: {
        response_format: 'url', // Request URL format instead of base64
      },
    },
    experimental_download: downloadWithLogging,
  });

  const generationEndTime = Date.now();
  const generationDuration = formatTiming(
    generationStartTime,
    generationEndTime,
  );
  console.log(`\n✅ Image generation completed in ${generationDuration}`);
  console.log(`   Finished at: ${new Date(generationEndTime).toISOString()}`);

  // Detailed result inspection
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Result Object Analysis');
  console.log('='.repeat(80));

  console.log(`\n📊 Images:`);
  console.log(`   Count: ${result.images.length}`);
  console.log(
    `   Types: ${result.images.map(img => img.constructor.name).join(', ')}`,
  );
  result.images.forEach((img, index) => {
    console.log(`   Image ${index + 1}:`);
    console.log(`     Type: ${img.constructor.name}`);
    // @ts-expect-error - accessing internal property for logging
    if (img.data) {
      // @ts-expect-error - accessing internal property for logging
      const dataSize = img.data instanceof Uint8Array ? img.data.length : 0;
      console.log(`     Data size: ${(dataSize / 1024).toFixed(2)} KB`);
    }
    if (img.mediaType) {
      console.log(`     Media type: ${img.mediaType}`);
    }
  });

  console.log(`\n⚠️  Warnings:`);
  if (result.warnings.length === 0) {
    console.log('   No warnings');
  } else {
    result.warnings.forEach((warning, index) => {
      console.log(`   Warning ${index + 1}:`, JSON.stringify(warning, null, 2));
    });
  }

  console.log(`\n📦 Provider Metadata:`);
  if (Object.keys(result.providerMetadata).length === 0) {
    console.log('   No provider metadata');
  } else {
    console.log(JSON.stringify(result.providerMetadata, null, 2));
  }

  console.log(`\n📡 Responses:`);
  console.log(`   Count: ${result.responses.length}`);
  result.responses.forEach((response, index) => {
    console.log(`   Response ${index + 1}:`);
    console.log(`     Timestamp: ${response.timestamp.toISOString()}`);
    console.log(`     Model ID: ${response.modelId}`);
    console.log(
      `     Headers: ${Object.keys(response.headers || {}).length} header(s)`,
    );
  });

  console.log(`\n📈 Usage:`);
  if (result.usage) {
    console.log(`   Input tokens: ${result.usage.inputTokens ?? 'N/A'}`);
    console.log(`   Output tokens: ${result.usage.outputTokens ?? 'N/A'}`);
    console.log(`   Total tokens: ${result.usage.totalTokens ?? 'N/A'}`);
  } else {
    console.log('   No usage information available');
  }

  // Display the generated images
  console.log('\n' + '='.repeat(80));
  console.log('🖼️  Generated Images');
  console.log('='.repeat(80));
  await presentImages(result.images);

  // Display captured URLs
  console.log('\n' + '='.repeat(80));
  console.log('📋 Original URLs Returned by OpenAI');
  console.log('='.repeat(80));

  if (urls.length === 0) {
    console.log('\n  ⚠️  No URLs were captured in the download function');
    console.log(
      '     This might indicate that OpenAI returned base64 instead of URLs.',
    );
    console.log(
      '     Check that response_format: "url" is being sent correctly.',
    );
  } else {
    console.log(`\n  ✅ Captured ${urls.length} URL(s):\n`);
    urls.forEach((url, index) => {
      const downloadStartTime = downloadStartTimes.get(url);
      const downloadInfo = downloadStartTime
        ? ` (downloaded at ${new Date(downloadStartTime).toISOString()})`
        : '';
      console.log(`  ${index + 1}. ${url}${downloadInfo}`);
    });
  }

  // Summary and notes
  const overallEndTime = Date.now();
  const overallDuration = formatTiming(overallStartTime, overallEndTime);

  console.log('\n' + '='.repeat(80));
  console.log('📝 Summary & Notes');
  console.log('='.repeat(80));

  console.log(`\n⏱️  Total execution time: ${overallDuration}`);
  console.log(`   Started: ${new Date(overallStartTime).toISOString()}`);
  console.log(`   Finished: ${new Date(overallEndTime).toISOString()}`);

  console.log('\n💡 Key Points:');
  console.log(
    '   • OpenAI returns image URLs when response_format is set to "url"',
  );
  console.log(
    '   • The generateImage function automatically detects URLs (strings starting with "http")',
  );
  console.log(
    '   • URLs are automatically downloaded and converted to GeneratedFile format',
  );
  console.log(
    '   • OpenAI image URLs are valid for 60 minutes after generation',
  );
  console.log(
    '   • You can use experimental_download to customize the download behavior',
  );
  console.log(
    '   • This includes adding authentication, caching, retries, or custom storage',
  );

  console.log('\n🔗 Related Documentation:');
  console.log(
    '   • OpenAI Images API: https://platform.openai.com/docs/guides/images',
  );
  console.log(
    '   • AI SDK generateImage: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-image',
  );

  console.log('\n' + '='.repeat(80));
  console.log('✨ Example completed successfully!');
  console.log('='.repeat(80) + '\n');
});
