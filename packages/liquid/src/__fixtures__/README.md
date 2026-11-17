# Decision fixtures

Both fixtures were captured from the live Liquid Decisions API
(`POST /decisions/v1/systemone`) with `d1.2` on November 17, 2026. The responses
are unchanged. Authentication headers are not recorded.

- `decisions.json`: a support message with `examples/ai-functions/data/comic-cat.png`
  and one Choice, Noul, Score, and Box question each.
- `decisions-box-not-found.json`: the same image with a Box question for an object
  that is not in it ("The red sports car.").
