---
name: list-npm-package-content
description: List the contents of an npm package tarball before publishing. Use when the user wants to see what files are included in an npm bundle, verify package contents, check tarball size, or debug npm publish issues.
---

# List npm Package Content

This skill helps you list the exact contents of an npm package tarball - the same files that would be uploaded to npm and downloaded by users.

## Prerequisites

- Package must be built first (run `pnpm build` or equivalent)
- Run commands from the package directory (e.g., `packages/ai`)

## Step-by-Step Instructions

### Step 1: Build the Package

```bash
pnpm build
```

### Step 2: Create the Tarball

```bash
pnpm pack
```

This creates a `.tgz` file (e.g., `ai-6.0.46.tgz`) and runs any `prepack`/`postpack` scripts defined in `package.json`.

### Step 3: List Tarball Contents

List all files in the tarball:

```bash
tar -tzf *.tgz
```

Or with more detail (sizes):

```bash
tar -tvzf *.tgz
```

### Step 4: Check Tarball Size

```bash
ls -lh *.tgz
```

### Step 5: Extract and Browse (Optional)

To inspect files in detail:

```bash
mkdir -p /tmp/inspect-bundle
tar -xzf *.tgz -C /tmp/inspect-bundle
ls -la /tmp/inspect-bundle/package/
```

Check unpacked size:

```bash
du -sh /tmp/inspect-bundle/package/
```

### Step 6: Cleanup

Always clean up after inspection:

```bash
# Remove tarball
rm *.tgz

# Remove extracted files (if extracted)
rm -rf /tmp/inspect-bundle
```

## Quick One-Liner

To list contents without leaving artifacts:

```bash
pnpm build && pnpm pack && tar -tzf *.tgz && rm *.tgz
```

## Alternative: Dry Run

To see what would be published without creating a tarball (note: this runs prepack which may have side effects):

```bash
npm publish --dry-run
```

## Understanding Package Contents

The files included are determined by:

1. **`files` field in `package.json`** - explicit allowlist of files/directories
2. **`.npmignore`** - files to exclude (if present)
3. **`.gitignore`** - used if no `.npmignore` exists
4. **Always included**: `package.json`, `README`, `LICENSE`, `CHANGELOG`
5. **Always excluded**: `.git`, `node_modules`, `.npmrc`, etc.

## Troubleshooting

**Tarball larger than expected?**
- Check if `src/` is included (common for source maps)
- Check if `docs/` or other non-essential directories are listed in `files`
- Use `tar -tvzf *.tgz | sort -k3 -n` to find largest files

**Missing files?**
- Verify the file/directory is listed in the `files` field of `package.json`
- Check `.npmignore` isn't excluding it
- Ensure the file exists after build

**prepack script failing?**
- Some packages copy files during prepack (e.g., docs)
- Ensure source files exist before running `pnpm pack`
