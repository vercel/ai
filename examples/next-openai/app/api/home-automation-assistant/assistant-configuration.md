### Home Automation Assistant

Enable Code interpreter. Add the following functions and instructions to the assistant.

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
    "required": ["location"]
  }
}
```

### setRooomTemperature function

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
    "required": ["location", "temperature"]
  }
}
```

### showRoomTemperatureToUser function

```json
{
  "name": "showRoomTemperatureToUser",
  "description": "Show the temperature in a room to the user",
  "parameters": {
    "type": "object",
    "properties": {
      "room": {
        "type": "string",
        "enum": ["bedroom", "home office", "living room", "kitchen", "bathroom"]
      },
      "temperature": { "type": "number" },
      "unit": {
        "type": "string",
        "enum": ["Celsius", "Fahrenheit"]
      }
    },
    "required": ["location", "temperature"]
  }
}
```
