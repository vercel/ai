type WebSearch20250305Args = {
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  userLocation?: {
    type: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
};

export function webSearch_20250305(options: WebSearch20250305Args = {}): {
  type: 'provider-defined-server';
  id: 'anthropic.web_search_20250305';
  name: 'web_search';
  args: WebSearch20250305Args;
} {
  return {
    type: 'provider-defined-server',
    id: 'anthropic.web_search_20250305',
    name: 'web_search',
    args: {
      maxUses: options.maxUses,
      allowedDomains: options.allowedDomains,
      blockedDomains: options.blockedDomains,
      userLocation: options.userLocation,
    },
  };
}
