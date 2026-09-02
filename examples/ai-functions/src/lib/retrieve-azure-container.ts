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
  const resourceName = process.env.AZURE_RESOURCE_NAME;

  if (!resourceName) {
    throw new Error('AZURE_RESOURCE_NAME is not set');
  }

  const apiKey = process.env.AZURE_API_KEY;

  if (!apiKey) {
    throw new Error('AZURE_API_KEY is not set');
  }

  const response = await fetch(
    `https://${resourceName}.openai.azure.com/openai/v1/containers/${containerId}`,
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
