"use server";
import { Message, nanoid } from "ai";

export default async function getServerLocation(
  chatMessages: Message[]
): Promise<{ messages: Message[] }> {
  return {
    messages: [
      ...chatMessages,
      {
        id: nanoid(),
        name: "get_client_location",
        role: "function" as const,
        content: JSON.stringify({
          datacenter: "us-east-1",
          location: "Ashburn, Virginia",
          info: "This data is fake data stubbed out to show functionality for tools running on the server",
        }),
      },
    ],
  };
}
