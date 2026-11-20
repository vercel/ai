# Cache middleware identity and reachable hits

## Purpose and scope

Check response-cache middleware examples in `content/`: can the documented code
read its own entries, and does a shared cache separate providers and models?
This covers in-memory, local-file, and Redis-oriented examples, not SDK-managed
caching. The prompt is distilled from an investigation process and manually
exercised as described below; it is not a verbatim historical prompt.

## Prerequisites

- Read repository guidance and current contribution announcements first.
- Use an isolated checkout, its manifests and lockfile, and locally built affected
  packages for source verification. A pinned documentation snapshot with published
  SDK packages can provide narrower evidence; explicitly identify that limitation.
- Use deterministic SDK mock language models and temporary storage. No provider
  credentials, paid API requests, or changes to production services are needed.

## Prompt

```text
Audit only documented response-cache middleware in content/. Preserve the
checkout. Do not publish findings or modify upstream state during the audit.

1. Pin the source revision. Locate relevant examples with rg and record file
   blobs. Extract complete middleware blocks. Identify the actual cache scope:
   per model instance, module, file, or external store. Shared storage is a
   prerequisite for an identity collision; do not assume it.
2. Execute each relevant example through the affected public SDK API with
   deterministic mock models. Substitute only provider construction, imports,
   and isolated storage. Preserve key expressions and actual SDK-generated
   call parameters. Fully consume streams. Record all substitutions.
3. First repeat the identical request on the same model. Count underlying
   model calls and inspect stored/read values to establish a reachable hit.
   Check async parsers and storage operations at their real return types. If
   an earlier defect masks cache behavior, record that dependency; do not claim
   a downstream collision was observed on the unmodified baseline.
4. With one actual shared cache, test separately: same provider/different model
   IDs, and different providers/same model ID. Make outputs distinguishable.
   Compare returned text and underlying call counts. Repeat the second request
   to check hits. Change its prompt and an output setting separately to check
   misses. Test generate and stream only where the example implements them.
5. If a collision is observed, try the smallest identity correction in an
   isolated copy while retaining all existing parameters. Rerun the same cases
   and show that identity separation and hits/misses both hold. If the pinned
   example is already correct, do not change it merely to produce a finding.
6. Do not fabricate cross-operation collisions by deleting or normalizing
   generate/stream parameters. Exercise the actual public API. A plausible
   source pattern is not a confirmed bug when requests produce distinct keys.
7. Search existing issues and PRs, including closed work and policy closures.
   Record matching findings and adequate fixes; do not propose competing work.
   Preserve audit discovery context unless genuine external usage context
   exists. A mock reproduction alone does not establish a usage problem.

Return a bounded report: revision/blob and runtime versions; setup/run commands;
extraction and substitutions; cache scope; case-by-case output and call counts;
before/after evidence; dependencies; dedup links; rejected hypotheses; and exact
verification limits. Record no finding if none meets these requirements. Follow
the maintainer's audit-prompt route rather than automatically filing issues.
```

## Validation and example findings

The underlying process found [#23848](https://github.com/vercel/ai/issues/23848)
(async parsing prevented local-file hits) and
[#23956](https://github.com/vercel/ai/issues/23956) (cache identity collisions).
The file-cache identity variant became observable only after
[#23855](https://github.com/vercel/ai/pull/23855) removed the earlier blocker.
These were audit findings, not problems encountered in an external application.

A manual walkthrough of this distilled prompt used the exact middleware blocks
from the parent of the merged identity fix,
`5f19ea5c61310c2a929cbbeb1e565c5344392209`, and main snapshot
`c8875b71a36f921e49b34884edcf8a43a236bdeb`. It covered the core guide, advanced
caching guide, Next.js middleware block, and local-file middleware block.

| Control                                                | Before                                                   | Merged examples                                   |
| ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------- |
| Provider/model identity, all implemented operations    | 12 of 14 scenarios replayed A for B; B called zero times | All 14 return B and reuse B's entry on repetition |
| Same model, repeated request                           | Reachable hit                                            | Reachable hit                                     |
| Changed prompt or output-token limit                   | Separate generation                                      | Separate generation                               |
| Redis examples, generate then stream and reverse order | Four cases kept operations separate                      | Four cases kept operations separate               |

The two non-colliding baseline identity cases were the file recipe's existing
model-ID separation. The cross-operation controls retained actual SDK parameters;
normalizing those parameters could have manufactured a false positive.

Execution used published `ai` 7.0.162, `@ai-sdk/provider-utils` 5.0.74, Node 24.18.0,
real `generateText`/`streamText`/`wrapLanguageModel`, and `MockLanguageModelV4`.
Storage used a real temporary file or a JSON-serializing Redis substitute.
The example blocks were not corrected by the harness. This was a manual dry run,
not an independent-agent benchmark or a repository-source build.
The merged [#24508](https://github.com/vercel/ai/pull/24508) also contains a complete
source-build reproduction for the identity scenarios.

## Known limitations

Mocks establish SDK orchestration and example cache logic, not provider wire
behavior. A Redis substitute does not verify network/persistence timing, retries,
or the full Next.js application. File-cache concurrency, eviction, and
cross-process guarantees need separate requirements. Date revival was exercised
in the walkthrough, but not every metadata shape was tested.

Provider/model identity does not uniquely identify every custom endpoint or
configuration. Passing these checks does not prove universal cache correctness.
Use existing fixed examples as negative controls and historical revisions as
positive controls; do not reopen completed reports or file duplicate audit issues.
