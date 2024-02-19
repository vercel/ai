# Vercel AI SDK, Next.js, and ElevenLabs

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [ElevenLabs](https://elevenlabs.io/) to create a ChatGPT-like AI-powered streaming chat bot. It also uses [OpenAI](https://openai.com) to generate the content.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-elevenlabs&env=ELEVENLABS_API_KEY&envDescription=ElevenLabs%20API%20Key&envLink=https%3A%2F%2Felevenlabs.io&project-name=vercel-ai-chat-elevenlabs&repository-name=vercel-ai-chat-elevenlabs)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-elevenlabs next-elevenlabs-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-elevenlabs next-elevenlabs-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-elevenlabs next-elevenlabs-app
```

To run the example locally you need to:

1. Sign up at [ElevenLabs](https://elevenlabs.io).
2. Go to your [ElevenLabs profile](https://app.elevenlabs.io/) and create an API KEY (`ELEVENLABS_API_KEY`).
3. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
4. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
5. Set the required API keys as environment variables using the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
6. `pnpm install` to install the required dependencies.
7. `pnpm dev` to launch the development server.

## Learn More

To learn more about ElevenLabs, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [ElevenLabs Documentation](https://elevenlabs.io/docs/introduction) - learn about ElevenLabs features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
