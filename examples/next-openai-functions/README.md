# Chatbot with OpenAI and Weather API

This chatbot is built using OpenAI and the Weather API. It has two main functionalities:

1. If you ask the chatbot about the weather in Lima, it will call a function that makes a call to the Weather API to get the latest weather information in Lima.

2. For any other topic, the chatbot will respond according to the topic asked. However, please note that the chatbot does not support streams.

## Environment Variables

For this chatbot to function correctly, you need to set up the following environment variables in your `.env` file:

```bash
OPENAI_API_KEY=xxxx
WEATHER_API_KEY=xxxx
```

Replace `xxxx` with your actual keys. Here's a brief explanation of each variable:

- `OPENAI_API_KEY`: This is your OpenAI API key. You can obtain this key from the OpenAI's Developer Platform after signing up.
- `WEATHER_API_KEY`: This is your Weather API key. You can obtain this key from the Weather API's website after signing up.

Please note that this chatbot is primarily intended for testing and exploring the new function calling feature of OpenAI. As such, no particular attention has been given to the design aspect of the project.
