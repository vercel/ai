---
'@ai-sdk/provider': patch
'ai': patch
---

Add `experimental_evaluate` and the isolated experimental v4 evaluation model specification for Choice, Score, and Boolean questions against shared state. Includes typed answers, optional Choice/Score distributions, required Boolean probabilities, validation, retries, cancellation, and `Experimental_EvaluationUnsupportedQuestionTypeError` for unsupported questions.
