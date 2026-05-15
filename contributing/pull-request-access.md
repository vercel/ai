# Pull Request Access

The AI SDK repository has recently seen an increase in pull requests opened against existing issues. Many of these pull requests are generated quickly, do not show enough understanding of the problem, and create significant review overhead for maintainers.

This makes it harder to give thoughtful feedback to high-quality contributors, slows down issue triage, and creates noise around important work. Open issues are not a race to submit the first pull request. They are a coordination point for careful, maintainable changes to a widely used SDK.

## Proposal

We should limit who can open pull requests against the repository to a smaller set of approved contributors.

Approved contributors may include:

- members of the core AI SDK team
- long-time contributors with a strong track record
- contributors outside the core team who have shown careful judgment, thoroughness, and attention to detail
- new contributors who have been vouched for by an approved contributor

This is not intended to close the project to the community. It is intended to protect maintainer time, keep review quality high, and make sure pull requests come from people who are prepared to do the work well.

## Initial Approved Contributors

The initial approved contributor list should be based on demonstrated contribution quality rather than volume alone.

Signals to consider include:

- prior merged pull requests that were well-scoped and complete
- careful issue reproduction and investigation before proposing a fix
- thoughtful communication with maintainers and other contributors
- strong test coverage and documentation updates when needed
- willingness to iterate based on review feedback
- attention to existing architecture, conventions, and project philosophy

The core AI SDK team has final approval for the initial list and any future changes to it. Approved contributors may include people who are not part of the core team.

## Vouching

Approved contributors may vouch for new contributors who they believe will do high-quality work.

A vouch should be based on direct evidence, such as previous work with the contributor, strong issue analysis, or a well-prepared draft change. It should not be based only on enthusiasm or availability.

When someone is vouched for, the core AI SDK team should review the recommendation and decide whether to add that person to the approved contributor list. The goal is to grow the contributor pool carefully while preserving a high standard for pull requests.

## Expectations for Approved Contributors

Approved contributors are expected to:

- claim or discuss non-trivial issues before starting work
- avoid opening speculative or rushed pull requests
- keep changes focused and aligned with the issue being addressed
- include tests, examples, documentation, and changesets when appropriate
- respond to review feedback in a timely and constructive way
- help preserve the quality and maintainability of the repository

Approval can be removed if a contributor repeatedly opens low-quality, disruptive, or uncoordinated pull requests.

## Handling Unapproved Pull Requests

Pull requests from people who are not approved contributors may be closed without full review.

Maintainers should be clear and respectful when doing so. A short response is enough:

> Thanks for your interest in contributing. We are currently limiting pull request access to approved contributors to keep the repository manageable. Please participate in issues first, share context or reproductions, and work with an approved contributor if you want to pursue this change.

Spam, generated, duplicate, or obviously low-effort pull requests should be closed. Repeat abuse may be reported or blocked according to GitHub repository moderation practices.

## How New Contributors Can Still Help

New contributors are still welcome to participate in ways that help the project:

- report bugs with clear reproductions
- improve existing issues with additional context
- test proposed fixes
- discuss implementation tradeoffs before code is written
- contribute through an approved contributor who can vouch for the work

High-quality participation in issues is one of the best ways to become known to the project and eventually be considered for pull request access.
