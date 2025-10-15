#!/usr/bin/env tsx

/**
 * Extracts past week from the npm package page
 * using a regex-based search on the HTML.
 */
function parseWeeklyDownloads(html: string): number {
  // Look for the past week number in the new HTML structure
  const weeklyDownloadsRegex =
    /past week<\/h3>.*?<p[^>]*>([0-9,]+)<\/p>/s;
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
    'past week': number;
    'previous': number;
    diff: number;
    '%': string;
    'previous %': string;
    'diff %': string;
  }> = [];

  // timestamps
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 7);
  const sevenDaysAgoTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 1);
  const eightDaysAgoTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 7);
  const fourteenDaysAgoTimestamp = d.toISOString().split('T')[0];

  console.log(`Fetching download stats from ${sevenDaysAgoTimestamp} to ${yesterdayTimestamp} and ${fourteenDaysAgoTimestamp} to ${eightDaysAgoTimestamp}...`);


  try {
    for (const pkg of packages) {
      const responseLastWeek = await fetch(
        `https://api.npmjs.org/downloads/point/${sevenDaysAgoTimestamp}:${yesterdayTimestamp}/${pkg}`,
      );
      const dataLastWeek = await responseLastWeek.json();
      const responsePrevWeek = await fetch(
        `https://api.npmjs.org/downloads/point/${fourteenDaysAgoTimestamp}:${eightDaysAgoTimestamp}/${pkg}`,
      );
      const dataPrevWeek = await responsePrevWeek.json();

      results.push({
        package: pkg,
        'past week': dataLastWeek.downloads || 0,
        '%': '0%', // Initial placeholder
        'previous': dataPrevWeek.downloads || 0,
        'previous %': '0%', // Initial placeholder
        diff: (dataLastWeek.downloads || 0) - (dataPrevWeek.downloads || 0),
        'diff %': '0%', // Initial placeholder
      });
    }

    // Calculate total downloads
    const pastWeektotalDownloads = results.reduce(
      (sum, item) => sum + item['past week'],
      0,
    );
    const previousTotalDownloads = results.reduce(
      (sum, item) => sum + item['previous'],
      0,
    );

    // Update percentages
    results.forEach(item => {
      const pastWeekPercentage = (item['past week'] / pastWeektotalDownloads) * 100;
      item['%'] = `${pastWeekPercentage.toFixed(1)}%`;
      const previousPercentage = (item['previous'] / previousTotalDownloads) * 100;
      item['previous %'] = `${previousPercentage.toFixed(1)}%`;
      const diffPercentage = pastWeekPercentage - previousPercentage;
      item['diff %'] = `${diffPercentage >= 0 ? '+' : ''}${diffPercentage.toFixed(1)}%`;
    });

    // Sort results by past week in descending order
    results.sort((a, b) => b['past week'] - a['past week']);

    console.table(results);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
