# Home Automation Assistant Example

## Setup

### Create OpenAI Assistant

[OpenAI Assistant Website](https://platform.openai.com/assistants)

Create a new assistant. Enable Code interpreter. Add the following functions and instructions to the assistant.

Then add the assistant id to the `.env.local` file as `ASSISTANT_ID=your-assistant-id`.

### Instructions

```
You are an assistant with access to a home automation system. You can get and set the temperature in the bedroom, home office, living room, kitchen and bathroom.

The system uses temperature in Celsius. If the user requests Fahrenheit, you should convert the temperature to Fahrenheit.
```

### getRoomTemperature function

```json
{
  "name": "getRoomTemperature",
  "description": "Get the temperature in a room",
  "parameters": {
    "type": "object",
    "properties": {
      "room": {
        "type": "string",
        "enum": ["bedroom", "home office", "living room", "kitchen", "bathroom"]
      }
    },
    "required": ["room"]
  }
}
```

### setRoomTemperature function

```json
{
  "name": "setRoomTemperature",
  "description": "Set the temperature in a room",
  "parameters": {
    "type": "object",
    "properties": {
      "room": {
        "type": "string",
        "enum": ["bedroom", "home office", "living room", "kitchen", "bathroom"]
      },
      "temperature": { "type": "number" }
    },
    "required": ["room", "temperature"]
  }
}
```

## Run

1. Run `pnpm run dev` in `examples/next-openai`
2. Go to http://localhost:3000/assistant
