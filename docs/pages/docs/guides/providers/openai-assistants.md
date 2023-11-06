---
title: OpenAI Assistants
---

import { Steps, Callout } from 'nextra-theme-docs';

# OpenAI Assistants

The Vercel AI SDK has **experimental support** for [OpenAI Assistants](https://openai.com/TODO).
Any of the content below is subject to change as OpenAI continues to develop their assistants API and we iterate on the Vercel AI SDK.

Assistants can have different tools (code interpreter, retrieval, function calling) and access uploaded files.

## Creating Assistants

_Handled through the OpenAI SDK directly_

Lets assume the math assistant:

```json
{
  "id": "asst_BMRA0KXcpSq9JzQNgnpoxU2E",
  "instructions": "You are a personal math tutor. When asked a question, write and run Python code to answer the question.",
  "tools": [{ "type": "code_interpreter" }],
  "model": "gpt-4"
}
```

## Calling Assistants

```ts
// 1. Create a thread
const thread = await openai.threads.create();

// 2. Add a message to the thread
const message = await openai.threads.messages.create({
  threadId: thread.id,
  {
    author: {
      role: "user"
    },
    content: {
      type: "text",
      text: "I need to solve the equation `3x + 11 = 14`. Can you help me?"
    }
  }
});

// 3. Run the assistant on the thread
const response = await openai.threads.run({
  assistantId: "asst_BMRA0KXcpSq9JzQNgnpoxU2E",
  instructions: "Please address the user as Jane Doe. The user has a premium account."
});

// 4. Poll for status change

// 5. Get thread messages
const messages = await openai.threads.messages.list({
  threadId: thread.id
});

// 6. List the run steps
const steps = await openai.threads.runs.steps.list({
  runId: response.id
});

// 7. Retrieve any code interpreter output
```

## File uploads

Per-thread file sharing, e.g. by dropping the files into the dialog panel in the UI. The file ids can then be attached to messages.

```ts
'use client';

import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handeFileUpload, handleSubmit } =
    useChat();

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <label>
          Say something...
          <input value={input} onChange={handleInputChange} />
          <input type="file" onChange={handeFileUpload} />
        </label>
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Output files

Code Interpreter can output files. Those files are attached to response messages as file ids. The files can be retrieved through separate API calls.

We can attach the output files to the response to forward them to the client.

```ts
export async function POST(req: Request) {
  // ... code that results in a completed message ...

  const message = await openai.beta.threads.message.get(thread.id, message.id);

  const file = await openai.beta.thread.files.retrieve(
    thread.id,
    message.id,
    message.file_ids[0],
  );

  const content: string = await openai.files.retrieveContent(file.id);

  const data = new experimental_StreamData();

  data.appendFile(file.name, file.content);

  return new MessageTextResponse(message, {}, data);
}
```

## Annotations

The code interpreter and retrieval tools can add annotations to text passages. Those annotations can be used to highlight the text in the UI.
