# Fixtures

All fixtures were captured from the live SubQ API (`https://api.subq.ai/v1`) on
November 27, 2026. The responses are unchanged. Authentication headers are not
recorded.

- `chat-completion.json`: `POST /chat/completions` with `subq-savant-1.4` and a
  prompt asking for 17 × 23. The reasoning comes back in `message.reasoning`, and
  `reasoning_tokens` is part of `completion_tokens`.
- `chat-completion-stream.txt`: the same question with `stream: true`,
  `stream_options.include_usage`, and `reasoning_effort: "low"`. Reasoning comes
  back in `delta.reasoning`, and the stream ends with a `choices: []` usage chunk.
- `decisions.json`: `POST /systemone` with `subq-snap-1.2`, a support message,
  and one Choice, Noul, and Score question each.
- `decisions-image.json`: `POST /systemone` with `subq-snap-1.2`,
  `examples/ai-functions/data/comic-cat.png` in `images`, and a Choice question
  about which animal is shown (cat, dog, bird). The image tokens are included in
  `usage.input_tokens`.
