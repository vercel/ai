---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
---

feat (provider): add providerMetadata to ImageModelV2 interface (#5977)

The `experimental_generateImage` method from the `ai` package now returnes revised prompts for OpenAI's image models.

```js
const prompt = 'Santa Claus driving a Cadillac';

const { providerMetadata } = await experimental_generateImage({
  model: openai.image('dall-e-3'),
  prompt,
});

const revisedPrompt = providerMetadata.openai.images[0]?.revisedPrompt;

console.log({
  prompt,
  revisedPrompt,
});
```
