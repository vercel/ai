declare const result: {
  usage: {
    inputTokenDetails: {
      cacheReadTokens: number | undefined;
    };
  };
};

console.log(result.usage.inputTokenDetails.cacheReadTokens);
