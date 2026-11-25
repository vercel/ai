export default {
  // Exercise webpack's handling of the published SDK output on the server too.
  // Otherwise Next.js can externalize server dependencies and skip bundling them.
  transpilePackages: [
    'ai',
    '@ai-sdk/openai',
    '@ai-sdk/provider',
    '@ai-sdk/provider-utils',
    '@ai-sdk/gateway',
  ],
};
