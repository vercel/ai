# RSS Feed Broken Link Fix

## Issue
The broken link checker reported that `https://ai-sdk.dev/rss.xml` returns a 404 error on 2026-02-02 (reported in Slack #feedback-docs channel).

## Root Cause
The issue is in the **vercel/ai-elements** repository, not in this repository (vercel/ai). 

The AI Elements documentation site has:
- RSS feed route handler at `apps/docs/app/[lang]/rss.xml/route.ts`
- RSS button that links to `/rss.xml`
- But no rewrite rule to map `/rss.xml` to `/en/rss.xml`

This causes the RSS feed to be inaccessible at the path referenced by the RSS button.

## Fix Applied
Created issue in ai-elements repository with the solution:
- **Issue**: https://github.com/vercel/ai-elements/issues/353
- **Fix**: Add rewrite rule in `apps/docs/next.config.mjs` to map `/rss.xml` to `/en/rss.xml`

## No Changes Needed in This Repository
The vercel/ai repository content does not reference the RSS feed, and the issue is isolated to the AI Elements documentation site configuration.
