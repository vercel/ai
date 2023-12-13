# Vercel AI SDK, Next.js, and Mistral Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Mistral](https://mistral.ai/) to create a ChatGPT-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-mistral&env=MISTRAL_API_KEY&envDescription=Mistral%20API%20Key&envLink=https%3A%2F%2Fconsole.mistral.ai%2Fusers%2Fapi-keys&project-name=vercel-ai-chat-mistral&repository-name=vercel-ai-chat-mistral)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-mistral next-mistral-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-mistral next-mistral-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-mistral next-mistral-app
```

To run the example locally you need to:

1. Sign up at [Mistral's Developer Platform](https://console.mistral.ai/).
2. Activate your Mistral subscription.
3. Go to [Mistral's dashboard](https://console.mistral.ai/users/api-keys) and create an API KEY.
4. Set the required Mistral environment variable as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
5. `pnpm install` to install the required dependencies.
6. `pnpm dev` to launch the development server.

## Learn More

To learn more about Mistral, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Mistral Documentation](https://docs.mistral.ai/) - learn about Mistral features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
