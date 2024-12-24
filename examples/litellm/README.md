# AI SDK and LiteLLM Integration

This example explores using the AI SDK with an OpenAI compatible provider interfacing with LiteLLM.

Developers using LiteLLM with Anthropic, for example, may wish to use LiteLLM's support for forwarding cache control instructions along. See [LiteLLM Anthropic documentation](https://docs.litellm.ai/docs/providers/anthropic#prompt-caching) for more details.

## Local LiteLLM Proxy Setup

Following [LiteLLM documentation](https://docs.litellm.ai/docs/proxy/docker_quick_start) and assuming you have installed the litellm CLI with `pip install` per their instructions:

1. Start the Litellm proxy:

```
% export ANTHROPIC_API_KEY=<your key here>
% litellm --config ./litellm_config.yaml --detailed_debug
```

2. Test the proxy:

```
curl --location 'http://0.0.0.0:4000/chat/completions' \
--header 'Content-Type: application/json' \
--data ' {
      "model": "claude-3",
      "messages": [
        {
          "role": "user",
          "content": "what llm are you"
        }
      ]
    }
'
```

## Run the AI SDK example

Make sure you've set your `ANTHROPIC_API_KEY` in `../ai-core/.env`.

In another shell, run the AI SDK example:

```
% cd ../ai-core
% pnpm tsx src/generate-text/openai-compatible-litellm-anthropic-cache-control.ts
```

You should see the cache control instructions forwarded to Anthropic in the litellm server logs, and the cache creation (or cache hit) token usage in the response. Look for values under:

```
usage.prompt_tokens_details.cached_tokens
usage.cache_read_input_tokens
usage.cache_creation_input_tokens
```

Note this cache-specific token usage information is not yet available in the AI SDK. We plan to make it available in the response through the `experimental_providerMetadata` field in the future.
