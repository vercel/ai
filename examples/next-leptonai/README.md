# Vercel AI SDK, Next.js, and Lepton AI Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Lepton AI](https://www.lepton.ai/) to create a ChatGPT-like AI-powered streaming chat bot. Lepton AI's APIs are compatible with OpenAI's so we use the OpenAI JS SDK but change its base URL to point to Lepton AI's API with an environment variable.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/ai/tree/main/examples/next-leptonai&env=OPENAI_API_KEY&envDescription=Lepton AI API Key&envLink=https://www.lepton.ai/docs/walkthrough/clients&project-name=vercel-ai-chat-leptonai&repository-name=vercel-ai-chat-leptonai)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-leptonai next-leptonai-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-leptonai next-leptonai-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-leptonai next-leptonai-app
```

To run the example locally you need to:

1. Sign up at [Lepton AI Dashboard](https://portal.lepton.ai/login?next=https%3A%2F%2Fdashboard.lepton.ai%2Fworkspace).
2. Go to the API Tokens tab in the settings page and copy the API KEY.
3. Set the required environment variables as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## Learn More

To learn more about OpenAI, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Lepton AI Documentation](https://www.lepton.ai/docs) - learn about Lepton AI features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
