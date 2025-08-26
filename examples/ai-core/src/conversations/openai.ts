import { openai } from '@ai-sdk/openai';
import 'dotenv/config';


async function main() {
  const conversation = await openai.conversations.create({
  metadata: { topic: "demo" },
  items: [
    { type: "message", role: "user", content: "Hello!" }
  ],
});
console.log(conversation);
}

main();
