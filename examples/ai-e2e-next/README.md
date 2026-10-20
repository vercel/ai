# AI SDK, Next.js, and OpenAI Chat Example

This example shows how to use the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org/) and [OpenAI](https://openai.com) to create a ChatGPT-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fai-e2e-next&env=OPENAI_API_KEY&project-name=ai-sdk-next-openai&repository-name=ai-sdk-next-openai)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/ai-e2e-next next-openai-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/ai-e2e-next next-openai-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/ai-e2e-next next-openai-app
```

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. If you choose to use external files for attachments, then create a [Vercel Blob Store](https://vercel.com/docs/storage/vercel-blob).
4. Set the required environment variable as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
5. `pnpm install` to install the required dependencies.
6. `pnpm dev` to launch the development server.

## WebSocket chat

The `/chat/websocket` page uses `WebSocketChatTransport` and `useChat` with a
separate Node.js WebSocket server. Start both processes from this directory:

```bash
pnpm dev
```

```bash
pnpm dev:websocket
```

Open [the WebSocket chat](http://localhost:3000/chat/websocket). The server reads
`OPENAI_API_KEY` from `.env` or `.env.local` and uses `gpt-6-luna`. To try the
example without a key, run `WEBSOCKET_CHAT_MOCK=1 pnpm dev:websocket` instead.

- Send several messages to reuse one connection.
- Ask “What is my time zone?” to execute a browser-side tool. Its result starts
  a follow-up turn over the same socket.
- Click **Disconnect** while a response streams, then **Resume** to replay it
  from the beginning with the same assistant message ID.
- Click **Stop** to cancel server work. Leaving the page closes its socket.

The server binds to `127.0.0.1:3001`, accepts the origin `http://localhost:3000`,
and retains completed responses in memory for 60 seconds. Override these with
`WEBSOCKET_CHAT_PORT`, `WEBSOCKET_CHAT_ORIGIN`, and the page's
`NEXT_PUBLIC_WEBSOCKET_CHAT_URL`. This local example uses random session IDs to
isolate chats; production needs authenticated session ownership and durable
replay storage. The WebSocket server needs a host that supports persistent
connections; it is not a Next.js route handler.

Run the browser tests from this directory:

```bash
pnpm exec playwright install chromium
pnpm test:websocket
```

The tests start Next.js on port 3100 and the WebSocket server on port 3101.
Set `WEBSOCKET_CHAT_TEST_PORT` to change the first port; the socket uses the next
port. Only the model is mocked: streaming, client tools, cancellation, replay,
and connection cleanup run through the actual SDK and a real WebSocket server.
Build workspace packages first with `pnpm build` from the repository root.

## Learn More

To learn more about OpenAI, Next.js, and the AI SDK take a look at the following resources:

- [AI SDK docs](https://ai-sdk.dev/docs)
- [Vercel AI Playground](https://ai-sdk.dev/playground)
- [OpenAI Documentation](https://platform.openai.com/docs) - learn about OpenAI features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
