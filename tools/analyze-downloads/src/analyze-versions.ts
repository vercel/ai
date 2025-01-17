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
 * Returns an array of { version, weeklyDownloads } objects.
 */
function parseVersions(
  html: string,
): { version: string; weeklyDownloads: number }[] {
  const results: { version: string; weeklyDownloads: number }[] = [];

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
        weeklyDownloads: downloads,
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
  data: { version: string; weeklyDownloads: number }[],
): Record<string, number> {
  const output: Record<string, number> = {};
  for (const entry of data) {
    const minor = toMinorVersion(entry.version);
    output[minor] = (output[minor] || 0) + entry.weeklyDownloads;
  }
  return output;
}

/**
 * Main execution function.
 */
async function main() {
  const url = 'https://www.npmjs.com/package/ai?activeTab=versions';

  try {
    const html = await fetchPage(url);
    const parsed = parseVersions(html);
    const aggregated = aggregateByMinor(parsed);

    // Calculate total downloads
    const totalDownloads = Object.values(aggregated).reduce(
      (sum, count) => sum + count,
      0,
    );

    // Convert the aggregated data into an array of objects for console.table
    const results = Object.entries(aggregated).map(([version, downloads]) => ({
      version,
      'weekly downloads': downloads,
      percentage: ((downloads / totalDownloads) * 100).toFixed(1) + '%',
    }));

    // Show the results in a table format
    console.log('Aggregated downloads by minor version:');
    console.table(results);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
