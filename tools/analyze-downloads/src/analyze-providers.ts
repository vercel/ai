#!/usr/bin/env tsx

import * as https from 'https';

/**
 * Fetches the raw HTML text from the given URL using https.
 */
function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
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
  const packages = ['@ai-sdk/openai', '@ai-sdk/anthropic'];
  const results: Array<{ package: string; 'weekly downloads': number }> = [];

  try {
    for (const pkg of packages) {
      const url = `https://www.npmjs.com/package/${pkg}`;
      const html = await fetchPage(url);
      const weeklyDownloads = parseWeeklyDownloads(html);

      results.push({ package: pkg, 'weekly downloads': weeklyDownloads });
    }

    console.table(results);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
