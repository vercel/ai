# Decision fixtures

Both fixtures were captured from the live Model APIs System One endpoint
(`POST https://inference.baseten.co/v1/systemone`) with
`decision-models/baseten-bison-latest` on November 20, 2026. The responses are
unchanged. Authentication headers are not recorded.

- `decisions.json`: a support message about a duplicate charge with one Choice
  question, two yes/no (`noul`) questions (one with `true`/`false` criteria), and
  one Score question.
- `decisions-image.json`: a 64×64 solid red PNG in `state.messages` with the
  yes/no question "Is this image predominantly red?". The image tokens are
  included in `usage.input_tokens`.
