# AI SDK, Next.js, and FastAPI Example

This example show you how to use the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org) and [FastAPI](https://fastapi.tiangolo.com).

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

You will also need [Python 3.6+](https://www.python.org/downloads) and create venv to run the FastAPI server.

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. Set the required environment variables as shown in [the example env file](./.env.local.example) but in a new file called `.env.local`.
4. `python -m venv venv` to create a python virtual environment.
5. `venv\Scripts\activate` to activate the python virtual environment.
6. `pip install -r requirements.txt` to install the required python dependencies.
7. `uvicorn api.index:app --host 0.0.0.0 --port 8000 --reload` to run the FastAPI Server.
7. `pnpm install` to install the required dependencies.
8. `pnpm dev` to launch the Next.js development server on port 3000.

## Learn More

To learn more about the AI SDK, Next.js, and FastAPI take a look at the following resources:

- [AI SDK Docs](https://ai-sdk.dev/docs) - view documentation and reference for the AI SDK.
- [Vercel AI Playground](https://ai-sdk.dev/playground) - try different models and choose the best one for your use case.
- [Next.js Docs](https://nextjs.org/docs) - learn about Next.js features and API.
- [FastAPI Docs](https://fastapi.tiangolo.com) - learn about FastAPI features and API.
