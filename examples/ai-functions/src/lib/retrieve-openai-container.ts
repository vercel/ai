import { requireEnv } from './require-env';

type OpenAIContainer = {
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

async function retrieveOpenAIContainer(
  containerId: string,
): Promise<OpenAIContainer> {
  const apiKey = requireEnv('OPENAI_API_KEY');

  const response = await fetch(
    `https://api.openai.com/v1/containers/${encodeURIComponent(containerId)}`,
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

  return (await response.json()) as OpenAIContainer;
}

async function deleteOpenAIContainer(containerId: string): Promise<void> {
  const apiKey = requireEnv('OPENAI_API_KEY');

  const response = await fetch(
    `https://api.openai.com/v1/containers/${encodeURIComponent(containerId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to delete container: ${response.status} ${response.statusText}`,
    );
  }
}

export { retrieveOpenAIContainer, deleteOpenAIContainer };
