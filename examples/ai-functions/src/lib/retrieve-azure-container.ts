import { requireEnv } from './require-env';

type AzureContainer = {
  id: string;
  status?: string;
  memory_limit?: '1g' | '4g' | '16g' | '64g';
  network_policy?:
    | { type: 'disabled' }
    | {
        type: 'allowlist';
        allowed_domains: string[];
        domain_secrets?: Array<{
          domain: string;
          name: string;
          value: string;
        }>;
      };
  [key: string]: unknown;
};

async function retrieveAzureContainer(
  containerId: string,
): Promise<AzureContainer> {
  const resourceName = requireEnv('AZURE_RESOURCE_NAME');
  const apiKey = requireEnv('AZURE_API_KEY');

  const response = await fetch(
    `https://${resourceName}.openai.azure.com/openai/v1/containers/${encodeURIComponent(containerId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to retrieve container: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as AzureContainer;
}

export { retrieveAzureContainer };
