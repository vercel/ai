Auditing 61 models, 794 declared capability cells, 2295 SDK probe cases.
Mode: model documentation + live API probes.
MISSING    gpt-6.2-astra docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.2-astra docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-astra docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.2-astra docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/feature/fine_tuning: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.2-astra docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.2-astra docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-astra docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.2-astra docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-astra docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6.2-astra docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-astra docs/reasoningEfforts/none: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6.2-astra docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-astra live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-astra live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6.2-astra live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6.2-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/responses/sampling/logprobs/default: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.2-astra
UNVERIFIED gpt-6.2-astra live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6.2-astra live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
MATCH      gpt-6.2-astra live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.2-astra
MISMATCH   gpt-6.2-astra live/responses/flexProcessing: catalog=supported; AI_APICallError: This model does not support service_tier=flex. Use background=true with background_options.completion_window instead.
MATCH      gpt-6.2-astra live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-astra live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-astra live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.
MATCH      gpt-6.2-astra live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-astra live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6.2-astra live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-astra live/chat/function-calling: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.2-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
APICallError [AI_APICallError]: Function tools with reasoning_effort are not supported for gpt-6.2-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-6.2-astra',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 400,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbb283b938d630-IAD',
    connection: 'keep-alive',
    'content-length': '299',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:02:20 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '26',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=X_d7GLe4iwiUrVrFJTvi9wPyPAf6Qu9Ovq8aMGnxKBU-1795557740.11559-1.0.1.1-nWgtUe6PizYGLEq174nuRru8U7ai5MRib2CqOnOFwTZH2PDd74P3OeTThX6CCRRsdeEpYTanu8yEYYsziJriEGQCxAxhZeRmSDsSC6.yitdpw6UU2PmOGrgWL_t1hEXZ; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:32:20 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-requests': '120000',
    'x-ratelimit-limit-tokens': '500000000',
    'x-ratelimit-remaining-requests': '119999',
    'x-ratelimit-remaining-tokens': '499999991',
    'x-ratelimit-reset-requests': '0s',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_963bf35e010c41a991e438194154363f'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    `    "message": "Function tools with reasoning_effort are not supported for gpt-6.2-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",\n` +
    '    "type": "invalid_request_error",\n' +
    '    "param": "reasoning_effort",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: "Function tools with reasoning_effort are not supported for gpt-6.2-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
      type: 'invalid_request_error',
      param: 'reasoning_effort',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
MISMATCH   gpt-6.2-astra live/chat/tool-streaming: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.2-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6.2-astra live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-astra live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-astra live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-astra live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-astra live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-astra live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.2-astra live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.2-astra live/chat/sampling/logprobs/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6.2-astra live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-astra live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-astra live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-astra live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.2-astra live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.2-astra live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6.2-astra live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6.2-astra live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.2-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MISMATCH   gpt-6.2-astra live/chat/flexProcessing: catalog=supported; AI_APICallError: This model does not support service_tier=flex. Use background=true with background_options.completion_window instead.
MATCH      gpt-6.2-astra live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-astra live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.2-astra
MATCH      gpt-6.2-astra live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-astra live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-6.2-sol docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.2-sol docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-sol docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.2-sol docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/feature/fine_tuning: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.2-sol docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.2-sol docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.2-sol docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.2-sol docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-sol docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6.2-sol docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-sol docs/reasoningEfforts/none: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6.2-sol docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.2-sol live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-sol live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6.2-sol live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6.2-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/sampling/logprobs/default: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.2-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.2-sol
UNVERIFIED gpt-6.2-sol live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6.2-sol live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
MATCH      gpt-6.2-sol live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.2-sol
MISMATCH   gpt-6.2-sol live/responses/flexProcessing: catalog=supported; AI_APICallError: This model does not support service_tier=flex. Use background=true with background_options.completion_window instead.
MATCH      gpt-6.2-sol live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-sol live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-sol live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-sol live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6.2-sol live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-sol live/chat/function-calling: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.2-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
APICallError [AI_APICallError]: Function tools with reasoning_effort are not supported for gpt-6.2-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-6.2-sol',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 400,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbb3834b053450-IAD',
    connection: 'keep-alive',
    'content-length': '297',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:03:01 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '33',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=qdCi31Tbyrtwkzp3hFFGuhnYGbvkd_2.01Qp3xGOuGI-1795557781.0034857-1.0.1.1-ljCIT6ma2L4zudYtQg6XRZ1Hc07DZzEgnf4VFrWaiI2G0qYqadOnerfdbVaqVcQAw.ldsBQfZ8qcW_vCabZPoThk_imGUTwHWGi8MbvmIKoHQEzzNrLhcfbh5Bc1EYs0; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:33:01 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-requests': '120000',
    'x-ratelimit-limit-tokens': '500000000',
    'x-ratelimit-remaining-requests': '119999',
    'x-ratelimit-remaining-tokens': '499999991',
    'x-ratelimit-reset-requests': '0s',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_aabe89ab76a94d8eaba9bd133cee577f'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    `    "message": "Function tools with reasoning_effort are not supported for gpt-6.2-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",\n` +
    '    "type": "invalid_request_error",\n' +
    '    "param": "reasoning_effort",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: "Function tools with reasoning_effort are not supported for gpt-6.2-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
      type: 'invalid_request_error',
      param: 'reasoning_effort',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
MISMATCH   gpt-6.2-sol live/chat/tool-streaming: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.2-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6.2-sol live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-sol live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-sol live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.2-sol live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-sol live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-sol live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.2-sol live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.2-sol live/chat/sampling/logprobs/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6.2-sol live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-sol live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-sol live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.2-sol live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.2-sol live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.2-sol live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6.2-sol live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6.2-sol live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.2-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MISMATCH   gpt-6.2-sol live/chat/flexProcessing: catalog=supported; AI_APICallError: This model does not support service_tier=flex. Use background=true with background_options.completion_window instead.
MATCH      gpt-6.2-sol live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.2-sol live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.2-sol
MATCH      gpt-6.2-sol live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.2-sol live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-6-astra docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-astra docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-astra docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6-astra docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-astra docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6-astra docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-astra docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-astra docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-astra docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6-astra docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-astra docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-astra live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-astra live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6-astra live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6-astra live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6-astra live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/sampling/logprobs/default: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6-astra' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6-astra
UNVERIFIED gpt-6-astra live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6-astra live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
MATCH      gpt-6-astra live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-astra live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-astra live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-6-astra
MATCH      gpt-6-astra live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-astra live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6-astra live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-astra live/chat/function-calling: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
APICallError [AI_APICallError]: Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-6-astra',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 400,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbb4b92c682087-IAD',
    connection: 'keep-alive',
    'content-length': '297',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:03:50 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '15',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=aZFp.w6UEo6tZzOxvmqRbo_3qpMZJSWQHa0JisTIINM-1795557830.5851138-1.0.1.1-aj4is2Dat9ZlM8tK9vTRTfmR.51SqJhLE8hj5xzLmKwgpmcBbj5A2z1p_u6mELsOxYIwvnddj0Aapdhz7vcxD01KO21TLf4tFQhA1WIk1ATydujrsR33aYDsRF9Dmz4B; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:33:50 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-requests': '120000',
    'x-ratelimit-limit-tokens': '500000000',
    'x-ratelimit-remaining-requests': '119999',
    'x-ratelimit-remaining-tokens': '499999991',
    'x-ratelimit-reset-requests': '0s',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_f3d228a0e2f24796bcd2b0d245b74d4e'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    `    "message": "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",\n` +
    '    "type": "invalid_request_error",\n' +
    '    "param": "reasoning_effort",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
      type: 'invalid_request_error',
      param: 'reasoning_effort',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
MISMATCH   gpt-6-astra live/chat/tool-streaming: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6-astra live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-astra live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-astra live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-astra live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-astra live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6-astra live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6-astra live/chat/sampling/logprobs/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6-astra live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-astra live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-astra live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-astra live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6-astra live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6-astra live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6-astra live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6-astra live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6-astra live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-astra live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-astra live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6-astra
MATCH      gpt-6-astra live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-astra live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-6.1-sol docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.1-sol docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-sol docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.1-sol docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/feature/fine_tuning: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.1-sol docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.1-sol docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-sol docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.1-sol docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-sol docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6.1-sol docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-sol docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-sol live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-sol live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6.1-sol live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/sampling/logprobs/default: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are: 'low', 'medium', 'high', 'xhigh', and 'max'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-6.1-sol
UNVERIFIED gpt-6.1-sol live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6.1-sol live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
MATCH      gpt-6.1-sol live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=unsupported; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-sol live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-sol live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-sol live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6.1-sol live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-sol live/chat/function-calling: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
APICallError [AI_APICallError]: Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-6.1-sol',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 400,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbb5cbedca2796-IAD',
    connection: 'keep-alive',
    'content-length': '297',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:04:34 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '15',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=f8uHUpqTKTMmif75FHMP67A0mhd4NaTk7I0YuMRBLJU-1795557874.549174-1.0.1.1-S4X0lg2VXz8OsQIhsFwACmo04ctr4_.cxb8Q2FdWgev2ZdpKVw7Oes9ZSCfywAnsKIpcsJJuB1oW_XNacTeOBJ5vH3MiCJ1v35RnAIrGMeqi.fa6cHlm_iOPCVD5gFar; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:34:34 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-requests': '120000',
    'x-ratelimit-limit-tokens': '1000000000',
    'x-ratelimit-remaining-requests': '119999',
    'x-ratelimit-remaining-tokens': '1000000000',
    'x-ratelimit-reset-requests': '0s',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_d33993946f28404c87b089c2efdb8063'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    `    "message": "Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",\n` +
    '    "type": "invalid_request_error",\n' +
    '    "param": "reasoning_effort",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: "Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
      type: 'invalid_request_error',
      param: 'reasoning_effort',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
MISMATCH   gpt-6.1-sol live/chat/tool-streaming: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6.1-sol live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-sol live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-sol live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-sol live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-sol live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.1-sol live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.1-sol live/chat/sampling/logprobs/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6.1-sol live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-sol live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-sol live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-sol live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.1-sol live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.1-sol live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6.1-sol live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6.1-sol live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6.1-sol live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-sol live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-sol live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.1-sol
MATCH      gpt-6.1-sol live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-sol live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-6.1-terra docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.1-terra docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-terra docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.1-terra docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/feature/fine_tuning: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.1-terra docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-6.1-terra docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6.1-terra docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6.1-terra docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-terra docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6.1-terra docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-terra docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6.1-terra live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-terra live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6.1-terra live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6.1-terra' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-terra live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.1-terra
UNVERIFIED gpt-6.1-terra live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6.1-terra
UNVERIFIED gpt-6.1-terra live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.1-terra
MATCH      gpt-6.1-terra live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-terra live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6.1-terra live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6.1-terra live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6.1-terra
MATCH      gpt-6.1-terra live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-terra live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.1-terra
MATCH      gpt-6.1-terra live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-terra live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-6.1-terra
MATCH      gpt-6.1-terra live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-terra live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6.1-terra live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6.1-terra live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-terra live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-6.1-terra live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-6.1-terra live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-6.1-terra live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6.1-terra live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6.1-terra live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6.1-terra live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6.1-terra live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6.1-terra live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6.1-terra live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6.1-terra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
UNVERIFIED gpt-6.1-terra live/chat/flexProcessing: catalog=supported; AI_APICallError: Flex does not have sufficient resources available to fulfill your request. You can try again later in case more resources are available, or change service_tier=default. Visit the docs at https://platform.openai.com/docs/guides/flex-processing to learn more.
MATCH      gpt-6.1-terra live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6.1-terra live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6.1-terra
MATCH      gpt-6.1-terra live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6.1-terra live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-6-luna docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-luna docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-luna docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6-luna docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-luna docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6-luna docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-luna docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-luna docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-luna docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6-luna docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-luna docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-luna live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-luna live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6-luna live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6-luna' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6-luna live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-luna live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6-luna
UNVERIFIED gpt-6-luna live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6-luna
UNVERIFIED gpt-6-luna live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6-luna
MATCH      gpt-6-luna live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-luna live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6-luna live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6-luna live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6-luna
MATCH      gpt-6-luna live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-luna live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6-luna
MATCH      gpt-6-luna live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-luna live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-6-luna
MATCH      gpt-6-luna live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-luna live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6-luna live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-luna live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-luna live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-6-luna live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-6-luna live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-6-luna live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6-luna live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-luna live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6-luna live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6-luna live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6-luna live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6-luna live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
UNVERIFIED gpt-6-luna live/chat/flexProcessing: catalog=supported; AI_APICallError: Flex does not have sufficient resources available to fulfill your request. You can try again later in case more resources are available, or change service_tier=default. Visit the docs at https://platform.openai.com/docs/guides/flex-processing to learn more.
MATCH      gpt-6-luna live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-luna live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6-luna
MATCH      gpt-6-luna live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-luna live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-6-sol docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-sol docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-sol docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-6-sol docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-sol docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-6-sol docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-6-sol docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-6-sol docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-sol docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-6-sol docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-sol docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-6-sol live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-sol live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-6-sol live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-6-sol' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-6-sol live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-sol live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6-sol
UNVERIFIED gpt-6-sol live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-6-sol
UNVERIFIED gpt-6-sol live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6-sol
MATCH      gpt-6-sol live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-sol live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6-sol live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-6-sol live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.; SDK encoding policy=gpt-5.6, API target=gpt-6-sol
MATCH      gpt-6-sol live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-sol live/responses/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6-sol
MATCH      gpt-6-sol live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/responses/configurationUpdates/request: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-sol live/responses/configurationUpdates/message: catalog=supported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-6-sol
MATCH      gpt-6-sol live/responses/asyncTools: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-sol live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-6-sol live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-6-sol live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-sol live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-6-sol live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-6-sol live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-6-sol live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-6-sol live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-6-sol live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-6-sol live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-6-sol live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-6-sol live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-6-sol live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-6-sol live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-6-sol live/chat/promptCacheRetention: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-5.6, API target=gpt-6-sol
MATCH      gpt-6-sol live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-6-sol live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
UNVERIFIED gpt-5.6 docs: Error: Expected Model ID gpt-5.6; found gpt-5.6-sol
MATCH      gpt-5.6 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.6 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.6' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-5.6 live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6 live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6
UNVERIFIED gpt-5.6 live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6
UNVERIFIED gpt-5.6 live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6 live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6 live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6 live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6 live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6 live/responses/configurationUpdates/request: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6
UNVERIFIED gpt-5.6 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6
MATCH      gpt-5.6 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.6.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6
MATCH      gpt-5.6 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.6 live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.6 live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6 live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.6 live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-5.6 live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5.6 live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-5.6 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.6 live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.6 live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.6 live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5.6 live/chat/chatFunctionToolsWithReasoning: catalog=unsupported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.6 in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.6 live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6 live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6 live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.6-luna docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-luna docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-luna docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-luna docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-luna docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-luna docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-luna docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.6-luna docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-luna docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-luna live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-luna live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.6-luna live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.6-luna' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-luna live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6-luna
UNVERIFIED gpt-5.6-luna live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6-luna
UNVERIFIED gpt-5.6-luna live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6-luna live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-luna live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6-luna live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6-luna live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6-luna live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6-luna live/responses/configurationUpdates/request: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-luna
UNVERIFIED gpt-5.6-luna live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-luna
MATCH      gpt-5.6-luna live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.6-luna.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-luna
MATCH      gpt-5.6-luna live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-luna live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.6-luna live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.6-luna live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6-luna live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.6-luna live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-5.6-luna live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5.6-luna live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-5.6-luna live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.6-luna live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.6-luna live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.6-luna live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5.6-luna live/chat/chatFunctionToolsWithReasoning: catalog=unsupported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.6-luna live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-luna live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-luna live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.6-sol docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-sol docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-sol docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-sol docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-sol docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-sol docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-sol docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.6-sol docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-sol docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-sol live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-sol live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.6-sol live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.6-sol' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-sol live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6-sol
UNVERIFIED gpt-5.6-sol live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6-sol
UNVERIFIED gpt-5.6-sol live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6-sol live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-sol live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6-sol live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6-sol live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6-sol live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6-sol live/responses/configurationUpdates/request: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-sol
UNVERIFIED gpt-5.6-sol live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-sol
MATCH      gpt-5.6-sol live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.6-sol.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-sol
MATCH      gpt-5.6-sol live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-sol live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.6-sol live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.6-sol live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6-sol live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.6-sol live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-5.6-sol live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5.6-sol live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-5.6-sol live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.6-sol live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.6-sol live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.6-sol live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5.6-sol live/chat/chatFunctionToolsWithReasoning: catalog=unsupported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.6-sol live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-sol live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-sol live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.6-terra docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-terra docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-terra docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-terra docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.6-terra docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.6-terra docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-terra docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.6-terra docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-terra docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.6-terra live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-terra live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.6-terra live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.6-terra' model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', and 'max'.
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/reasoningEfforts/max: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-terra live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6-terra
UNVERIFIED gpt-5.6-terra live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.6-terra
UNVERIFIED gpt-5.6-terra live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6-terra live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-terra live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6-terra live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.6-terra live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.6-terra live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/responses/promptCacheOptions/12h: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6-terra live/responses/configurationUpdates/request: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-terra
UNVERIFIED gpt-5.6-terra live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-terra
MATCH      gpt-5.6-terra live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.6-terra.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.6-terra
MATCH      gpt-5.6-terra live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-terra live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.6-terra live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.6-terra live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.6-terra live/chat/reasoningEfforts/max: catalog=supported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.6-terra live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-5.6-terra live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5.6-terra live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-5.6-terra live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.6-terra live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.6-terra live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.6-terra live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5.6-terra live/chat/chatFunctionToolsWithReasoning: catalog=unsupported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.6-terra live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.6-terra live/chat/promptCacheOptions/30m: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.6-terra live/chat/promptCacheOptions/12h: catalog=supported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.5 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.5 docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.5 docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.5 docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.5 docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.5 docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.5 docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.5 docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.5 docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.5 docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.5 docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.5 docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.5 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.5 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.5 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.5' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.5 live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.5' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.5 live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.5
UNVERIFIED gpt-5.5 live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.5
UNVERIFIED gpt-5.5 live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.5 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.5 live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.5 live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.5 live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.5 live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.5 live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.5 live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.5
UNVERIFIED gpt-5.5 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.5
MATCH      gpt-5.5 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.5.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.5
MATCH      gpt-5.5 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.5 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.5 live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.5 live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.5 live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
UNVERIFIED gpt-5.5 live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5.5 live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
MATCH      gpt-5.5 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.5 live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.5 live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.5 live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-5.5 live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.5 in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.5 live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.5 live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5.5 live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.4-pro docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-pro docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-pro docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/feature/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/feature/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-pro docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-pro docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-pro docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-pro docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.4-pro docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-pro docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-pro live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-pro live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.4-pro live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-pro live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-pro live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported value: 'low' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-pro live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-pro live/responses/reasoningEfforts/high: catalog=supported; TimeoutError: The operation was aborted due to timeout
UNVERIFIED gpt-5.4-pro live/responses/reasoningEfforts/xhigh: catalog=supported; TimeoutError: The operation was aborted due to timeout
MATCH      gpt-5.4-pro live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-pro live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4-pro
MATCH      gpt-5.4-pro live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4-pro
UNVERIFIED gpt-5.4-pro live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.4-pro live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.4-pro
MATCH      gpt-5.4-pro live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.4-pro
MATCH      gpt-5.4-pro live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.4-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4-pro live/responses/sampling/temperature/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4-pro live/responses/sampling/topP/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4-pro live/responses/responsesLogprobsRequireNonReasoning/logprobs/medium: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
UNVERIFIED gpt-5.4-pro live/responses/flexProcessing: catalog=supported; AI_APICallError: Flex is not available for this model.
MATCH      gpt-5.4-pro live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-pro live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4-pro live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4-pro live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-pro
UNVERIFIED gpt-5.4-pro live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-pro
MATCH      gpt-5.4-pro live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.4-pro.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-pro
UNVERIFIED gpt-5.4-pro live/chat/baseline: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/image-input: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/audio-input: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/structured-output: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/function-calling: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
APICallError [AI_APICallError]: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.4-pro',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbc746bf3c14bc-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:16:30 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '7',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=WkU5fLq_nnn9tCRDWfgm8ezE4F5P6b2yhMj5h9v743E-1795558590.519676-1.0.1.1-2LCMTYG2y0x3iVtLrpvKbmpCGyBXTgg8jJ7.JC6z5qcTMNTCv_B5jO8YKgG.x2GbfRucASypObUmxXCNsmM1RXTwfZTrd0fvxE0Di7l2r9EqXldOMexv8nSdhVPMcXoo; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:46:30 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-requests': '1500',
    'x-ratelimit-limit-tokens': '4000000',
    'x-ratelimit-remaining-requests': '1499',
    'x-ratelimit-remaining-tokens': '3999991',
    'x-ratelimit-reset-requests': '40ms',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_7fdc2a59c77e4df0baa6ca1429182f5c'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": "model",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?',
      type: 'invalid_request_error',
      param: 'model',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.4-pro live/chat/tool-streaming: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoning: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/high: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/xhigh: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5.4-pro live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5.4-pro live/chat/sampling/temperature/medium: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/sampling/topP/medium: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/sampling/logprobs/medium: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5.4-pro live/chat/chatTemperature: catalog="unknown"; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/flexProcessing: catalog=supported; AI_APICallError: Flex is not available for this model.
UNVERIFIED gpt-5.4-pro live/chat/priorityProcessing: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/promptCacheRetention: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.4-pro live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.4 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4 docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4 docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4 docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4 docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4 docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4 docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4 docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4 docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4 docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.4 docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4 docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.4 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.4' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4 live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.4' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4 live/responses/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4
UNVERIFIED gpt-5.4 live/responses/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4
UNVERIFIED gpt-5.4 live/responses/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4 live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4 live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4 live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.4 live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4 live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4 live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4
UNVERIFIED gpt-5.4 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4
MATCH      gpt-5.4 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.4.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4
MATCH      gpt-5.4 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.4 live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4 live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4 live/chat/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.4 live/chat/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.4 live/chat/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.4 live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.4 live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.4 live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-5.4 live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.4 in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.4 live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4 live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5.4 live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.4-mini docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/tool_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/computer_use: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-mini docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.4-mini docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-mini docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-mini live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-mini live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.4-mini live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.4-mini' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.4-mini' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4-mini live/responses/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4-mini
UNVERIFIED gpt-5.4-mini live/responses/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4-mini
UNVERIFIED gpt-5.4-mini live/responses/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-mini live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4-mini live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4-mini live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.4-mini live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4-mini live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4-mini live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-mini
UNVERIFIED gpt-5.4-mini live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-mini
MATCH      gpt-5.4-mini live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.4-mini.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-mini
MATCH      gpt-5.4-mini live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-mini live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.4-mini live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4-mini live/chat/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-mini live/chat/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-mini live/chat/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.4-mini live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.4-mini live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.4-mini live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-5.4-mini live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.4-mini in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.4-mini live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-mini live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5.4-mini live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.4-nano docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.4-nano docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.4-nano docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-nano docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.4-nano live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-nano live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.4-nano live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.4-nano' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.4-nano' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4-nano live/responses/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4-nano
UNVERIFIED gpt-5.4-nano live/responses/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.4-nano
UNVERIFIED gpt-5.4-nano live/responses/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-nano live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4-nano live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.4-nano live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.4-nano live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.4-nano live/responses/priorityProcessing: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-nano
MATCH      gpt-5.4-nano live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4-nano live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.4-nano live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-nano
UNVERIFIED gpt-5.4-nano live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-nano
MATCH      gpt-5.4-nano live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.4-nano.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-nano
MATCH      gpt-5.4-nano live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-nano live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.4-nano live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.4-nano live/chat/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-nano live/chat/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.4-nano live/chat/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.4-nano live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.4-nano live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.4-nano live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MISMATCH   gpt-5.4-nano live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: Function tools with reasoning_effort are not supported for gpt-5.4-nano in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.
MATCH      gpt-5.4-nano live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5.4-nano live/chat/priorityProcessing: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.4-nano
MATCH      gpt-5.4-nano live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.4-nano live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5.4-nano live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MATCH      gpt-5.3-chat-latest docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.3-chat-latest docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.3-chat-latest docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.3-chat-latest docs/feature/image_input: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.3-chat-latest docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.3-chat-latest docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.3-chat-latest docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.3-chat-latest docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.3-chat-latest docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.3-chat-latest docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.3-chat-latest docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.3-chat-latest docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-5.3-chat-latest docs/language.reasoning.support: catalog=supported, OpenAI docs=not declared
MATCH      gpt-5.3-chat-latest docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5.3-chat-latest live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5.3-chat-latest live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5.3-chat-latest',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbc9ad79c314bc-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:18:09 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '111',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=pj_r4poI9W9Ik4nZAHNpkvv4PtLB_bKf_ZkA3GWgoZk-1795558688.8752093-1.0.1.1-rKLIs4OoJs3oVaPqrPl1VnPxABOtF9.KXq8_fC11_M8Dwj8Mc_vH3aaAYh9UuMGa0b4ov7f8gqSWpdoaEMGrSos0Gll5O9ueOBX6JYJ_cwD8TybxPtlNDC0ltWBlC0np; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:48:09 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_bc64caebacd049279911d10d8f2faa0a'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": null,\n' +
    '    "code": "model_not_found"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.3-chat-latest live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/sampling/temperature/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.3-chat-latest live/responses/sampling/topP/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.3-chat-latest live/responses/responsesLogprobsRequireNonReasoning/logprobs/medium: catalog="unknown"; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.3-chat-latest live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.3-chat-latest
UNVERIFIED gpt-5.3-chat-latest live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.3-chat-latest',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbc9c6ed2614bc-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:18:12 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=IzVIU8JVZltkPX5_vsCTeXri76tKLg.qE.L8TqKaUkk-1795558692.9488862-1.0.1.1-4WBT_VgUvJHSJl7rTNafn5a6rSMj_63L0puvk0uKkJTF1MwJbq6rTS1alncXEURSr9E2n0b..crrw43L6rh4h3l8EIDFaYb6i0cJvjZNg2Z47p9jWIuxeZt5R.Q1i7eF; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:48:12 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_165ed29a6252478a9e274eebb389b16c'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.3-chat-latest live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/sampling/temperature/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/sampling/topP/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/sampling/logprobs/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/chatTemperature: catalog="unknown"; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.3-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.3-chat-latest live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.2-pro docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2-pro docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2-pro docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/feature/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/feature/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2-pro docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-pro docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2-pro docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2-pro docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.2-pro docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2-pro docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2-pro live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.2-pro live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.2-pro live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported value: 'low' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.2-pro live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.2-pro
MATCH      gpt-5.2-pro live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.2-pro
UNVERIFIED gpt-5.2-pro live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.2-pro live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.2-pro
MATCH      gpt-5.2-pro live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.2-pro
MATCH      gpt-5.2-pro live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5.2-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.2-pro live/responses/sampling/temperature/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.2-pro live/responses/sampling/topP/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.2-pro live/responses/responsesLogprobsRequireNonReasoning/logprobs/medium: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
UNVERIFIED gpt-5.2-pro live/responses/flexProcessing: catalog=supported; AI_APICallError: Flex tier does not have sufficient resources available to fulfill your request. You can try again later in case more resources are available, or change service_tier=default. Visit the docs at https://platform.openai.com/docs/guides/flex-processing to learn more.
MATCH      gpt-5.2-pro live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2-pro live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.2-pro live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.2-pro live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2-pro
UNVERIFIED gpt-5.2-pro live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2-pro
MATCH      gpt-5.2-pro live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.2-pro.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2-pro
UNVERIFIED gpt-5.2-pro live/chat/baseline: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/image-input: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/audio-input: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/structured-output: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/function-calling: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
APICallError [AI_APICallError]: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.2-pro',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbcb720ce505ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:19:21 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '9',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=RIn76txId8YfIJ0T0FFn5lzOplRSYkux1gStXPBEICU-1795558761.2833545-1.0.1.1-iGfD2MTzgDmMpZDUwzkKWCMUVCjcO74Okw7tHZMXbcgqygbP.zR8j1r4o8DpJH8P2H3PPEg8z81dNz3WpAGL6FvlzVR5.XPHsA6tcQZe1PJI_rpmWnfBn7F3kzDluUFw; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:49:21 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-requests': '1500',
    'x-ratelimit-limit-tokens': '4000000',
    'x-ratelimit-remaining-requests': '1499',
    'x-ratelimit-remaining-tokens': '3999991',
    'x-ratelimit-reset-requests': '40ms',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_54e556cdae614a1abb04a15d157cf496'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": "model",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?',
      type: 'invalid_request_error',
      param: 'model',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.2-pro live/chat/tool-streaming: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoning: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/high: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/xhigh: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/sampling/temperature/medium: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/sampling/topP/medium: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/sampling/logprobs/medium: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/chatTemperature: catalog="unknown"; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/flexProcessing: catalog=supported; AI_APICallError: Flex tier does not have sufficient resources available to fulfill your request. You can try again later in case more resources are available, or change service_tier=default. Visit the docs at https://platform.openai.com/docs/guides/flex-processing to learn more.
UNVERIFIED gpt-5.2-pro live/chat/priorityProcessing: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/promptCacheRetention: catalog=supported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?
UNVERIFIED gpt-5.2-pro live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MATCH      gpt-5.2-chat-latest docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2-chat-latest docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2-chat-latest docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2-chat-latest docs/feature/image_input: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2-chat-latest docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2-chat-latest docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-chat-latest docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-chat-latest docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-chat-latest docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2-chat-latest docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2-chat-latest docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2-chat-latest docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-5.2-chat-latest docs/language.reasoning.support: catalog=supported, OpenAI docs=not declared
MATCH      gpt-5.2-chat-latest docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5.2-chat-latest live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5.2-chat-latest live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5.2-chat-latest',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbcb86787305ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:19:24 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '93',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=vkHon1Vi6O9_6GUTyV6WuKxVnB562DNoPuk9zF_1xvM-1795558764.5528848-1.0.1.1-75_uG5Bgf1Mvgo5vY4dx3WtfrhW7c0Ek7CfAeYIZo1Lir5RezzLDEKQ75KQPVh8o7ztxKVSqEaHacMOlK.uwx1qWyOFWsRVQhPfQKVFiutSyLN3w_TetguJ7hC6jbqzD; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:49:24 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_447cdbddfd15406fb2a4aaa944e34e68'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "code": "model_not_found",\n' +
    '    "message": "The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.",\n' +
    '    "param": null,\n' +
    '    "type": "invalid_request_error"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.2-chat-latest live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/sampling/temperature/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.2-chat-latest live/responses/sampling/topP/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.2-chat-latest live/responses/responsesLogprobsRequireNonReasoning/logprobs/medium: catalog="unknown"; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.2-chat-latest live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2-chat-latest
UNVERIFIED gpt-5.2-chat-latest live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.2-chat-latest',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbcb9efb9305ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:19:28 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=EHatqwCF5iD07Lx5xmefOWo9kjmGM5mEI8pvgbQZpIU-1795558768.472581-1.0.1.1-D1DnUDW533lP4jO4DNxBJsnA7O7bqHzixA5usbH5hgTYauoqJB92PiJtkMYoOcjSrVlsQtUkS_Z2Km.9cCUkOCppU1FY7QKJ40wzU4eNEFTUTFB.DxxzoaEPJ.dErf.0; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:49:28 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_58603bcd75594a0fb1fc6178440b0696'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.2-chat-latest live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/sampling/temperature/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/sampling/topP/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/sampling/logprobs/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/chatTemperature: catalog="unknown"; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.2-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.2-chat-latest live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.2 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2 docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2 docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2 docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2 docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2 docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2 docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/hosted_shell: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/skills: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.2 docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.2 docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2 docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.2 docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2 docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.2 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.2 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.2 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.2' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.2 live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.2' model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.2 live/responses/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.2
UNVERIFIED gpt-5.2 live/responses/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.2
UNVERIFIED gpt-5.2 live/responses/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.2 live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.2 live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.2 live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.2 live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.2 live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.2 live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2
UNVERIFIED gpt-5.2 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2
MATCH      gpt-5.2 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.2.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.2
MATCH      gpt-5.2 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.2 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.2 live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
MATCH      gpt-5.2 live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoningEfforts/xhigh: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
UNVERIFIED gpt-5.2 live/chat/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.2 live/chat/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.2 live/chat/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.2 live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.2 live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.2 live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5.2 live/chat/chatFunctionToolsWithReasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.2 live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5.2 live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.1-codex-mini docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1-codex-mini docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-codex-mini docs/feature/evals: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-codex-mini docs/feature/stored_completions: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1-codex-mini docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.1-codex-mini docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex-mini docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5.1-codex-mini live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5.1-codex-mini live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5.1-codex-mini',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    reasoning: { effort: 'none' },
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbcc896db505ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:20:06 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '118',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=mnU3dJUFBRgOQw8hUvpek8T5dudBUOmwkoC8MFAaQu8-1795558805.983131-1.0.1.1-JK0NjOGvVynZlOhpa_DE7cVqMEE2bPGHAc7aey47PXphhoPwBT7y.VcfK3Jg11Z7RA7h2wPdMXEdrm7RFSn8SFXD3hYPpLYc84hMZGfqoE9vIGeIPaiMW0Pgtn_04o6H; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:50:06 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_49cab116d0a34207b26db81a816468e4'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": null,\n' +
    '    "code": "model_not_found"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.1-codex-mini live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/low: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/high: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1-codex-mini
UNVERIFIED gpt-5.1-codex-mini live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1-codex-mini
UNVERIFIED gpt-5.1-codex-mini live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1-codex-mini live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1-codex-mini live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex-mini live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-codex-mini
UNVERIFIED gpt-5.1-codex-mini live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-codex-mini
UNVERIFIED gpt-5.1-codex-mini live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-codex-mini
UNVERIFIED gpt-5.1-codex-mini live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.1-codex-mini',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: 'none',
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbcca34b4505ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:20:10 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=5bWy1GhRXnDhFpdD78JyNoaVBoyDLl.eJ8qEFTY.gsw-1795558810.1327229-1.0.1.1-eGrSGh4edUbwWdif3BCep9.sOXUNf6e6VvNYR5trBxD7R3LXH7.apK9J2Oz4x3kBzD1E1XhP.WoCdBU_6B8XDo_rgZlXNEP9Zza8pbhntUMqv.eFtLWtJ4XP7jXzGm4w; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:50:10 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_63ac3ed1006d4a8ab26e72b5373f2b20'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.1-codex-mini live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/low: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/high: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/chatTemperature: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex-mini` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex-mini live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.1-codex docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1-codex docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-codex docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1-codex docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.1-codex docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-codex docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5.1-codex live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5.1-codex live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5.1-codex` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5.1-codex',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    reasoning: { effort: 'none' },
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbccb3ee8f05ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:20:12 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '98',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=GQnIBMAKqnoSxU6Efs52gwvKGK.SiT2eQhgPEvRK73A-1795558812.7887247-1.0.1.1-_MZfTHgdaH71ymNpMKbbKMqfIn0JQ475NSrdArM0EMbfbfAUUtBezdVNRvTF9LM29vZ8Nq2d7BZo6MtQ8HbulXZIFYOw4r4l4wBf6cmHuZAswvUyuMnh_IIOOxUB3ZY0; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:50:12 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_9d325178c5d94845981ce1eaa633722b'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "The model `gpt-5.1-codex` does not exist or you do not have access to it.",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": null,\n' +
    '    "code": "model_not_found"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.1-codex` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.1-codex live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/low: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/high: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/sampling/temperature/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1-codex
UNVERIFIED gpt-5.1-codex live/responses/sampling/topP/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1-codex
UNVERIFIED gpt-5.1-codex live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1-codex live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1-codex live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-codex live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-codex
UNVERIFIED gpt-5.1-codex live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-codex
UNVERIFIED gpt-5.1-codex live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-codex
UNVERIFIED gpt-5.1-codex live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.1-codex',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: 'none',
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbcccc3f9805ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:20:16 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=Li6YymoAF9SNzNQ5hBzVyUfdJr7GnJHAjzxQFaf9AYo-1795558816.6796174-1.0.1.1-v2kNqYgNVyPwGCbsbaQZnJ.UhuoBuf73hEsO3MF_aKY6EyWG49b2tjf5O3lFpeQkVr_wVHNlKyE5agEu5EF6iC77p_ZNAfznDVXwZiswEjcaVukUVWYXDkb1zhdOFbaR; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:50:16 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_bb4dd075b78747deb0d74c4af7beb511'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.1-codex live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/low: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/high: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/sampling/temperature/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/sampling/topP/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/chatTemperature: catalog="unknown"; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.1-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-codex live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MATCH      gpt-5.1-chat-latest docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-chat-latest docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1-chat-latest docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-chat-latest docs/feature/image_input: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-chat-latest docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1-chat-latest docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-chat-latest docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-chat-latest docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-chat-latest docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1-chat-latest docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1-chat-latest docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1-chat-latest docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-5.1-chat-latest docs/language.reasoning.support: catalog=supported, OpenAI docs=not declared
MATCH      gpt-5.1-chat-latest docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5.1-chat-latest live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5.1-chat-latest live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5.1-chat-latest',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbccdb8a4805ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:20:19 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '68',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=fBoUX.8SZIyNAgAr6xnxDEeLCP6qT5OPYLazUYI07X4-1795558819.1221955-1.0.1.1-D3c8QdON1ikx7Hd32NYzDB8xKEf1cwasfweco9dmnrySoi11LiTTZvgzDAOtDZhppIHcPXqfFi3jl7HrJPsmkUn6_Dwozl5gEp_edopbVd2_8czsoC0hFjtKN_ezPp31; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:50:19 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_55b3710402c34fb78ad14cbec88009c2'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "code": "model_not_found",\n' +
    '    "message": "The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.",\n' +
    '    "param": null,\n' +
    '    "type": "invalid_request_error"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.1-chat-latest live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/sampling/temperature/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1-chat-latest live/responses/sampling/topP/medium: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1-chat-latest live/responses/responsesLogprobsRequireNonReasoning/logprobs/medium: catalog="unknown"; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5.1-chat-latest live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1-chat-latest
UNVERIFIED gpt-5.1-chat-latest live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5.1-chat-latest',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbccfc7a4405ef-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:20:24 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=ULEU8WxJSgwpFpZVtYBgFo0vdpSqElNnPHtZHqr2Aqo-1795558824.397056-1.0.1.1-gXmqZU2RDQlxxP6LykM8T5gw1BMwZe4HGVDfgGKQLXZxUCVrofCjqEDQgGAh4auxoPsjnuwT3Ot0Oeur5sFM4FMkZC2qKY08VbrQ8hWw0xMwjdaPpNqtYmop9YTM407u; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:50:24 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_e3694ba8e8024682b5f0fadce893791a'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5.1-chat-latest live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/sampling/temperature/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/sampling/topP/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/sampling/logprobs/medium: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/chatTemperature: catalog="unknown"; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5.1-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5.1-chat-latest live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5.1 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1 docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1 docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1 docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1 docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1 docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1 docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5.1 docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/tool/apply_patch: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5.1 docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5.1 docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1 docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5.1 docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1 docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5.1 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.1 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5.1 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5.1' model. Supported values are: 'none', 'low', 'medium', and 'high'.
MATCH      gpt-5.1 live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'xhigh' is not supported with the 'gpt-5.1' model. Supported values are: 'none', 'low', 'medium', and 'high'.
MATCH      gpt-5.1 live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5.1' model. Supported values are: 'none', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5.1 live/responses/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1
UNVERIFIED gpt-5.1 live/responses/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5.1
UNVERIFIED gpt-5.1 live/responses/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.1 live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1 live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5.1 live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5.1 live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.1 live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5.1 live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1
UNVERIFIED gpt-5.1 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1
MATCH      gpt-5.1 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.1.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5.1
MATCH      gpt-5.1 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5.1 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5.1 live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/reasoningEfforts/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'minimal' with this model. Supported values are: 'none', 'low', 'medium', and 'high'.
MATCH      gpt-5.1 live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'xhigh' with this model. Supported values are: 'none', 'low', 'medium', and 'high'.
MATCH      gpt-5.1 live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'none', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5.1 live/chat/sampling/temperature/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.1 live/chat/sampling/topP/default: catalog="unknown"; API=accepted; expected output=observed
UNVERIFIED gpt-5.1 live/chat/sampling/logprobs/default: catalog="unknown"; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5.1 live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
MATCH      gpt-5.1 live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'logprobs' is not supported with this model.
UNVERIFIED gpt-5.1 live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5.1 live/chat/chatFunctionToolsWithReasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5.1 live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5.1 live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5-pro docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-pro docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-pro docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-pro docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-pro docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-pro docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-pro docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-pro docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-pro docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-pro docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-pro docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-pro docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-pro docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-pro docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5-pro docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-pro docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-pro live/responses/baseline: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5-pro live/responses/image-input: catalog=supported; AI_APICallError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 9315, Requested 2581. Please try again in 11.376s. Visit https://platform.openai.com/account/rate-limits to learn more.
UNVERIFIED gpt-5-pro live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5-pro live/responses/structured-output: catalog=supported; AI_APICallError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 8526, Requested 3559. Please try again in 12.51s. Visit https://platform.openai.com/account/rate-limits to learn more.
UNVERIFIED gpt-5-pro live/responses/function-calling: catalog=supported; AI_APICallError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 9453, Requested 3023. Please try again in 14.856s. Visit https://platform.openai.com/account/rate-limits to learn more.
StreamProviderError [AI_StreamProviderError]: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 8352, Requested 3110. Please try again in 8.772s. Visit https://platform.openai.com/account/rate-limits to learn more.
    at normalizeStreamProviderError (/Users/aayushkapoor/Desktop/ai/packages/ai/src/prompt/normalize-stream-provider-error.ts:53:10)
    at Object.transform (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:527:20)
    at invokePromiseCallback (node:internal/webstreams/util:172:10)
    at Object.transformAlgorithm (node:internal/webstreams/util:177:23)
    at transformStreamDefaultControllerPerformTransform (node:internal/webstreams/transformstream:527:37)
    at transformStreamDefaultSinkWriteAlgorithm (node:internal/webstreams/transformstream:573:10)
    at node:internal/webstreams/transformstream:378:16
    at writableStreamDefaultControllerProcessWrite (node:internal/webstreams/writablestream:1139:5)
    at writableStreamDefaultControllerAdvanceQueueIfNeeded (node:internal/webstreams/writablestream:1265:5)
    at writableStreamDefaultControllerWrite (node:internal/webstreams/writablestream:1128:3) {
  cause: undefined,
  type: 'input-tokens',
  code: 'rate_limit_exceeded',
  statusCode: 429,
  isRetryable: true,
  data: {
    type: 'error',
    sequence_number: 7,
    error: {
      type: 'input-tokens',
      code: 'rate_limit_exceeded',
      message: 'Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 8352, Requested 3110. Please try again in 8.772s. Visit https://platform.openai.com/account/rate-limits to learn more.',
      param: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_StreamProviderError): true
}
UNVERIFIED gpt-5-pro live/responses/tool-streaming: catalog=supported; AI_StreamProviderError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 8352, Requested 3110. Please try again in 8.772s. Visit https://platform.openai.com/account/rate-limits to learn more.
ToolChoiceViolationError [AI_ToolChoiceViolationError]: Model response did not contain a tool call even though tool choice was required.
    at Object.transform (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:727:17)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async transformStreamDefaultControllerPerformTransform (node:internal/webstreams/transformstream:527:12) {
  cause: undefined,
  toolChoice: { type: 'required' },
  finishReason: 'error',
  provider: 'openai.responses',
  modelId: 'gpt-5-pro',
  content: [ { type: 'reasoning', text: '', providerMetadata: [Object] } ],
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_ToolChoiceViolationError): true
}
MATCH      gpt-5-pro live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-pro live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
MATCH      gpt-5-pro live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'minimal' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
MATCH      gpt-5-pro live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported value: 'low' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
MATCH      gpt-5-pro live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unsupported value: 'medium' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
UNVERIFIED gpt-5-pro live/responses/reasoningEfforts/high: catalog=supported; AI_APICallError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 9809, Requested 2078. Please try again in 11.322s. Visit https://platform.openai.com/account/rate-limits to learn more.
MATCH      gpt-5-pro live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'xhigh' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
MATCH      gpt-5-pro live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
MATCH      gpt-5-pro live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-pro
MATCH      gpt-5-pro live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-pro
UNVERIFIED gpt-5-pro live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5-pro live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-pro
MATCH      gpt-5-pro live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-pro
MATCH      gpt-5-pro live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-pro' model. Supported values are: 'high'.
UNVERIFIED gpt-5-pro live/responses/sampling/temperature/high: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-pro live/responses/sampling/topP/high: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-pro live/responses/responsesLogprobsRequireNonReasoning/logprobs/high: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
UNVERIFIED gpt-5-pro live/responses/flexProcessing: catalog=supported; AI_APICallError: Flex is not available for this model.
UNVERIFIED gpt-5-pro live/responses/priorityProcessing: catalog=supported; AI_APICallError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 9806, Requested 2001. Please try again in 10.842s. Visit https://platform.openai.com/account/rate-limits to learn more.
UNVERIFIED gpt-5-pro live/responses/promptCacheRetention: catalog=supported; AI_APICallError: Rate limit reached for gpt-5-pro in organization org-H4rXXVPnjiiAOZjYSgMHcsAu on input-tokens per min: Limit 10000, Used 9488, Requested 1978. Please try again in 8.796s. Visit https://platform.openai.com/account/rate-limits to learn more.
MATCH      gpt-5-pro live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5-pro live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5-pro live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-pro
UNVERIFIED gpt-5-pro live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-pro
MATCH      gpt-5-pro live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5-pro.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-pro
UNVERIFIED gpt-5-pro live/chat/baseline: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/image-input: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/audio-input: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/structured-output: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/function-calling: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
APICallError [AI_APICallError]: This model is only supported in v1/responses and not in v1/chat/completions.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5-pro',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd3f8dd408b95-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:25:10 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '12',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=fLzLptcfRCNFJPxBYwJ4GopioLB53xFece08h4R_LDo-1795559110.5368197-1.0.1.1-Rh90YLHAokBvaHLQhCTtWqivlWJIaa1eX5heQAAv5dnUMHvZpGuYLk.DbLbIwbQ9u3IXlj9j3xQ7yqg_EnqRUEOBAjkiPkUrGZzgpAZ58Fhp_Fv80gLWAZ1p9Rsh8pDA; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:55:10 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-ratelimit-limit-input-tokens': '10000',
    'x-ratelimit-limit-requests': '20000',
    'x-ratelimit-limit-tokens': '150000000',
    'x-ratelimit-remaining-input-tokens': '1768',
    'x-ratelimit-remaining-requests': '19999',
    'x-ratelimit-remaining-tokens': '149999992',
    'x-ratelimit-reset-input-tokens': '49.387s',
    'x-ratelimit-reset-requests': '3ms',
    'x-ratelimit-reset-tokens': '0s',
    'x-request-id': 'req_6b2a955b0f54430e8acff502f82f5758'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "This model is only supported in v1/responses and not in v1/chat/completions.",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": "model",\n' +
    '    "code": null\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'This model is only supported in v1/responses and not in v1/chat/completions.',
      type: 'invalid_request_error',
      param: 'model',
      code: null
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5-pro live/chat/tool-streaming: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoning: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/high: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5-pro live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5-pro live/chat/sampling/temperature/high: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/sampling/topP/high: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/sampling/logprobs/high: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5-pro live/chat/chatTemperature: catalog="unknown"; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/flexProcessing: catalog=supported; AI_APICallError: Flex is not available for this model.
UNVERIFIED gpt-5-pro live/chat/priorityProcessing: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/promptCacheRetention: catalog=supported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: This model is only supported in v1/responses and not in v1/chat/completions.
UNVERIFIED gpt-5-pro live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5 docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5 docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5 docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5 docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5 docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5 docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5 docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5 docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5 docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5 docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5 docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5 docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5 docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5 docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5 docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5 docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5 docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/responses/reasoningEfforts/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'xhigh' is not supported with the 'gpt-5' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5
MATCH      gpt-5 live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5
UNVERIFIED gpt-5 live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5
MATCH      gpt-5 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5
MATCH      gpt-5 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5 live/responses/sampling/temperature/minimal: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5 live/responses/sampling/topP/minimal: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5 live/responses/responsesLogprobsRequireNonReasoning/logprobs/minimal: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5 live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5 live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5 live/responses/configurationUpdates/request: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
UNVERIFIED gpt-5 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.
MATCH      gpt-5 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5
MATCH      gpt-5 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
UNVERIFIED gpt-5 live/chat/structured-output: catalog=supported; AI_NoOutputGeneratedError: No output generated.
MATCH      gpt-5 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/chat/reasoningEfforts/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'xhigh' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5 live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5 live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: You are not allowed to request logprobs from this model
MATCH      gpt-5 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
MATCH      gpt-5 live/chat/sampling/temperature/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5 live/chat/sampling/topP/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5 live/chat/sampling/logprobs/minimal: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5 live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5 live/chat/chatFunctionToolsWithReasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5 live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5 live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5-mini docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-mini docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-mini docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-mini docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-mini docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-mini docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-mini docs/feature/image_input: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-mini docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-mini docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-mini docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-mini docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-mini docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-mini docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-mini docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5-mini docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-mini docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-mini live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5-mini live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5-mini live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/responses/reasoningEfforts/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'xhigh' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-mini
MATCH      gpt-5-mini live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-mini
UNVERIFIED gpt-5-mini live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5-mini live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-mini
MATCH      gpt-5-mini live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-mini
MATCH      gpt-5-mini live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5-mini live/responses/sampling/temperature/minimal: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-mini live/responses/sampling/topP/minimal: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-mini live/responses/responsesLogprobsRequireNonReasoning/logprobs/minimal: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5-mini live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5-mini live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5-mini live/responses/configurationUpdates/request: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
UNVERIFIED gpt-5-mini live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.
MATCH      gpt-5-mini live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5-mini.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-mini
MATCH      gpt-5-mini live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5-mini live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5-mini live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/chat/reasoningEfforts/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'xhigh' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5-mini live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5-mini live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: You are not allowed to request logprobs from this model
MATCH      gpt-5-mini live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-mini live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5-mini live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
MATCH      gpt-5-mini live/chat/sampling/temperature/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5-mini live/chat/sampling/topP/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5-mini live/chat/sampling/logprobs/minimal: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5-mini live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5-mini live/chat/chatFunctionToolsWithReasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-mini live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5-mini live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5-nano docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-nano docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-nano docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-nano docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-nano docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-nano docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-nano docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-nano docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-nano docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-nano docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-nano docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-nano docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-nano docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-nano docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5-nano docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-nano docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-nano live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5-nano live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-5-nano live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/responses/reasoningEfforts/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'xhigh' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'max' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'temperature' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-nano
MATCH      gpt-5-nano live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-nano
UNVERIFIED gpt-5-nano live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5-nano live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-nano
MATCH      gpt-5-nano live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-nano
MATCH      gpt-5-nano live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported value: 'none' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5-nano live/responses/sampling/temperature/minimal: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-nano live/responses/sampling/topP/minimal: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-nano live/responses/responsesLogprobsRequireNonReasoning/logprobs/minimal: catalog="unknown"; AI_APICallError: logprobs are not supported with reasoning models.
MATCH      gpt-5-nano live/responses/flexProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5-nano live/responses/priorityProcessing: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-nano
MATCH      gpt-5-nano live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-5-nano live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5-nano live/responses/configurationUpdates/request: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
UNVERIFIED gpt-5-nano live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.
MATCH      gpt-5-nano live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-5-nano.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-nano
MATCH      gpt-5-nano live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-5-nano live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-5-nano live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/reasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/chat/reasoningEfforts/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/reasoningEfforts/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/reasoningEfforts/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/reasoningEfforts/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'xhigh' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5-nano live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5-nano live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: You are not allowed to request logprobs from this model
MATCH      gpt-5-nano live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
MATCH      gpt-5-nano live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
UNVERIFIED gpt-5-nano live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
MATCH      gpt-5-nano live/chat/sampling/temperature/minimal: catalog=unsupported; AI_APICallError: Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.
MATCH      gpt-5-nano live/chat/sampling/topP/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'top_p' is not supported with this model.
UNVERIFIED gpt-5-nano live/chat/sampling/logprobs/minimal: catalog=unsupported; AI_APICallError: You are not allowed to request logprobs from this model
UNVERIFIED gpt-5-nano live/chat/chatTemperature: catalog="unknown"; AI_APICallError: Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
MATCH      gpt-5-nano live/chat/chatFunctionToolsWithReasoning: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/flexProcessing: catalog=supported; API=accepted; expected output=observed
MISMATCH   gpt-5-nano live/chat/priorityProcessing: catalog=unsupported; API=accepted; expected output=observed; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-nano
MATCH      gpt-5-nano live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-5-nano live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-5-nano live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-5-codex docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-codex docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-codex docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-codex docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-codex docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-codex docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-codex docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-5-codex docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-codex docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-codex docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
MATCH      gpt-5-codex docs/language.reasoning.support: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-codex docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5-codex live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5-codex live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5-codex` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5-codex',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd803cf77430c-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:27:56 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '72',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=goNMlvcVeg6Kcbm8flarwwh98Ru3TAo1mV2pndwkjdE-1795559276.123618-1.0.1.1-GdBRWqXedHIhSk.sr_BDC276OlWYBCla2R0br3Y.ey5EBBmdn6IsuS2TQ9CgwRv5oU98IacDqm1aVocxn6O_PfNZRmTPe5TcTWcPAlyDsPZyBkxWFAmLLodFK3rEJR_u; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:57:56 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_4d8c3503ce684ea3b83a45ea17160adb'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "The model `gpt-5-codex` does not exist or you do not have access to it.",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": null,\n' +
    '    "code": "model_not_found"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5-codex` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5-codex live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoning: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/low: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/high: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/responses/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-5-chat-latest, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/responses/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/sampling/temperature/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-codex live/responses/sampling/topP/low: catalog=unsupported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-codex live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog="unknown"; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.
UNVERIFIED gpt-5-codex live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-codex
UNVERIFIED gpt-5-codex live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5-codex',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: undefined,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: 1024,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd81cfb13430c-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:28:00 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=KE92paT3NQq9qJxhtx3Uz2QM_ritr1sRbcMlLHsYvi4-1795559280.1542532-1.0.1.1-7ebTL1Cz1YtyQGnF2MEP8GdOBe7LY04HmxvLqZb.646C7yft6tsyND.OUBmyKAi84Ah._Vo87kLkriU4ePV9qJjD7sgcgz1n.vlT_P__tJe2c1bhAFDj6gQ4bSDS0OIl; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:58:00 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_c2616d5f580d4b25a3c81388b023aea8'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5-codex live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoning: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/low: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/medium: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/high: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/sampling/temperature/default: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/sampling/topP/default: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/sampling/logprobs/default: catalog="unknown"; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/sampling/temperature/low: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/sampling/topP/low: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/sampling/logprobs/low: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/chatTemperature: catalog="unknown"; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/chatFunctionToolsWithReasoning: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/flexProcessing: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5-codex` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-codex live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISMATCH   gpt-5-chat-latest docs/feature/function_calling: catalog=unsupported, OpenAI docs=supported
MISMATCH   gpt-5-chat-latest docs/feature/structured_outputs: catalog=unsupported, OpenAI docs=supported
MISSING    gpt-5-chat-latest docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-chat-latest docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISMATCH   gpt-5-chat-latest docs/tool/function_calling: catalog=unsupported, OpenAI docs=supported
MISSING    gpt-5-chat-latest docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-chat-latest docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-chat-latest docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-chat-latest docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-5-chat-latest docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-5-chat-latest docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-5-chat-latest docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-5-chat-latest docs/language.reasoning.support: catalog=unsupported, OpenAI docs=not declared
MATCH      gpt-5-chat-latest docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-5-chat-latest live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-5-chat-latest live/responses/structured-output: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/function-calling: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
APICallError [AI_APICallError]: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-5-chat-latest',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd82a8968430c-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:28:02 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '71',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=jkjwIV1Y9WINcmQJL16SW32vUGEMBvHamLNBbJ8oxrU-1795559282.3278925-1.0.1.1-t1eARqmw7DoX_w8SvITallcIwdugcInK6vLXoC3.nDnv__BWA.RLYMTTyh0KIGcVWA0RIgYSk2qqkKAWAGh9BCz3FurclEVBRkmqjf2K8u4DnWZehU0X_RvK3ndqD.dp; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:58:02 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_acbb00fa9ec84d6390598899cd375d57'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "The model `gpt-5-chat-latest` does not exist or you do not have access to it.",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": null,\n' +
    '    "code": "model_not_found"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5-chat-latest` does not exist or you do not have access to it.',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5-chat-latest live/responses/tool-streaming: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/reasoning: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/sampling/temperature/default: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/sampling/topP/default: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/sampling/logprobs/default: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.1-terra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/sampling/temperature/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-chat-latest live/responses/sampling/topP/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-5-chat-latest live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-5.6, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/flexProcessing: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/priorityProcessing: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.
UNVERIFIED gpt-5-chat-latest live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/responses/asyncTools: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` does not exist or you do not have access to it.; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/structured-output: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/function-calling: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-5-chat-latest',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: 1024,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: undefined,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd844c913430c-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:28:06 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=PubeFHvTe3eUiY.kF7Rg_j9KtY4tyRvpka47IRnZv2A-1795559286.5312965-1.0.1.1-rCIBoH_.RccdSRS.4Vy8iDnh1Rvk6tWVxDsWfSM2D0GKbviNika5sjcwh8FJp6w_8DaaeffGcIWdRm3GVDHhSegWFpB44RsqUHUz01irQsn2P3T4m2XrJ_w1rCFQ8hlf; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:58:06 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_e084879b471e44cbb3e2b683558ffa3f'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-5-chat-latest live/chat/tool-streaming: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoning: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/sampling/temperature/default: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/sampling/topP/default: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/sampling/logprobs/default: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/sampling/temperature/low: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/sampling/topP/low: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/sampling/logprobs/low: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/chatTemperature: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/chatFunctionToolsWithReasoning: catalog="unknown"; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/flexProcessing: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/chat/priorityProcessing: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations; SDK encoding policy=gpt-6.2-astra, API target=gpt-5-chat-latest
UNVERIFIED gpt-5-chat-latest live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-5-chat-latest` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-5-chat-latest live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-4.1 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1 docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1 docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1 docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1 docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1 docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1 docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/feature/fine_tuning: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1 docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1 docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1 docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1 docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1 docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-4.1 docs/language.reasoning.support: catalog=unsupported, OpenAI docs=not declared
MATCH      gpt-4.1 docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1 live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1 live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-4.1 live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/reasoning: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1
UNVERIFIED gpt-4.1 live/responses/sampling/temperature/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-4.1 live/responses/sampling/topP/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
MISMATCH   gpt-4.1 live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=supported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5.6, API target=gpt-4.1
UNVERIFIED gpt-4.1 live/responses/flexProcessing: catalog=unsupported; AI_APICallError: Invalid service_tier argument; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4.1 live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4.1 live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
UNVERIFIED gpt-4.1 live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-4.1.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1 live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-4.1 live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1 live/chat/reasoning: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4.1 live/chat/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1 live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/sampling/temperature/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/sampling/topP/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/sampling/logprobs/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4.1 live/chat/chatTemperature: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1 live/chat/chatFunctionToolsWithReasoning: catalog="unknown"; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1 live/chat/flexProcessing: catalog=unsupported; AI_APICallError: Invalid service_tier argument; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1
MATCH      gpt-4.1 live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1 live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-4.1 live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-4.1-mini docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-mini docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/feature/fine_tuning: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-mini docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1-mini docs/feature/image_input: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1-mini docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-mini docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-mini docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1-mini docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-4.1-mini docs/language.reasoning.support: catalog=unsupported, OpenAI docs=not declared
MATCH      gpt-4.1-mini docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1-mini live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1-mini live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-4.1-mini live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/reasoning: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-mini
UNVERIFIED gpt-4.1-mini live/responses/sampling/temperature/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-4.1-mini live/responses/sampling/topP/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
MISMATCH   gpt-4.1-mini live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=supported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5.6, API target=gpt-4.1-mini
UNVERIFIED gpt-4.1-mini live/responses/flexProcessing: catalog=unsupported; AI_APICallError: There was an issue with your request. Please check your inputs and try again; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4.1-mini live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4.1-mini live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
UNVERIFIED gpt-4.1-mini live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-4.1-mini.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1-mini live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-4.1-mini live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1-mini live/chat/reasoning: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4.1-mini live/chat/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1-mini live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/sampling/temperature/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/sampling/topP/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/sampling/logprobs/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4.1-mini live/chat/chatTemperature: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4.1-mini live/chat/chatFunctionToolsWithReasoning: catalog="unknown"; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4.1-mini live/chat/flexProcessing: catalog=unsupported; AI_APICallError: Invalid service_tier argument; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-mini
MATCH      gpt-4.1-mini live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4.1-mini live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-4.1-mini live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-4.1-nano docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-nano docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-nano docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1-nano docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/feature/fine_tuning: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-nano docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4.1-nano docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4.1-nano docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-4.1-nano docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-4.1-nano docs/language.reasoning.support: catalog=unsupported, OpenAI docs=not declared
MATCH      gpt-4.1-nano docs/language endpoint: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-4.1-nano live/responses/baseline: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/responses/image-input: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
UNVERIFIED gpt-4.1-nano live/responses/structured-output: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/responses/function-calling: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIResponsesLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/responses/openai-responses-language-model.ts:1656:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/responses',
  requestBodyValues: {
    model: 'gpt-4.1-nano',
    input: [ [Object] ],
    temperature: undefined,
    top_p: undefined,
    max_output_tokens: 1024,
    conversation: undefined,
    max_tool_calls: undefined,
    metadata: undefined,
    parallel_tool_calls: undefined,
    previous_response_id: undefined,
    store: undefined,
    user: undefined,
    instructions: undefined,
    service_tier: undefined,
    include: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    top_logprobs: undefined,
    truncation: undefined,
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'X-Request-ID, Server-Timing-Total, X-OpenAI-Inference-Capacity-Reason, CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd957a8b3430c-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json',
    date: 'Tue, 24 Nov 2026 22:28:50 GMT',
    'openai-organization': 'vercel-3tybbf',
    'openai-processing-ms': '315',
    'openai-project': 'proj_vtWUd6NJXqtsowifLNSQufMP',
    'openai-version': '2020-10-01',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=sqrpCTMcw_1cL4oFKCeG3C1jj71y8_NgzBcFng5Yqcg-1795559330.5026345-1.0.1.1-T017iIY7GhZsPdXQp9gP3CpUn59LwTHmpCLGGXz0ZI.Dd5nC7VsSPUxM66CuqMZOJx4Er17hm8bqsNNlyxVeXiEkmH45i7HwHuQyYZmNeaxqiwZzc.c4ppiuj5XIusil; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:58:50 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    'x-content-type-options': 'nosniff',
    'x-request-id': 'req_0fda24deeced42b7bef06edef1deb6cd'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "message": "The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '    "type": "invalid_request_error",\n' +
    '    "param": null,\n' +
    '    "code": "model_not_found"\n' +
    '  }\n' +
    '}',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-4.1-nano live/responses/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
MATCH      gpt-4.1-nano live/responses/reasoning: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/responses/sampling/temperature/default: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/responses/sampling/topP/default: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/responses/sampling/logprobs/default: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
MATCH      gpt-4.1-nano live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/responses/sampling/temperature/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-4.1-nano live/responses/sampling/topP/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
MISMATCH   gpt-4.1-nano live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=supported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5.6, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/responses/flexProcessing: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/responses/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/responses/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
MATCH      gpt-4.1-nano live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4.1-nano live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4.1-nano live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
MATCH      gpt-4.1-nano live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-4.1-nano.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/chat/baseline: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/image-input: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/audio-input: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/structured-output: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/function-calling: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
APICallError [AI_APICallError]: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
    at <anonymous> (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/response-handler.ts:156:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async postToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:118:28)
    at async postJsonToApi (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/post-to-api.ts:31:3)
    at async OpenAIChatLanguageModel.doStream (/Users/aayushkapoor/Desktop/ai/packages/openai/src/chat/openai-chat-language-model.ts:571:50)
    at async execute (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:370:22)
    at async runWithTracingChannelSpan (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/tracing-channel-publisher.ts:78:12)
    at async executeLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/telemetry/create-telemetry-dispatcher.ts:321:14)
    at async streamLanguageModelCall (/Users/aayushkapoor/Desktop/ai/packages/ai/src/generate-text/stream-language-model-call.ts:367:7)
    at async retryWithExponentialBackoffInternal (/Users/aayushkapoor/Desktop/ai/packages/provider-utils/src/retry-with-exponential-backoff.ts:87:12) {
  cause: undefined,
  url: 'https://api.openai.com/v1/chat/completions',
  requestBodyValues: {
    model: 'gpt-4.1-nano',
    logit_bias: undefined,
    logprobs: undefined,
    top_logprobs: undefined,
    user: undefined,
    parallel_tool_calls: undefined,
    max_tokens: 1024,
    temperature: undefined,
    top_p: undefined,
    frequency_penalty: undefined,
    presence_penalty: undefined,
    response_format: undefined,
    stop: undefined,
    seed: undefined,
    verbosity: undefined,
    max_completion_tokens: undefined,
    store: undefined,
    metadata: undefined,
    prediction: undefined,
    reasoning_effort: undefined,
    service_tier: undefined,
    prompt_cache_key: undefined,
    prompt_cache_options: undefined,
    prompt_cache_retention: undefined,
    safety_identifier: undefined,
    messages: [ [Object] ],
    tools: [ [Object] ],
    tool_choice: 'required',
    stream: true,
    stream_options: { include_usage: true }
  },
  statusCode: 404,
  responseHeaders: {
    'access-control-expose-headers': 'CF-Ray, CF-Ray',
    'alt-svc': 'h3=":443"; ma=86400',
    'cf-cache-status': 'DYNAMIC',
    'cf-ray': 'a5fbd97d8b96430c-IAD',
    connection: 'keep-alive',
    'content-encoding': 'br',
    'content-type': 'application/json; charset=utf-8',
    date: 'Tue, 24 Nov 2026 22:28:56 GMT',
    server: 'cloudflare',
    'set-cookie': '__cf_bm=nQr_DofRP4NY7THjM.vBs3Qtf6xic3oAX2iDGufVTDg-1795559336.563541-1.0.1.1-NLHn.ep_bdR2YMB6qwW6k.3dnzoE.MX7MqZ5YRflVcUZ21I_zx3pH_UA06pUo_xLkzeZHb7ltJNcSrbFJCj1IdInXCFQSHw5fT4LoXMT4aHwI04vXB.hsp95A387j_sr; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=api.openai.com; Expires=Tue, 24 Nov 2026 22:58:56 GMT',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'transfer-encoding': 'chunked',
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-openai-proxy-wasm': 'v0.1',
    'x-request-id': 'req_6abc055ad0b9455c8b511ca6eebb0f73'
  },
  responseBody: '{\n' +
    '    "error": {\n' +
    '        "message": "The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations",\n' +
    '        "type": "invalid_request_error",\n' +
    '        "param": null,\n' +
    '        "code": "model_not_found"\n' +
    '    }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      message: 'The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations',
      type: 'invalid_request_error',
      param: null,
      code: 'model_not_found'
    }
  },
  Symbol(vercel.ai.error): true,
  Symbol(vercel.ai.error.AI_APICallError): true
}
UNVERIFIED gpt-4.1-nano live/chat/tool-streaming: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoning: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/sampling/temperature/default: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/sampling/topP/default: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/sampling/logprobs/default: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/sampling/temperature/low: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/sampling/topP/low: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/sampling/logprobs/low: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/chatTemperature: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/chatFunctionToolsWithReasoning: catalog="unknown"; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/flexProcessing: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations; SDK encoding policy=gpt-6.2-astra, API target=gpt-4.1-nano
UNVERIFIED gpt-4.1-nano live/chat/priorityProcessing: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/promptCacheRetention: catalog=supported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations
UNVERIFIED gpt-4.1-nano live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-4o docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MISSING    gpt-4o docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/feature/fine_tuning: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o docs/feature/image_input: catalog=supported, OpenAI docs=supported
MISSING    gpt-4o docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4o docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-4o docs/language.reasoning.support: catalog=unsupported, OpenAI docs=not declared
MATCH      gpt-4o docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-4o live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/reasoning: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o
MATCH      gpt-4o live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o
MATCH      gpt-4o live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o
UNVERIFIED gpt-4o live/responses/sampling/temperature/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-4o live/responses/sampling/topP/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
MISMATCH   gpt-4o live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=supported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5.6, API target=gpt-4o
UNVERIFIED gpt-4o live/responses/flexProcessing: catalog=unsupported; AI_APICallError: There was an issue with your request. Please check your inputs and try again; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4o live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4o live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
UNVERIFIED gpt-4o live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-4o.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-4o live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o live/chat/reasoning: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4o live/chat/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/sampling/temperature/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/sampling/topP/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/sampling/logprobs/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4o live/chat/chatTemperature: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o live/chat/chatFunctionToolsWithReasoning: catalog="unknown"; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o live/chat/flexProcessing: catalog=unsupported; AI_APICallError: Invalid service_tier argument; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o
MATCH      gpt-4o live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-4o live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MISSING    gpt-4o-mini docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o-mini docs/feature/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4o-mini docs/feature/fine_tuning: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/feature/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/feature/file_uploads: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/feature/web_search: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o-mini docs/feature/structured_outputs: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-mini docs/feature/image_input: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-mini docs/tool/function_calling: catalog=supported, OpenAI docs=supported
MISSING    gpt-4o-mini docs/tool/web_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/tool/file_search: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/tool/image_generation: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/tool/code_interpreter: catalog=not declared, OpenAI docs=supported
MISSING    gpt-4o-mini docs/tool/mcp: catalog=not declared, OpenAI docs=supported
MATCH      gpt-4o-mini docs/language.inputs.image: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-mini docs/language.inputs.audio: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-4o-mini docs/language.reasoning.support: catalog=unsupported, OpenAI docs=not declared
MATCH      gpt-4o-mini docs/language endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-mini live/responses/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-mini live/responses/audio-input: catalog=unsupported; AI_UnsupportedFunctionalityError: 'file part media type audio/mpeg' functionality not supported.
MATCH      gpt-4o-mini live/responses/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/tool-streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/reasoning: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-6.1-terra, API target=gpt-4o-mini
UNVERIFIED gpt-4o-mini live/responses/sampling/temperature/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
UNVERIFIED gpt-4o-mini live/responses/sampling/topP/low: catalog=supported; Error: SDK omitted a required setting or context; API support was not tested.
MISMATCH   gpt-4o-mini live/responses/responsesLogprobsRequireNonReasoning/logprobs/low: catalog=supported; AI_APICallError: Unsupported parameter: 'reasoning.effort' is not supported with this model.; SDK encoding policy=gpt-5.6, API target=gpt-4o-mini
UNVERIFIED gpt-4o-mini live/responses/flexProcessing: catalog=unsupported; AI_APICallError: There was an issue with your request. Please check your inputs and try again; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/responses/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4o-mini live/responses/promptCacheOptions/12h: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
MATCH      gpt-4o-mini live/responses/configurationUpdates/request: catalog=unsupported; AI_APICallError: The 'configuration_update' item type is not supported with this model.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
UNVERIFIED gpt-4o-mini live/responses/configurationUpdates/message: catalog=unsupported; AI_InvalidPromptError: Invalid prompt: System messages are not allowed in the prompt or messages fields. Use the instructions option instead.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/responses/asyncTools: catalog=unsupported; AI_APICallError: Async tools are not supported with gpt-4o-mini.; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/chat/baseline: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/image-input: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-mini live/chat/audio-input: catalog=unsupported; AI_APICallError: Invalid 'messages[0]'. Content blocks are expected to be either text or image_url type.
MATCH      gpt-4o-mini live/chat/structured-output: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/function-calling: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/tool-streaming: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-mini live/chat/reasoning: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/minimal: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/low: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/medium: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/high: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/xhigh: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/reasoningEfforts/max: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4o-mini live/chat/sampling/temperature/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/sampling/topP/default: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/sampling/logprobs/default: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-mini live/chat/samplingAtReasoningEffortNone/temperature/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/samplingAtReasoningEffortNone/topP/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/samplingAtReasoningEffortNone/logprobs/none: catalog=unsupported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/sampling/temperature/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/sampling/topP/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/sampling/logprobs/low: catalog=supported; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
MATCH      gpt-4o-mini live/chat/chatTemperature: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-mini live/chat/chatFunctionToolsWithReasoning: catalog="unknown"; AI_APICallError: Unrecognized request argument supplied: reasoning_effort
UNVERIFIED gpt-4o-mini live/chat/flexProcessing: catalog=unsupported; AI_APICallError: Invalid service_tier argument; SDK encoding policy=gpt-6.2-astra, API target=gpt-4o-mini
MATCH      gpt-4o-mini live/chat/priorityProcessing: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/promptCacheRetention: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-mini live/chat/promptCacheOptions/30m: catalog=unsupported; AI_APICallError: prompt_cache_options is not supported on this model
UNVERIFIED gpt-4o-mini live/chat/promptCacheOptions/12h: catalog=unsupported; AI_InvalidArgumentError: invalid openai provider options
MATCH      text-embedding-3-large docs/embedding endpoint: catalog=supported, OpenAI docs=supported
MATCH      text-embedding-3-large live/embedding/defaultDimensions: catalog=3072; API=accepted; observed=3072
MATCH      text-embedding-3-large live/embedding/customDimensions: catalog=supported; API=accepted; expected output=observed
MATCH      text-embedding-3-small docs/embedding endpoint: catalog=supported, OpenAI docs=supported
MATCH      text-embedding-3-small live/embedding/defaultDimensions: catalog=1536; API=accepted; observed=1536
MATCH      text-embedding-3-small live/embedding/customDimensions: catalog=supported; API=accepted; expected output=observed
MATCH      text-embedding-ada-002 docs/embedding endpoint: catalog=supported, OpenAI docs=supported
MATCH      text-embedding-ada-002 live/embedding/defaultDimensions: catalog=1536; API=accepted; observed=1536
MATCH      text-embedding-ada-002 live/embedding/customDimensions: catalog=unsupported; AI_APICallError: This model does not support specifying dimensions.
MATCH      gpt-image-2.6-flare docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.6-flare docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.6-flare live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-flare live/image/sizes/1024x1280: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-flare live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-flare live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-flare live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-flare live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MATCH      gpt-image-2.6-sunburst docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.6-sunburst docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.6-sunburst live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-sunburst live/image/sizes/1024x1280: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-sunburst live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-sunburst live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-sunburst live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.6-sunburst live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MISSING    gpt-image-2.5-flare docs/feature/inpainting: catalog=not declared, OpenAI docs=supported
MATCH      gpt-image-2.5-flare docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.5-flare docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.5-flare live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-flare live/image/sizes/1024x1280: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-flare live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-flare live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-flare live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-flare live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MISSING    gpt-image-2.5-sunburst docs/feature/inpainting: catalog=not declared, OpenAI docs=supported
MATCH      gpt-image-2.5-sunburst docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.5-sunburst docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2.5-sunburst live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-sunburst live/image/sizes/1024x1280: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-sunburst live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-sunburst live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-sunburst live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2.5-sunburst live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MISSING    gpt-image-2 docs/feature/inpainting: catalog=not declared, OpenAI docs=supported
MATCH      gpt-image-2 docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2 docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-2 live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2 live/image/sizes/1536x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2 live/image/sizes/1024x1536: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2 live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2 live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2 live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-2 live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MISSING    gpt-image-1.5 docs/feature/inpainting: catalog=not declared, OpenAI docs=supported
MATCH      gpt-image-1.5 docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-1.5 docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-1.5 live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1.5 live/image/sizes/1536x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1.5 live/image/sizes/1024x1536: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1.5 live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1.5 live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1.5 live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1.5 live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MATCH      gpt-image-1-mini docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-1-mini docs/image.fileInput: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-1-mini live/image/sizes/1024x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1-mini live/image/sizes/1536x1024: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1-mini live/image/sizes/1024x1536: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1-mini live/image/fileInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1-mini live/image/maskInput: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1-mini live/image/maxImagesPerCall/n=10: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-image-1-mini live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MISSING    gpt-image-1 docs/feature/inpainting: catalog=not declared, OpenAI docs=supported
MATCH      gpt-image-1 docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-image-1 docs/image.fileInput: catalog=supported, OpenAI docs=supported
UNVERIFIED gpt-image-1 live/image/sizes/1024x1024: catalog=supported; AI_APICallError: The model 'gpt-image-1' does not exist.
UNVERIFIED gpt-image-1 live/image/sizes/1536x1024: catalog=supported; AI_APICallError: The model 'gpt-image-1' does not exist.
UNVERIFIED gpt-image-1 live/image/sizes/1024x1536: catalog=supported; AI_APICallError: The model 'gpt-image-1' does not exist.
UNVERIFIED gpt-image-1 live/image/fileInput: catalog=supported; AI_APICallError: The model 'gpt-image-1' does not exist.
UNVERIFIED gpt-image-1 live/image/maskInput: catalog=supported; AI_APICallError: The model 'gpt-image-1' does not exist.
UNVERIFIED gpt-image-1 live/image/maxImagesPerCall/n=10: catalog=supported; AI_APICallError: The model 'gpt-image-1' does not exist.
MATCH      gpt-image-1 live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Invalid 'n': integer above maximum value. Expected a value <= 10, but got 11 instead.
MATCH      dall-e-3 docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      dall-e-3 docs/image.fileInput: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED dall-e-3 live/image/sizes/1024x1024: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-3 live/image/sizes/1792x1024: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-3 live/image/sizes/1024x1792: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-3 live/image/fileInput: catalog=unsupported; AI_APICallError: The model 'dall-e-3' does not exist.
UNVERIFIED dall-e-3 live/image/maskInput: catalog=unsupported; AI_APICallError: The model 'dall-e-3' does not exist.
UNVERIFIED dall-e-3 live/image/maxImagesPerCall/n=1: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-3 live/image/maxImagesPerCall/n=2: catalog=unsupported; AI_APICallError: Unknown parameter: 'response_format'.
MISSING    dall-e-2 docs/feature/inpainting: catalog=not declared, OpenAI docs=supported
MATCH      dall-e-2 docs/image endpoint: catalog=supported, OpenAI docs=supported
MATCH      dall-e-2 docs/image.fileInput: catalog=supported, OpenAI docs=supported
UNVERIFIED dall-e-2 live/image/sizes/256x256: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-2 live/image/sizes/512x512: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-2 live/image/sizes/1024x1024: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-2 live/image/fileInput: catalog=supported; AI_APICallError: The model 'dall-e-2' does not exist.
UNVERIFIED dall-e-2 live/image/maskInput: catalog=supported; AI_APICallError: The model 'dall-e-2' does not exist.
UNVERIFIED dall-e-2 live/image/maxImagesPerCall/n=10: catalog=supported; AI_APICallError: Unknown parameter: 'response_format'.
UNVERIFIED dall-e-2 live/image/maxImagesPerCall/n=11: catalog=unsupported; AI_APICallError: Unknown parameter: 'response_format'.
MATCH      whisper-1 docs/transcription.transcription: catalog=supported, OpenAI docs=supported
MATCH      whisper-1 live/transcription/transcription: catalog=supported; API=accepted; expected output=observed
MATCH      whisper-1 live/transcription/duration: catalog=supported; API=accepted; expected output=observed
MATCH      whisper-1 live/transcription/segments: catalog=supported; API=accepted; expected output=observed
MATCH      whisper-1 live/transcription/language: catalog=supported; API=accepted; expected output=observed
MISMATCH   whisper-1 live/transcription/streaming: catalog=unsupported; API=accepted; expected output=observed
MATCH      whisper-1 live/transcription/streamingDelay/minimal: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      whisper-1 live/transcription/streamingDelay/low: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      whisper-1 live/transcription/streamingDelay/medium: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      whisper-1 live/transcription/streamingDelay/high: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      whisper-1 live/transcription/streamingDelay/xhigh: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-mini-transcribe docs/transcription.transcription: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-mini-transcribe live/transcription/transcription: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-mini-transcribe live/transcription/duration: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-4o-mini-transcribe-api-ev3'. Use 'json' or 'text' instead.
UNVERIFIED gpt-4o-mini-transcribe live/transcription/segments: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-4o-mini-transcribe-api-ev3'. Use 'json' or 'text' instead.
UNVERIFIED gpt-4o-mini-transcribe live/transcription/language: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-4o-mini-transcribe-api-ev3'. Use 'json' or 'text' instead.
MISMATCH   gpt-4o-mini-transcribe live/transcription/streaming: catalog=unsupported; API=accepted; expected output=observed
MATCH      gpt-4o-mini-transcribe live/transcription/streamingDelay/minimal: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-mini-transcribe live/transcription/streamingDelay/low: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-mini-transcribe live/transcription/streamingDelay/medium: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-mini-transcribe live/transcription/streamingDelay/high: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-mini-transcribe live/transcription/streamingDelay/xhigh: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-transcribe docs/transcription.transcription: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-transcribe live/transcription/transcription: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-4o-transcribe live/transcription/duration: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-4o-transcribe-api-ev3'. Use 'json' or 'text' instead.
UNVERIFIED gpt-4o-transcribe live/transcription/segments: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-4o-transcribe-api-ev3'. Use 'json' or 'text' instead.
UNVERIFIED gpt-4o-transcribe live/transcription/language: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-4o-transcribe-api-ev3'. Use 'json' or 'text' instead.
MISMATCH   gpt-4o-transcribe live/transcription/streaming: catalog=unsupported; API=accepted; expected output=observed
MATCH      gpt-4o-transcribe live/transcription/streamingDelay/minimal: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-transcribe live/transcription/streamingDelay/low: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-transcribe live/transcription/streamingDelay/medium: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-transcribe live/transcription/streamingDelay/high: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-transcribe live/transcription/streamingDelay/xhigh: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-4o-transcribe-diarize docs/transcription.transcription: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-transcribe-diarize live/transcription/transcription: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-transcribe-diarize live/transcription/duration: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-transcribe-diarize live/transcription/segments: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-4o-transcribe-diarize live/transcription/language: catalog=unsupported; API=accepted; expected output=missing
UNVERIFIED gpt-4o-transcribe-diarize live/transcription/streaming: catalog=unsupported; Error: Your organization does not have access to this transcription model.
UNVERIFIED gpt-4o-transcribe-diarize live/transcription/streamingDelay/minimal: catalog=unsupported; Error: Your organization does not have access to this transcription model.
UNVERIFIED gpt-4o-transcribe-diarize live/transcription/streamingDelay/low: catalog=unsupported; Error: Your organization does not have access to this transcription model.
UNVERIFIED gpt-4o-transcribe-diarize live/transcription/streamingDelay/medium: catalog=unsupported; Error: Your organization does not have access to this transcription model.
UNVERIFIED gpt-4o-transcribe-diarize live/transcription/streamingDelay/high: catalog=unsupported; Error: Your organization does not have access to this transcription model.
UNVERIFIED gpt-4o-transcribe-diarize live/transcription/streamingDelay/xhigh: catalog=unsupported; Error: Your organization does not have access to this transcription model.
MISSING    gpt-transcribe docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-transcribe docs/transcription.transcription: catalog=supported, OpenAI docs=supported
MATCH      gpt-transcribe live/transcription/transcription: catalog=supported; API=accepted; expected output=observed
UNVERIFIED gpt-transcribe live/transcription/duration: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-transcribe-api-ev3'. Use 'json' or 'text' instead.
UNVERIFIED gpt-transcribe live/transcription/segments: catalog=unsupported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-transcribe-api-ev3'. Use 'json' or 'text' instead.
UNVERIFIED gpt-transcribe live/transcription/language: catalog=supported; AI_APICallError: response_format 'verbose_json' is not compatible with model 'gpt-transcribe-api-ev3'. Use 'json' or 'text' instead.
MATCH      gpt-transcribe live/transcription/streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-transcribe live/transcription/streamingDelay/minimal: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-transcribe live/transcription/streamingDelay/low: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-transcribe live/transcription/streamingDelay/medium: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-transcribe live/transcription/streamingDelay/high: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MATCH      gpt-transcribe live/transcription/streamingDelay/xhigh: catalog=unsupported; Error: The 'delay' parameter is not supported for this model.
MISSING    gpt-live-transcribe docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-live-transcribe docs/transcription.transcription: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-live-transcribe live/transcription/transcription: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-live-transcribe' functionality not supported.
UNVERIFIED gpt-live-transcribe live/transcription/duration: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-live-transcribe' functionality not supported.
UNVERIFIED gpt-live-transcribe live/transcription/segments: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-live-transcribe' functionality not supported.
UNVERIFIED gpt-live-transcribe live/transcription/language: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-live-transcribe' functionality not supported.
MATCH      gpt-live-transcribe live/transcription/streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-transcribe live/transcription/streamingDelay/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-transcribe live/transcription/streamingDelay/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-transcribe live/transcription/streamingDelay/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-transcribe live/transcription/streamingDelay/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-transcribe live/transcription/streamingDelay/xhigh: catalog=supported; API=accepted; expected output=observed
MISSING    gpt-realtime-whisper docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-realtime-whisper docs/transcription.transcription: catalog=unsupported, OpenAI docs=unsupported
UNVERIFIED gpt-realtime-whisper live/transcription/transcription: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-realtime-whisper' functionality not supported.
UNVERIFIED gpt-realtime-whisper live/transcription/duration: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-realtime-whisper' functionality not supported.
UNVERIFIED gpt-realtime-whisper live/transcription/segments: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-realtime-whisper' functionality not supported.
UNVERIFIED gpt-realtime-whisper live/transcription/language: catalog=unsupported; AI_UnsupportedFunctionalityError: 'non-streaming transcription with gpt-realtime-whisper' functionality not supported.
MATCH      gpt-realtime-whisper live/transcription/streaming: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-whisper live/transcription/streamingDelay/minimal: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-whisper live/transcription/streamingDelay/low: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-whisper live/transcription/streamingDelay/medium: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-whisper live/transcription/streamingDelay/high: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-whisper live/transcription/streamingDelay/xhigh: catalog=supported; API=accepted; expected output=observed
MISSING    gpt-realtime-translate docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MATCH      gpt-realtime-translate docs/v1/realtime/translations: catalog=supported, OpenAI docs=supported
MATCH      gpt-realtime-translate live/speechTranslation/translatedAudio: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-translate live/speechTranslation/translatedText: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime-translate live/speechTranslation/sourceTranscript: catalog=supported; API=accepted; expected output=observed
MATCH      tts-1 docs/speech endpoint: catalog=supported, OpenAI docs=supported
MISMATCH   tts-1 live/speech/instructions: catalog=unsupported; API=accepted; expected output=observed
MATCH      tts-1-hd docs/speech endpoint: catalog=supported, OpenAI docs=supported
MISMATCH   tts-1-hd live/speech/instructions: catalog=unsupported; API=accepted; expected output=observed
MATCH      gpt-4o-mini-tts docs/speech endpoint: catalog=supported, OpenAI docs=supported
MATCH      gpt-4o-mini-tts live/speech/instructions: catalog=supported; API=accepted; expected output=observed
MISSING    gpt-live-1 docs/feature/streaming: catalog=not declared, OpenAI docs=supported
MISSING    gpt-live-1 docs/feature/function_calling: catalog=not declared, OpenAI docs=supported
MISSING    gpt-live-1 docs/feature/structured_outputs: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-live-1 docs/feature/fine_tuning: catalog=not declared, OpenAI docs=unsupported
MISSING    gpt-live-1 docs/feature/predicted_outputs: catalog=not declared, OpenAI docs=unsupported
MATCH      gpt-live-1 docs/v1/live/sessions: catalog=supported, OpenAI docs=supported
MATCH      gpt-live-1 live/realtime/conversation: catalog="continuous"; API=accepted; observed="continuous"
MATCH      gpt-live-1 live/realtime/connections/server-websocket: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-1 live/realtime/connections/client-secret-websocket: catalog=unsupported; Error: Model "gpt-live-1" is not supported in realtime mode. See https://platform.openai.com/docs/models for a list of supported models.
MATCH      gpt-live-1 live/realtime/connections/webrtc: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-1 live/realtime/transports/websocket: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-live-1 live/realtime/transports/webrtc: catalog=supported; API=accepted; expected output=observed
MISSING    gpt-realtime docs/feature/function_calling: catalog=not declared, OpenAI docs=supported
MISSING    gpt-realtime docs/feature/prompt_caching: catalog=not declared, OpenAI docs=supported
MATCH      gpt-realtime docs/v1/realtime: catalog=supported, OpenAI docs=supported
MATCH      gpt-realtime live/realtime/conversation: catalog="turn-based"; API=accepted; observed="turn-based"
MATCH      gpt-realtime live/realtime/connections/server-websocket: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime live/realtime/connections/client-secret-websocket: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime live/realtime/connections/webrtc: catalog=unsupported; AI_APICallError: Model "gpt-realtime" is not supported in realtime mode.
MATCH      gpt-realtime live/realtime/transports/websocket: catalog=supported; API=accepted; expected output=observed
MATCH      gpt-realtime live/realtime/transports/webrtc: catalog=unsupported; AI_APICallError: Model "gpt-realtime" is not supported in realtime mode.

 { MATCH: 1536, MISMATCH: 69, UNVERIFIED: 989, MISSING: 394 }
MATCH = declarations agree; MISMATCH = contradictory evidence; MISSING = docs field absent from catalog; UNVERIFIED = insufficient evidence.