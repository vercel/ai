# Vercel AI SDK, Next.js, and Inkeep (Claude) Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Inkeep's Managed AI Chat Service](https://docs.inkeep.com/claude/reference/getting-started-with-the-api) to create a Claude-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-inkeep&env=INKEEP_API_KEY&envDescription=Inkeep_API_Key&envLink=https://console.inkeep.com/account/keys&project-name=vercel-ai-chat-inkeep&repository-name=vercel-ai-chat-inkeep)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-inkeep next-inkeep-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-inkeep next-inkeep-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-inkeep next-inkeep-app
```

To run the example locally you need to:

1. [Get onboarded](https://docs.inkeep.com/overview/getting-started) to Inkeep to receive an Inkeep API Key and Integration ID.
2. Set the required Inkeep environment variables as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
3. `pnpm install` to install the required dependencies.
4. `pnpm dev` to launch the development server.

## Learn More

To learn more about OpenAI, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Inkeep Documentation](https://docs.inkeep.com) - learn about Claude features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
