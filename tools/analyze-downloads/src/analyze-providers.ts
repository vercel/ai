#!/usr/bin/env tsx

/**
 * Extracts weekly downloads from the npm package page
 * using a regex-based search on the HTML.
 */
function parseWeeklyDownloads(html: string): number {
  // Look for the weekly downloads number in the new HTML structure
  const weeklyDownloadsRegex =
    /Weekly Downloads<\/h3>.*?<p[^>]*>([0-9,]+)<\/p>/s;
  const match = html.match(weeklyDownloadsRegex);

  if (!match) {
    return 0;
  }

  const downloadsStr = match[1].replace(/[^\d]/g, ''); // remove commas
  return parseInt(downloadsStr, 10) || 0;
}

/**
 * Main execution function.
 */
async function main() {
  const packages = [
    '@ai-sdk/amazon-bedrock',
    '@ai-sdk/anthropic',
    '@ai-sdk/assemblyai',
    '@ai-sdk/azure',
    '@ai-sdk/baseten',
    '@ai-sdk/cerebras',
    '@ai-sdk/cohere',
    '@ai-sdk/deepgram',
    '@ai-sdk/deepinfra',
    '@ai-sdk/deepseek',
    '@ai-sdk/elevenlabs',
    '@ai-sdk/fal',
    '@ai-sdk/fireworks',
    '@ai-sdk/gladia',
    '@ai-sdk/google',
    '@ai-sdk/google-vertex',
    '@ai-sdk/groq',
    '@ai-sdk/huggingface',
    '@ai-sdk/hume',
    '@ai-sdk/lmnt',
    '@ai-sdk/luma',
    '@ai-sdk/mistral',
    '@ai-sdk/openai',
    '@ai-sdk/openai-compatible',
    '@ai-sdk/perplexity',
    '@ai-sdk/replicate',
    '@ai-sdk/revai',
    '@ai-sdk/togetherai',
    '@ai-sdk/vercel',
    '@ai-sdk/xai',

    'ollama-ai-provider',
    '@portkey-ai/vercel-provider',
    'workers-ai-provider',
    '@openrouter/ai-sdk-provider',
  ];
  const results: Array<{
    package: string;
    'weekly downloads': number;
    percentage: string;
  }> = [];

  // timestamps
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 7);
  const sevenDaysAgoTimestamp = d.toISOString().split('T')[0];

  try {
    for (const pkg of packages) {
      const response = await fetch(
        `https://api.npmjs.org/downloads/point/${sevenDaysAgoTimestamp}:${yesterdayTimestamp}/${pkg}`,
      );
      const data = await response.json();
      const weeklyDownloads = data.downloads || 0;

      results.push({
        package: pkg,
        'weekly downloads': weeklyDownloads,
        percentage: '0%', // Initial placeholder
      });
    }

    // Calculate total downloads
    const totalDownloads = results.reduce(
      (sum, item) => sum + item['weekly downloads'],
      0,
    );

    // Update percentages
    results.forEach(item => {
      const percentage = (item['weekly downloads'] / totalDownloads) * 100;
      item['percentage'] = `${percentage.toFixed(1)}%`;
    });

    // Sort results by weekly downloads in descending order
    results.sort((a, b) => b['weekly downloads'] - a['weekly downloads']);

    console.table(results);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
