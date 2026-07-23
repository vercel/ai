# AI SDK, Next.js, and FastAPI Examples

These examples show you how to use the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org) and [FastAPI](https://fastapi.tiangolo.com).

## Prerequisites

- Node.js 22, 24, or 26
- pnpm 10 or later
- [Python 3.8 or later](https://www.python.org/downloads/)
- macOS, Linux, or Windows Subsystem for Linux (the Python dependencies include `uvloop`, which does not support native Windows)

## Setup

This example depends on local AI SDK workspace packages, so run it from a clone of the AI SDK repository instead of using `create-next-app`.

1. Clone the repository, or use an existing checkout:

   ```bash
   git clone https://github.com/vercel/ai.git
   cd ai
   ```

2. From the repository root, install dependencies and build the workspace packages:

   ```bash
   pnpm install
   pnpm build:packages
   ```

3. Change to the example directory:

   ```bash
   cd examples/next-fastapi
   ```

4. Copy the example environment file and add an [OpenAI API key](https://platform.openai.com/api-keys):

   ```bash
   cp .env.local.example .env.local
   ```

5. Create and activate a Python virtual environment:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

6. Start the Next.js and FastAPI development servers:

   ```bash
   pnpm dev
   ```

## Learn More

To learn more about the AI SDK, Next.js, and FastAPI take a look at the following resources:

- [AI SDK Docs](https://ai-sdk.dev/docs) - view documentation and reference for the AI SDK.
- [Vercel AI Playground](https://ai-sdk.dev/playground) - try different models and choose the best one for your use case.
- [Next.js Docs](https://nextjs.org/docs) - learn about Next.js features and API.
- [FastAPI Docs](https://fastapi.tiangolo.com) - learn about FastAPI features and API.
