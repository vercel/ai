# Manual Testing

You can use the examples under `/examples/ai-core` and `/examples/next-openai` for manual testing (command line and web UI).

Ideally you should cover 3 cases for changes or new features:

- `generateText` test (command line)
- `streamText` test (command line)
- UI test with message and follow up message after the assistant response (to ensure that the results are correctly send back to the LLM)

# Unit Testing

## Providers

### Test Fixtures

For provider response parsing tests, we aim at storing test fixtures with the true responses from the providers (unless they are too large in which case some cutting that does not change semantics is advised).

The fixtures are stored in a `__fixtures__` subfolder, e.g. `packages/openai/src/responses/__fixtures__`. See the file names in `packages/openai/src/responses/__fixtures__` for naming conventions and `packages/openai/src/responses/openai-responses-language-model.test.ts` for how to set up test helpers.

You can use our examples under `/examples/ai-core` to generate test fixtures.

#### generateText

For `generateText`, log the raw response output to the console and copy it into a new test fixture.

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-5-nano'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(JSON.stringify(result.response.body, null, 2));
});
```

#### streamText

For `streamText`, you need to set `includeRawChunks` to `true` and use the special `saveRawChunks` helper. Run the script from the `/example/ai-core` folder via `pnpm tsx src/stream-text/script-name.ts`. The result is then stored in the `/examples/ai-core/output` folder. You can copy it to your fixtures folder and rename it.

```ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: openai('gpt-5-nano'),
    prompt: 'Invent a new holiday and describe its traditions.',
    includeRawChunks: true,
  });

  await saveRawChunks({ result, filename: 'openai-gpt-5-nano' });
});
```
