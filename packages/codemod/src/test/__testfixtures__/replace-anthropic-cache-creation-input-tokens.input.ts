declare const result: {
  providerMetadata?: {
    anthropic?: {
      cacheCreationInputTokens?: number;
    };
  };
};

console.log(result.providerMetadata?.anthropic?.cacheCreationInputTokens);
