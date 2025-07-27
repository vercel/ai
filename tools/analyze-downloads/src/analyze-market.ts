#!/usr/bin/env tsx

import * as https from 'https';

/**
 * Fetches the raw HTML text from the given URL using https.
 */
function fetchPage(url: string, retries = 10, delay = 4000): Promise<string> {
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
            new Error(`Failed to fetch ${url}. Status code: ${res.statusCode}`),
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
    'ai',
    'openai',
    '@anthropic-ai/sdk',
    'langchain',
    '@aws-sdk/client-bedrock-runtime',
    '@google/generative-ai',
    '@google-cloud/vertexai',
    '@xenova/transformers',
    '@mistralai/mistralai',
    'llamaindex',
    '@instructor-ai/instructor',
    'together-ai',
  ];
  const results: Array<{
    package: string;
    'weekly downloads': number;
    percentage: string;
  }> = [];

  try {
    for (const pkg of packages) {
      const url = `https://www.npmjs.com/package/${pkg}`;
      const html = await fetchPage(url);
      const weeklyDownloads = parseWeeklyDownloads(html);

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
