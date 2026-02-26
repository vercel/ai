# AI SDK Telemetry Registry - Contributing a Handler

You can add your telemetry handler to the registry by submitting a pull request that updates the `content/telemetry-registry/registry.ts` file.

### Prerequisites

Before submitting your handler, ensure you have:

- Published your handler package to npm
- Your package exports a factory function that returns a `TelemetryHandler` (from the `ai` package)
- Documented your handler with clear usage instructions
- Tested your handler with the AI SDK (`generateText` and `streamText`)

### Adding Your Handler

1. **Fork and clone the repository**

   Follow the setup instructions in the main [CONTRIBUTING.md](../../CONTRIBUTING.md)

2. **Add your handler entry**

   ```bash
   # Navigate to the telemetry registry directory
   cd content/telemetry-registry
   ```

   Open `registry.ts` in your editor and add a new handler object to the `telemetryHandlers` array following this structure:

   ```typescript
   {
     slug: 'your-handler-slug',
     name: 'Your Handler Name',
     description: 'Clear description of what your handler does and its capabilities',
     packageName: 'your-package-name',
     tags: ['observability', 'logging'], // Optional: categorize your handler
     apiKeyEnvName: 'YOUR_API_KEY', // Optional: environment variable name for API key
     installCommand: {
       pnpm: 'pnpm install your-package-name',
       npm: 'npm install your-package-name',
       yarn: 'yarn add your-package-name',
       bun: 'bun add your-package-name',
     },
     codeExample: `import { streamText } from 'ai';
   import { yourHandler } from 'your-package-name';

   const result = streamText({
     model: openai('gpt-4o'),
     prompt: 'Hello!',
     experimental_telemetry: {
       isEnabled: true,
       handlers: [yourHandler()],
     },
   });`,
     docsUrl: 'https://your-docs-url.com',
     apiKeyUrl: 'https://your-api-key-url.com',
     websiteUrl: 'https://your-website.com',
     npmUrl: 'https://www.npmjs.com/package/your-package-name',
   }
   ```

3. **Implementing a TelemetryHandler**

   Your npm package should export a factory function that returns a `TelemetryHandler`. All lifecycle methods are optional — implement only the ones your handler needs:

   ```typescript
   import type { TelemetryHandler } from 'ai';
   import { bindTelemetryHandler } from 'ai';

   class MyTelemetryHandler implements TelemetryHandler {
     async onStart(event) {
       // Called when generation begins
     }

     async onStepStart(event) {
       // Called when a step (LLM call) begins
     }

     async onToolCallStart(event) {
       // Called when a tool execution begins
     }

     async onToolCallFinish(event) {
       // Called when a tool execution completes or errors
     }

     async onStepFinish(event) {
       // Called when a step (LLM call) completes
     }

     async onFinish(event) {
       // Called when the entire generation completes
     }
   }

   export function myHandler(): TelemetryHandler {
     return bindTelemetryHandler(new MyTelemetryHandler());
   }
   ```

   Use `bindTelemetryHandler` when your handler is class-based to ensure `this` is correctly bound when methods are called as callbacks.

4. **Provide a working code example**

   Your `codeExample` should:

   - Be a complete, working example
   - Show realistic usage of your handler
   - Use the `experimental_telemetry.handlers` array
   - Include necessary imports
   - Be tested to ensure it works

5. **Submit your pull request**

   ```bash
   # Create a new branch
   git checkout -b feat/add-telemetry-handler-your-handler-name

   # Add and commit your changes
   git add content/telemetry-registry/registry.ts
   git commit -m "feat(telemetry-registry): add your-handler-name"

   # Push and create a pull request
   git push origin feat/add-telemetry-handler-your-handler-name
   ```

   Use the PR title format: `feat(telemetry-registry): add your-handler-name`

## Questions?

If you have questions about adding your handler to the registry:

- Check the main [CONTRIBUTING.md](../../CONTRIBUTING.md) guide
- Review existing handler entries in `registry.ts` for examples
- Open an issue on [GitHub](https://github.com/vercel/ai/issues)
