# AI SDK, Next.js, and FastAPI Examples

These examples show you how to use the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org) and [FastAPI](https://fastapi.tiangolo.com).

## How to use

You will need [Python 3.6+](https://www.python.org/downloads) and [virtualenv](https://virtualenv.pypa.io/en/latest/installation.html) installed to run the FastAPI server.

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. Set the required environment variables as shown in [the example env file](./.env.local.example) but in a new file called `.env.local`.
4. `virtualenv venv` to create a python virtual environment.
5. `source venv/bin/activate` to activate the python virtual environment.
6. `pip install -r requirements.txt` to install the required python dependencies.
7. Run the following commands from the root directory of the AI SDK repo:

```sh
pnpm install
pnpm build
```

8. `pnpm dev` to launch the development server.

## Learn More

To learn more about the AI SDK, Next.js, and FastAPI take a look at the following resources:

- [AI SDK Docs](https://ai-sdk.dev/docs) - view documentation and reference for the AI SDK.
- [Vercel AI Playground](https://ai-sdk.dev/playground) - try different models and choose the best one for your use case.
- [Next.js Docs](https://nextjs.org/docs) - learn about Next.js features and API.
- [FastAPI Docs](https://fastapi.tiangolo.com) - learn about FastAPI features and API.
