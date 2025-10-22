#!/usr/bin/env tsx

/**
 * Converts a full version string like "1.2.3" (or "1.2.3-alpha")
 * to its "major.minor" or "major.minor (channel)" part, e.g. "1.2" or "1.2 (alpha)".
 */
function toMinorVersion(semanticVersion: string): string {
  const [versionPart, channelPart] = semanticVersion.split("-");
  const [major, minor] = versionPart.split(".");
  let minorVersion = `${major}.${minor}`;
  if (channelPart) {
    const [channel] = channelPart.split(".");
    minorVersion += ` (${channel})`;
  }
  return minorVersion;
}

/**
 * Aggregates the download counts by major.minor key.
 */
function aggregateByMinor(
  data: { version: string; weeklyDownloads: number }[],
): Record<string, number> {
  const output: Record<string, number> = {};
  for (const [versionString, downloads] of Object.entries(data)) {
    const minor = toMinorVersion(versionString);
    // ignore versions < 1.0
    if (minor.startsWith("0.")) continue;

    // ignore versions that have channel but where channel is not beta
    if (minor.includes("(") && !minor.includes("(beta)")) continue;

    output[minor] = (output[minor] || 0) + downloads;
  }
  return output;
}

/**
 * Main execution function.
 */
async function main() {
  const response = await fetch(`https://api.npmjs.org/versions/ai/last-week`);
  const { downloads } = await response.json();

  const aggregated = aggregateByMinor(downloads);
  console.table(Object.entries(aggregated)
    // sort by version string
    .sort(([a], [b]) => {
      // sort 5.0 beta after 5.0
      if (a === b.replace(" (beta)", "")) return -1;
      if (b === a.replace(" (beta)", "")) return 1;
      return b.localeCompare(a)
    })
    // map to objects for better console.table formatting
    .map(([version, count]) => ({ version, count })));
}

main();
