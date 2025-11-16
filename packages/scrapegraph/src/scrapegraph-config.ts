/**
 * Load ScrapeGraph AI API key from environment or provided options
 */
export function loadScrapeGraphApiKey({
  apiKey,
  description = 'ScrapeGraph AI',
}: {
  apiKey: string | undefined;
  description?: string;
}): string {
  if (typeof apiKey === 'string') {
    return apiKey;
  }

  if (apiKey != null) {
    throw new Error(`${description} API key must be a string.`);
  }

  if (typeof process === 'undefined') {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter. Environment variables are not supported in this environment.`,
    );
  }

  const envApiKey = process.env.SCRAPEGRAPH_API_KEY || process.env.SGAI_APIKEY;

  if (envApiKey == null) {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter or set the SCRAPEGRAPH_API_KEY or SGAI_APIKEY environment variable.`,
    );
  }

  if (typeof envApiKey !== 'string') {
    throw new Error(
      `${description} API key must be a string. The value of the environment variable is not a string.`,
    );
  }

  return envApiKey;
}

