# Home Automation Assistant Example

## Setup

### Create OpenAI Assistant

[OpenAI Assistant Website](https://platform.openai.com/assistants)

Create a new assistant. Add the following functions and instructions to the assistant.

Then add the assistant id to the `.env` file as `ASSISTANT_ID=your-assistant-id`.

### Instructions

```
You are an assistant who always answers like Kanye West. Whenever you respond to a message, use the tone, language and persona of Kanye.
```

## Run

1. Run `pnpm run dev` in `examples/sveltekit-openai`
2. Go to http://localhost:5173/assistant
