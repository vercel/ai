#!/usr/bin/env tsx

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
    '@google/genai',
    '@google-cloud/vertexai',
    '@xenova/transformers',
    '@mistralai/mistralai',
    'llamaindex',
    '@instructor-ai/instructor',
    'together-ai',
  ];
  const results: Array<{
    package: string;
    'past week': number;
    previous: number;
    diff: number;
    '%': string;
    'previous %': string;
    'diff %': string;
  }> = [];

  // timestamps
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 6);
  const sevenDaysAgoTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 1);
  const eightDaysAgoTimestamp = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 6);
  const fourteenDaysAgoTimestamp = d.toISOString().split('T')[0];

  console.log(
    `Fetching download stats from ${sevenDaysAgoTimestamp} to ${yesterdayTimestamp} and ${fourteenDaysAgoTimestamp} to ${eightDaysAgoTimestamp}...`,
  );

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
        previous: dataPrevWeek.downloads || 0,
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
      const pastWeekPercentage =
        pastWeektotalDownloads > 0
          ? (item['past week'] / pastWeektotalDownloads) * 100
          : 0;
      item['%'] = `${pastWeekPercentage.toFixed(1)}%`;
      const previousPercentage =
        previousTotalDownloads > 0
          ? (item['previous'] / previousTotalDownloads) * 100
          : 0;
      item['previous %'] = `${previousPercentage.toFixed(1)}%`;
      const diffPercentage = pastWeekPercentage - previousPercentage;
      item['diff %'] =
        `${diffPercentage >= 0 ? '+' : ''}${diffPercentage.toFixed(1)}%`;
    });

    // Sort results by past week in descending order
    results.sort((a, b) => b['past week'] - a['past week']);

    console.table(results);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
