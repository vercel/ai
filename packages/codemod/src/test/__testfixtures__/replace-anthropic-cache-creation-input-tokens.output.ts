declare const result: {
  usage: {
    inputTokenDetails: {
      cacheWriteTokens?: number;
    };
  };
};

console.log(result.usage.inputTokenDetails.cacheWriteTokens);
