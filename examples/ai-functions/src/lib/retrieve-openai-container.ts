type OpenAIContainer = {
  id: string;
  status?: string;
  memory_limit?: '1g' | '4g' | '16g' | '64g';
  [key: string]: unknown;
};

async function retrieveOpenAIContainer(
  containerId: string,
): Promise<OpenAIContainer> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const response = await fetch(
    `https://api.openai.com/v1/containers/${containerId}`,
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

export { retrieveOpenAIContainer };
