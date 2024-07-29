# Vercel AI SDK, Next.js, and FastAPI Examples

Here are examples that show you how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org) and [FastAPI](https://fastapi.tiangolo.com).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-fastapi&env=OPENAI_API_KEY&envDescription=Learn%20more%20about%20how%20to%20get%20these%20environment%20variables&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Fblob%2Fmain%2Fexamples%2Fnext-fastapi%2F.env.local.example&project-name=ai-sdk-next-fastapi&repository-name=ai-sdk-next-fastapi)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-fastapi next-fastapi-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-fastapi next-fastapi-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-fastapi next-fastapi-app
```

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. (Optional) Create a [Vercel Blob Store](https://vercel.com/docs/storage/vercel-blob), if you choose to use external files for attachments.
4. Set the required environment variables as shown in [the example env file](./.env.local.example) but in a new file called `.env.local`.
5. `virtualenv venv` to create a python virtual environment.
6. `source venv/bin/activate` to activate the python virtual environment.
7. `pip install -r requirements.txt` to install the required python dependencies.
8. `pnpm install` to install the required dependencies.
9. `pnpm dev` to launch the development server.

## Learn More

To learn more about the Vercel AI SDK, Next.js, and FastAPI take a look at the following resources:

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs) - view documentation and reference for the Vercel AI SDK.
- [Vercel AI Playground](https://play.vercel.ai) - try different models and choose the best one for your use case.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [FastAPI Documentation](https://fastapi.tiangolo.com) - learn about FastAPI features and API.
