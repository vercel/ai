I'm thinking we really double down on data parts with like a data-confirmTool

this would have:

```json
{
  toolName: string;
  status: "pending" | "approved" | "rejected";
  toolCallId: string; // this would be really nice if we could make this work; probs requires search and replacing - but that's saved on the client argh
}
```

but i guess we need to do all of this on the client anyway

maybe we can have the execute function like normal
we check the message history to check if there is a data-approval with the right toolCallId -> if so, we can proceed, otherwise we return awaiting human approval
we could also have dynamic stopWhen that will stop on that toolCall if there is no approval?

so flow would be:

1. user says: "what's the weather in sf"
2. llm has controlled tool called `getWeather` which requires approval
3. llm generates toolCall
   a. tool execute function has check to see if data-approval for toolName, if notjjjj
