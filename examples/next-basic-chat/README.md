# Next.js Basic Chat Example

A minimal Next.js App Router chat example using the Vercel AI SDK.

## Features

- `@ai-sdk/react` → `useChat` hook for client-side chat
- `@ai-sdk/openai` + `streamText` for server streaming
- Edge runtime
- Clean and minimal UI

## Setup

1. Add your key (`AI_GATEWAY_API_KEY`) to `.env.local` in the **repo root**:

AI_GATEWAY_API_KEY=your_key_here


2. Install & run:


pnpm install
pnpm dev --filter ai-examples-next-basic-chat