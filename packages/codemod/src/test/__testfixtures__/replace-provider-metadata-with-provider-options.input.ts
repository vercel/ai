export {};

declare const model: any;
declare const providerMetadata: any;
declare function generateText(options: any): Promise<any>;

const result = await generateText({
  model,
  prompt: 'Hello',
  providerMetadata: {
    openai: { store: false },
  },
});

await generateText({
  model,
  prompt: 'Hello',
  providerMetadata,
});

await generateText({
  model,
  prompt: 'Hello',
  'providerMetadata': {
    openai: { store: false },
  },
} as any);

interface Result {
  providerMetadata?: Record<string, unknown>;
}

const metadata = result.providerMetadata;
const computedMetadata = result['providerMetadata'];
const { providerMetadata: returnedMetadata } = result;
const returnedResult: Result = { providerMetadata: returnedMetadata };
