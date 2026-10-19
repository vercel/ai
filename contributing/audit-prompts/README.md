# Contributing audit prompts

Share the reusable prompts you used to audit AI SDK so maintainers and
contributors can repeat useful audits and improve them together. See
[bug reports and contributor credit](../bug-reports.md) for the distinction
between production/usage reports and audit findings.

We will accept a new valuable prompt or a meaningful improvement to an existing
prompt and grant co-authorship for the prompt contribution. Filing audit issues
does not grant co-authorship, and prompt credit does not automatically extend
to future bug fixes discovered using the prompt.

## Submit a prompt

1. Read the existing prompts in this directory. Improve an existing prompt when
   your approach overlaps with it.
2. Add a Markdown file named for the audit topic, such as
   `streaming-tool-results.md`, directly in this directory. Use kebab-case.
3. Include the prompt you actually used, its purpose, scope, prerequisites,
   expected evidence, and known limitations. Make the instructions reusable.
4. In your pull request, explain what the prompt found and why it is valuable,
   or how your change improves an existing prompt. Link findings, reproductions,
   or tests that help demonstrate its value.

Maintainers review prompts for useful coverage, reproducibility, and how well
they distinguish real defects from false positives. Cosmetic rewrites and
collections of generated issue descriptions are not meaningful prompt
improvements by themselves.

Prompt-only pull requests do not need a package changeset. Follow the usual
[pull request guidelines](../../CONTRIBUTING.md#submitting-pull-requests), including
signed commits.

## Prompt structure

Use this structure as a starting point:

````markdown
# Audit topic

## Purpose and scope

Describe what this audit checks and which packages or behaviors it covers.

## Prerequisites

List any setup, tools, repository state, or model settings needed to run it.

## Prompt

```text
Paste the reusable instructions you used here.
```

## Validation and example findings

Explain how to validate findings. Link examples and supporting evidence from
running the prompt. Distinguish suspected problems from confirmed defects.

## Known limitations

Describe exclusions, assumptions, and false positives to watch for.
````

Keep any instructions for filing findings consistent with
[bug reports and contributor credit](../bug-reports.md). Audit instructions
should ask agents to check existing issues, validate findings, and preserve
their actual discovery context.

## Prompt index

No audit prompts have been accepted yet. When adding a prompt, add a link and
a short description here.
