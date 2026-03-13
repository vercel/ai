import { MockLanguageModelV3 } from 'ai/test';

// Workaround for SWC plugin bug (https://github.com/vercel/workflow/issues/1365):
// `new ClassName(...)` in a step closure doesn't get closure vars hoisted
// correctly. Wrapping the constructor call in a plain function (imported
// from a separate file) fixes it.
export function mockProvider(
  ...args: ConstructorParameters<typeof MockLanguageModelV3>
) {
  return new MockLanguageModelV3(...args);
}
