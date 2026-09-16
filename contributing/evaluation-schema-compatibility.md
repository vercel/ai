# Structured evaluation schema compatibility

Verified on September 16, 2026 for the experimental evaluation adapter. These
checks establish schema acceptance and request/response compatibility; they are
not a semantic quality or calibration benchmark.

| Provider             | Model tested                | Object with required enum and number fields | Number with minimum/maximum      |
| -------------------- | --------------------------- | ------------------------------------------- | -------------------------------- |
| OpenAI Responses     | `gpt-5.6-luna`              | HTTP 200, valid answers                     | HTTP 200                         |
| Anthropic Messages   | `claude-haiku-4-5-20251001` | HTTP 200, valid answers                     | HTTP 400: unsupported properties |
| Google Generative AI | `gemini-3.5-flash-lite`     | HTTP 200, valid answers                     | HTTP 200                         |

The portable schema is a single root object, with required properties and
`additionalProperties: false`. Each Choice is a string enum of internal codes;
each Score and Boolean is a number whose bounds are described in text. All three native
APIs returned the requested code and fractional score with this schema.

## Provider constraints

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  requires a root object, required fields, and `additionalProperties: false`.
  Root `anyOf` is unsupported. Documented limits include 5,000 properties, ten
  nesting levels, 120,000 schema string characters, and 1,000 enum values.
  Large individual enums have an additional string budget. Fine-tuned models
  support fewer constraints. The adapter uses Responses with strict JSON schema.
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
  supports objects, primitives, enums, and constants, but rejects numeric bounds
  and `multipleOf`. Complex grammars can exceed compilation limits; optional
  and union parameters have separate limits. Enum/constant casing is not always
  preserved. The existing Messages implementation selects native
  `output_config.format` for supported models.
- [Google structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
  supports enum strings, numbers and numeric bounds, required properties, and
  `additionalProperties`. Unsupported schema properties may be ignored and
  overly large or deeply nested schemas may be rejected. The existing provider
  sends `generationConfig.responseJsonSchema`.

## Shared strategy and regression coverage

Use flat internal question IDs (`q0`) and Choice codes (`c0`), then map back to
exact caller IDs and labels. This avoids schema complexity from arbitrary keys
and ambiguity between labels that differ only in casing. Score bounds live in
the prompt and are checked after parsing; no unsupported numeric schema keywords
are sent. Rubrics and state remain prompt data, including structured descriptions.

Require complete output, an exact answer set, known Choice codes, and finite
Scores within the rubric. Refusals, truncation, malformed JSON, and invalid values
fail the whole evaluation. Tests cover these cases, arbitrary IDs and labels,
cancellation, metadata forwarding, and Boolean probabilities at the endpoints and within `[0, 1]`.
Schema size limits remain provider/model errors instead of guessed shared caps.
Boolean questions prompt the model to estimate P(true), with bounds described in
the prompt and validated locally. These are prompted estimates without a
calibration guarantee; callers choose their own thresholds. Choice and Score
distributions are not generated.
