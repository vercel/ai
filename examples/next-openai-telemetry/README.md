# AI SDK, Next.js, Vercel AI Gateway, and OpenAI Chat Example with Telemetry

This example shows how to use the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org/) and the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) to create a ChatGPT-like AI-powered streaming chat bot with [OpenTelemetry support](https://ai-sdk.dev/docs/ai-sdk-core/telemetry).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-openai-telemetry&project-name=vercel-ai-chat-openai-telemetry&repository-name=vercel-ai-chat-openai-telemetry)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-openai-telemetry next-openai-telemetry-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-openai-telemetry next-openai-telemetry-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-openai-telemetry next-openai-telemetry-app
```

To run the example locally you need to:

1. Sign up for the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
2. Create an API key from your Vercel dashboard.
3. Set the required environment variable as shown in [the example env file](./.env.local.example) but in a new file called `.env.local`
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## Learn More

To learn more about the Vercel AI Gateway, Next.js, and the AI SDK take a look at the following resources:

- [AI SDK docs](https://ai-sdk.dev/docs)
- [AI SDK telemetry support](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
- [Vercel AI Playground](https://ai-sdk.dev/playground)
- [Vercel AI Gateway Documentation](https://vercel.com/docs/ai-gateway) - learn about the Vercel AI Gateway features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
