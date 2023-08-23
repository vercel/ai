2# Vercel AI SDK, Next.js, and Fireworks.ai Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Fireworks.ai](https://app.fireworks.ai) to create a ChatGPT-like AI-powered streaming chat bot. Fireworks.ai's APIs are compatible with OpenAI's so we use the OpenAI JS SDK but change its base URL to point to Fireworks's API with an environment variable.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-fireworks&env=OPENAI_API_KEY&envDescription=Fireworks%20API%20Key&envLink=https%3A%2F%2Fapp.fireworks.ai%2Faccount%2Fapi-keys&project-name=vercel-ai-chat-fireworks&repository-name=vercel-ai-chat-fireworks)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-fireworks next-fireworks-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-fireworks next-fireworks-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-fireworks next-fireworks-app
```

To run the example locally you need to:

1. Sign up at [Fireworks.ai's Developer Platform](https://app.fireworks.ai/login).
2. Go to [Fireworks.ai's dashboard](https://app.fireworks.ai/users?tab=apps) and create an API KEY.
3. Set the required environment variables as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## Learn More

To learn more about OpenAI, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Fireworks.ai Documentation](https://readme.fireworks.ai/docs) - learn about OpenAI features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
