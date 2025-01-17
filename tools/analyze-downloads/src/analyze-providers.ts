#!/usr/bin/env tsx

import * as https from 'https';

/**
 * Fetches the raw HTML text from the given URL using https.
 */
function fetchPage(url: string, retries = 10, delay = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode === 429 && retries > 0) {
          // Handle rate limiting with exponential backoff
          const retryDelay = delay * 2;
          console.log(`Rate limited, retrying in ${delay}ms...`);
          setTimeout(() => {
            fetchPage(url, retries - 1, retryDelay)
              .then(resolve)
              .catch(reject);
          }, delay);
          return;
        }

        if (res.statusCode !== 200) {
          reject(
            new Error(`Failed to fetch page. Status code: ${res.statusCode}`),
          );
          return;
        }

        let rawData = '';
        res.on('data', chunk => (rawData += chunk));
        res.on('end', () => resolve(rawData));
      })
      .on('error', err => reject(err));
  });
}

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
    '@ai-sdk/openai',
    '@ai-sdk/openai-compatible',
    '@ai-sdk/azure',
    '@ai-sdk/anthropic',
    '@ai-sdk/amazon-bedrock',
    '@ai-sdk/google',
    '@ai-sdk/google-vertex',
    '@ai-sdk/mistral',
    '@ai-sdk/xai',
    '@ai-sdk/togetherai',
    '@ai-sdk/cohere',
    '@ai-sdk/fireworks',
    '@ai-sdk/deepinfra',
    '@ai-sdk/deepseek',
    '@ai-sdk/cerebras',
    '@ai-sdk/groq',
    '@ai-sdk/replicate',

    'ollama-ai-provider',
    'chrome-ai',
    '@portkey-ai/vercel-provider',
    'workers-ai-provider',
    '@openrouter/ai-sdk-provider',
  ];
  const results: Array<{ package: string; 'weekly downloads': number }> = [];

  try {
    for (const pkg of packages) {
      const url = `https://www.npmjs.com/package/${pkg}`;
      const html = await fetchPage(url);
      const weeklyDownloads = parseWeeklyDownloads(html);

      results.push({ package: pkg, 'weekly downloads': weeklyDownloads });
    }

    // Sort results by weekly downloads in descending order
    results.sort((a, b) => b['weekly downloads'] - a['weekly downloads']);

    console.table(results);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
