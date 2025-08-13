# Local AI Development Workflow

This document outlines the steps to modify the AI package locally and use it in your main project.

## Project Structure
- **AI Package**: `/Users/eliaweiss/work/freeya/ai` (forked from Vercel AI SDK)
- **Main Project**: `/Users/eliaweiss/work/scrape-n-chat1`
- **GitHub Fork**: `https://github.com/eliaweiss/ai`

## Workflow Steps

### 1. Make Changes to AI Package

Navigate to your AI package directory:
```bash
cd /Users/eliaweiss/work/freeya/ai
```

Make your code changes in the relevant files (typically in `packages/ai/`).

### 2. Build the Package

Build the entire monorepo:
```bash
pnpm build
```

This ensures all TypeScript is compiled and the package is ready for distribution.

### 3. Create Tarball

Navigate to the AI package directory and create a tarball:
```bash
cd packages/ai
pnpm pack
```

This creates a file like `ai-4.3.17.tgz` (version may vary).

### 4. Copy Tarball to Main Project

Copy the tarball to your main project:
```bash
cp ai-*.tgz /Users/eliaweiss/work/zooly/ai-sdk
/Users/eliaweiss/work/scrape-n-chat1/ai-sdk
```

### 5. Update Main Project Dependencies

Navigate to your main project:
```bash
cd /Users/eliaweiss/work/scrape-n-chat1
```

Update `package.json` to use the new tarball:
```json
{
  "dependencies": {
    "ai": "./ai-sdk/ai-5.0.12.tgz"
  }
}
```

Replace `5.0.12` with the actual version number from your tarball.

### 6. Clean Installation

Remove existing node_modules and lockfile, then reinstall:

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 7. Verify Installation

Check that the correct version is installed:
```bash
npm list ai
```

You should see your local version (e.g., `4.3.16`) instead of the npm version.

## Alternative: Using GitHub Fork (for production)

### Push Changes to Fork
```bash
cd /Users/eliaweiss/work/freeya/ai
git add .
git commit -m "feat: your feature description"
git push origin your-branch-name
```



**Note**: GitHub installation may have issues with monorepo structure. The tarball method is more reliable for development.

## Quick Development Cycle Script

You can create a script to automate the process:

```bash
#!/bin/bash
# save as update-ai.sh in your main project root

AI_PATH="/Users/eliaweiss/work/freeya/ai"
MAIN_PATH="/Users/eliaweiss/work/scrape-n-chat1"

echo "Building AI package..."
cd "$AI_PATH"
pnpm build

echo "Creating tarball..."
cd "$AI_PATH/packages/ai"
pnpm pack

echo "Copying to main project..."
cp ai-*.tgz "$MAIN_PATH/ai-sdk"

echo "Updating dependencies..."
cd "$MAIN_PATH"
rm -rf node_modules package-lock.json
npm install

echo "Done! AI package updated."
```

Make it executable:
```bash
chmod +x update-ai.sh
```

## Tips

1. **Version Management**: Each time you make changes, consider updating the version in `packages/ai/package.json` to track your modifications.

2. **Testing**: Always test your changes in the AI package before deploying to your main project.

3. **Backup**: Keep your tarball files with descriptive names (e.g., `ai-4.3.17-onUpdateToolsList.tgz`) for version tracking.

4. **Git Workflow**: Consider creating feature branches in your fork for different modifications.

## Troubleshooting

### "Module not found" errors
- Ensure the tarball path in `package.json` is correct
- Verify the tarball was created successfully
- Check that `node_modules` was properly cleaned

### TypeScript errors showing old version
- Clear TypeScript cache: `npx tsc --build --clean`
- Restart your IDE/TypeScript language server
- Verify `node_modules/ai/package.json` shows your version

### Build failures
- Ensure all dependencies are installed in the AI package
- Check for TypeScript compilation errors
- Verify monorepo build order (some packages may depend on others) 