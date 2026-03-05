# Angular AI Chat

A simple chat application built with Angular that connects to OpenAI models using the AI SDK.

## Setup

```bash
# Install dependencies
pnpm install

# Create .env file with your OpenAI API key
echo "OPENAI_API_KEY=your_key_here" > .env

# Start the app
pnpm start
```

This runs both the Angular frontend (localhost:4200) and Express backend (localhost:3000) concurrently.

## Tech Stack

- Angular 19
- Express.js backend
- AI SDK (@ai-sdk/angular, @ai-sdk/openai)
- OpenAI GPT models

## Features

- Real-time chat interface
- Message streaming
- Proxy configuration for API requests

Set your preferred model in `chat.component.ts` by changing the `selectedModel` parameter.
