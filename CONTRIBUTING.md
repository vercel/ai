# Contributing to the AI SDK

We deeply appreciate your interest in contributing to our repository! Whether you're reporting bugs, suggesting enhancements, improving docs, or submitting pull requests, your contributions help improve the project for everyone.

## Reporting Bugs

If you've encountered a bug in the project, we encourage you to report it to us. Please follow these steps:

1. **Check the Issue Tracker**: Before submitting a new bug report, please check our issue tracker to see if the bug has already been reported. If it has, you can add to the existing report.
2. **Create a New Issue**: If the bug hasn't been reported, create a new issue. Provide a clear title and a detailed description of the bug. Include any relevant logs, error messages, and steps to reproduce the issue.
3. **Label Your Issue**: If possible, label your issue as a `bug` so it's easier for maintainers to identify.

## Suggesting Enhancements

We're always looking for suggestions to make our project better. If you have an idea for an enhancement, please:

1. **Check the Issue Tracker**: Similar to bug reports, please check if someone else has already suggested the enhancement. If so, feel free to add your thoughts to the existing issue.
2. **Create a New Issue**: If your enhancement hasn't been suggested yet, create a new issue. Provide a detailed description of your suggested enhancement and how it would benefit the project.

## Improving Documentation

Documentation is crucial for understanding and using our project effectively.
You can find the content of our docs under [`content`](https://github.com/vercel/ai/tree/main/content).

To fix smaller typos, you can edit the code directly in GitHub or use Github.dev (press `.` in Github).

If you want to make larger changes, please check out the Code Contributions section below. It also explains how to fix prettier issues that you might encounter during your docs changes.

## Code Contributions

We welcome your contributions to our code and documentation. Here's how you can contribute:

### Environment Setup

AI SDK development requires PNPM v9 (lockfile version) or higher and Node v20 or higher.

### Setting Up the Repository Locally

To set up the repository on your local machine, follow these steps:

1. **Fork the Repository**: Make a copy of the repository to your GitHub account.
2. **Clone the Repository**: Clone the repository to your local machine, e.g. using `git clone`.
3. **Install Node**: If you haven't already, install Node v20.
4. **Install pnpm**: If you haven't already, install pnpm v9. You can do this by running `npm install -g pnpm@9` if you're using npm. Alternatively, if you're using Homebrew (Mac), you can run `brew install pnpm`. For more see [the pnpm site](https://pnpm.io/installation).
5. **Install Dependencies**: Navigate to the project directory and run `pnpm install` to install all necessary dependencies.
6. **Build the Project**: Run `pnpm build` in the root to build all packages.

### Running the Examples

1. `cd examples/ai-core` (for AI SDK Core, or another example folder)
1. AI SDK Core examples: run e.g. `pnpm tsx src/stream-text/openai.ts`
1. Other framework examples: run `pnpm dev` and go to the browser url

### Local Development Workflow

#### Building Packages

To build the package that you're working on, run `pnpm build` or `pnpm build:watch` in the package folder.
This command updates the `dist` folder with the new version of the package.
Once built, the new code is picked up by the examples.

#### Testing Packages

To test the package that you're working on, run `pnpm test` in the package folder.
You do not need to rebuild your package to test it (only dependencies need to be built).
Some packages like `ai` also have more details tests and watch mode, see their `package.json` for more information.

#### Adding package dependencies

Please run `pnpm update-references` in workspace root to update the `references` section in the `tsconfig.json` file.

### Submitting Pull Requests

We greatly appreciate your pull requests. Here are the steps to submit them:

1. **Create a New Branch**: Initiate your changes in a fresh branch. It's recommended to name the branch in a manner that signifies the changes you're implementing.
2. **Commit Your Changes**: Ensure your commits are succinct and clear, detailing what modifications have been made and the reasons behind them.
3. **Push the Changes to Your GitHub Repository**: After committing your changes, push them to your GitHub repository.
4. **Open a Pull Request**: Propose your changes for review. Furnish a lucid title and description of your contributions. Make sure to link any relevant issues your PR resolves.
5. **Respond to Feedback**: Stay receptive to and address any feedback or alteration requests from the project maintainers.

### Fixing Prettier Issues

> [!TIP]
> Run `pnpm prettier-fix` before opening a pull request.

If you encounter any prettier issues, you can fix them by running `pnpm prettier-fix`. This command will automatically fix any formatting issues in your code.

Thank you for contributing to the AI SDK! Your efforts help us improve the project for everyone.
