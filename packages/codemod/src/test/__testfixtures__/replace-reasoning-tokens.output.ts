declare const result: {
  usage: {
    outputTokenDetails: {
      reasoningTokens: number | undefined;
    };
  };
};

console.log(result.usage.outputTokenDetails.reasoningTokens);
