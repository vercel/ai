type GatewayPricing = {
  input?: string;
  output?: string;
  prompt?: string;
  completion?: string;
  input_cache_read?: string;
};

type GatewayModel = {
  id: string;
  owned_by?: string;
  max_tokens?: number;
  pricing?: GatewayPricing;
};

type GatewayEndpoint = {
  provider_name: string;
  max_completion_tokens?: number;
  pricing?: GatewayPricing;
};

type GatewayEndpointsResponse = {
  data: {
    id: string;
    endpoints: GatewayEndpoint[];
  };
};

const gatewayModelsUrl = 'https://ai-gateway.vercel.sh/v1/models';
const gatewayModelPageBaseUrl = 'https://vercel.com/ai-gateway/models';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }

  return response.text();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPrice(
  pricing: GatewayPricing | undefined,
  input: string,
  output: string,
): boolean {
  return (
    (pricing?.input === input || pricing?.prompt === input) &&
    (pricing?.output === output || pricing?.completion === output)
  );
}

async function main() {
  const failures: string[] = [];
  const modelsResponse = await fetchJson<{ data: GatewayModel[] }>(
    gatewayModelsUrl,
  );
  const thinkingModelId = 'deepseek/deepseek-v3.2-thinking';
  const thinkingModel = modelsResponse.data.find(
    model => model.id === thinkingModelId,
  );

  if (thinkingModel == null) {
    throw new Error(
      `${thinkingModelId} was not present in ${gatewayModelsUrl}`,
    );
  }

  const endpointsUrl = `${gatewayModelsUrl}/${thinkingModelId}/endpoints`;
  const endpointsResponse =
    await fetchJson<GatewayEndpointsResponse>(endpointsUrl);
  const endpointProviders = endpointsResponse.data.endpoints.map(
    endpoint => endpoint.provider_name,
  );
  const bedrockEndpoint = endpointsResponse.data.endpoints.find(
    endpoint => endpoint.provider_name === 'bedrock',
  );

  const pageUrl = `${gatewayModelPageBaseUrl}/deepseek-v3.2-thinking`;
  const pageText = stripHtml(await fetchText(pageUrl));

  const pageClaimsDeepSeekProvider = pageText.includes(
    'The Thinking variant and standard V3.2 are accessible through AI Gateway under the deepseek provider',
  );
  if (pageClaimsDeepSeekProvider && !endpointProviders.includes('deepseek')) {
    failures.push(
      `${pageUrl} says the Thinking variant is available under the deepseek provider, but ${endpointsUrl} only lists providers: ${endpointProviders.join(
        ', ',
      )}.`,
    );
  }

  if (
    bedrockEndpoint != null &&
    hasPrice(thinkingModel.pricing, '0.00000062', '0.00000185') &&
    hasPrice(bedrockEndpoint.pricing, '0.00000062', '0.00000185') &&
    !('pricing_provider' in thinkingModel)
  ) {
    failures.push(
      `${gatewayModelsUrl} exposes aggregate pricing for ${thinkingModelId} as Bedrock-like $0.62/M input and $1.85/M output, but the model object does not identify Bedrock as the aggregate pricing source.`,
    );
  }

  if (
    thinkingModel.max_tokens === 8000 &&
    pageText.includes('generates up to 163K tokens') &&
    pageText.includes('The output token budget extends to 163K tokens')
  ) {
    failures.push(
      `${gatewayModelsUrl} reports max_tokens=8000 for ${thinkingModelId}, while ${pageUrl} says the model generates up to 163K tokens and has a 163K output token budget.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `AI Gateway DeepSeek V3.2 catalog metadata is inconsistent:\n- ${failures.join(
        '\n- ',
      )}`,
    );
  }

  console.log(
    'AI Gateway DeepSeek V3.2 catalog metadata is internally consistent.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
