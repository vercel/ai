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
 * Extracts version + all-time downloads from the npm versions page
 * by applying a naive regex-based search on the HTML.
 *
 * Returns an array of { version, allTimeDownloads } objects.
 */
function parseVersions(
  html: string,
): { version: string; allTimeDownloads: number }[] {
  const results: { version: string; allTimeDownloads: number }[] = [];

  // First find the Version History section
  const versionHistorySection = html.split('Version History')[1];
  if (!versionHistorySection) {
    return results;
  }

  /**
   * Regex matching the npm version table row structure in Version History:
   * - Matches version number in <a> tag
   * - Matches download count in <td class="downloads">
   */
  const versionRegex =
    /<a href="\/package\/ai\/v\/([^"]+)"[^>]*>[^<]+<\/a><\/td><td class="downloads">([\d,]+)/g;

  let match: RegExpExecArray | null;
  while ((match = versionRegex.exec(versionHistorySection)) !== null) {
    const version = match[1];
    // Skip versions starting with 0.x or 1.x
    if (version.startsWith('0.') || version.startsWith('1.')) {
      continue;
    }

    const downloadsStr = match[2].replace(/[^\d]/g, ''); // remove commas, etc.
    const downloads = parseInt(downloadsStr, 10);

    if (!isNaN(downloads)) {
      results.push({
        version,
        allTimeDownloads: downloads,
      });
    }
  }

  return results;
}

/**
 * Converts a full version string like "1.2.3" (or "1.2.3-alpha")
 * to its "major.minor" part, e.g. "1.2"
 */
function toMinorVersion(fullVersion: string): string {
  // Split on dot to handle something like "1.2.3"
  // If the version has a pre-release, e.g. "1.2.3-alpha.1", we still
  // only extract [major, minor] from the front.
  const [major, minor] = fullVersion.split('.');
  return [major ?? '0', minor ?? '0'].join('.');
}

/**
 * Aggregates the download counts by major.minor key.
 */
function aggregateByMinor(
  data: { version: string; allTimeDownloads: number }[],
): Record<string, number> {
  const output: Record<string, number> = {};
  for (const entry of data) {
    const minor = toMinorVersion(entry.version);
    output[minor] = (output[minor] || 0) + entry.allTimeDownloads;
  }
  return output;
}

/**
 * Main execution function.
 */
async function main() {
  const url = 'https://www.npmjs.com/package/ai?activeTab=versions';

  try {
    console.log(`Fetching page: ${url}`);
    const html = await fetchPage(url);

    console.log('Parsing versions...');
    const parsed = parseVersions(html);

    console.log(`Found ${parsed.length} versions. Aggregating by minor...`);
    const aggregated = aggregateByMinor(parsed);

    // Show the results
    console.log('Aggregated all-time downloads by minor version:');
    console.log(aggregated);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
