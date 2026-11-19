# Ember AI SDK Example

A small Ember app that uses `@ai-sdk/ember` for chat, completion, and structured object generation.

## Setup

```bash
pnpm install

# Create a .env file with your AI Gateway API key
echo "AI_GATEWAY_API_KEY=your_key_here" > .env

# Start the Vite dev server and the Express backend
pnpm start
```

The Ember app runs on http://localhost:5173, and Vite forwards `/api` requests to the Express backend on http://localhost:3000.

## Tech Stack

- Ember 7 with Vite
- Express backend
- AI SDK (`@ai-sdk/ember`, `ai`)
- AI Gateway (default provider)

## Features

- Streaming chat with a server-side weather tool
- Text completion
- Structured object generation
