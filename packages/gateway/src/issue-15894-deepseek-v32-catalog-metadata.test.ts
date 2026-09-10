import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type GatewayPricing = {
  input?: string;
  output?: string;
  prompt?: string;
  completion?: string;
};

type GatewayModel = {
  id: string;
  max_tokens?: number;
  pricing?: GatewayPricing;
};

type GatewayEndpoint = {
  provider_name: string;
  max_completion_tokens?: number;
  pricing?: GatewayPricing;
};

type Issue15894Fixture = {
  urls: {
    models: string;
    endpoints: string[];
    pages: string[];
  };
  models: Record<string, GatewayModel>;
  endpoints: Record<
    string,
    {
      data: {
        endpoints: GatewayEndpoint[];
      };
    }
  >;
  pages: Record<
    string,
    {
      headerAndProviderText: string;
      aboutText: string;
    }
  >;
};

const fixture = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/issue-15894-deepseek-v3.2-catalog.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Issue15894Fixture;

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

describe('AI Gateway DeepSeek V3.2 catalog metadata (issue #15894)', () => {
  it('keeps aggregate catalog metadata consistent with rendered pages and endpoints', () => {
    const failures: string[] = [];
    const thinkingModelId = 'deepseek/deepseek-v3.2-thinking';
    const thinkingModel = fixture.models[thinkingModelId];
    const thinkingEndpoints = fixture.endpoints[thinkingModelId].data.endpoints;
    const thinkingPage = fixture.pages[thinkingModelId];
    const endpointProviders = thinkingEndpoints.map(
      endpoint => endpoint.provider_name,
    );
    const bedrockEndpoint = thinkingEndpoints.find(
      endpoint => endpoint.provider_name === 'bedrock',
    );

    if (
      thinkingPage.aboutText.includes('under the deepseek provider') &&
      !endpointProviders.includes('deepseek')
    ) {
      failures.push(
        `${fixture.urls.pages[1]} says the Thinking variant is available under the deepseek provider, but ${fixture.urls.endpoints[1]} does not list a deepseek endpoint.`,
      );
    }

    if (
      bedrockEndpoint != null &&
      hasPrice(thinkingModel.pricing, '0.00000062', '0.00000185') &&
      hasPrice(bedrockEndpoint.pricing, '0.00000062', '0.00000185') &&
      !('pricing_provider' in thinkingModel)
    ) {
      failures.push(
        `${fixture.urls.models} exposes Bedrock-like aggregate pricing for ${thinkingModelId} without exposing the provider selected for aggregate pricing.`,
      );
    }

    if (
      thinkingModel.max_tokens === 8000 &&
      thinkingPage.headerAndProviderText.includes(
        'generates up to 163K tokens',
      ) &&
      thinkingPage.aboutText.includes(
        'output token budget extends to 163K tokens',
      )
    ) {
      failures.push(
        `${fixture.urls.models} reports max_tokens=8000 for ${thinkingModelId}, while the rendered model page says it generates up to 163K tokens.`,
      );
    }

    expect(failures).toEqual([]);
  });
});
