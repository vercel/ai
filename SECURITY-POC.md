# Security research PoC - no functional change

This PR's TITLE is a proof-of-concept for a GitHub Actions template injection
in .github/workflows/slack-team-review-notification.yml (the expression
toJson(env.TITLE) is re-expanded into the shell inside a single-quoted curl
argument; a single quote in the title breaks out and command substitution runs).

Reported via Vercel's HackerOne program (handle duc193). Do not merge.
The only file change is this note.
