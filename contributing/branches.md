# Branches

`main` is our production branch. It can only be updated through pull requests. Once merged, a release pull request is created or updated, see [Releases](./releases.md)

When we start working on a pre-release like v5.1 or v6.0, we do a few things

1. switch `main` branch to pre-release mode by running [`npm run changeset pre enter next`](https://changesets-docs.vercel.app/en/prereleases) locally which results in a pull request like [#8710](https://github.com/vercel/ai/pull/8710/files)
2. We create a new branch for the curren stable release. For example, if the latest version of `ai` is 5.0.45, then the new branch for stable releases is `v5.0`
   - Create the branch
   - Create branch protections
   - update triggers in workflows ([example pull request](https://github.com/vercel/ai/pull/8708))
3. All pull requests must continue to go against `main` while in pre-release mode. If we want to release patch releases while in pre-release mode, we have to manually backport pull requests that got merged into `main` into the stable release version branch (`v5.0` in above example). 

Once we are ready to exit pre-release mode, run [`npm run changeset pre exit`](https://changesets-docs.vercel.app/en/prereleases). 