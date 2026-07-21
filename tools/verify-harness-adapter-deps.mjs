#!/usr/bin/env node

import { existsSync, globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const adapterConfigs = [
  {
    name: 'Claude Code',
    packageDir: 'packages/harness-claude-code',
    primarySdk: '@anthropic-ai/claude-agent-sdk',
    sdkPackages: [
      '@anthropic-ai/claude-agent-sdk',
      '@anthropic-ai/claude-code',
      '@modelcontextprotocol/sdk',
    ],
  },
  {
    name: 'Codex',
    packageDir: 'packages/harness-codex',
    primarySdk: '@openai/codex-sdk',
    sdkPackages: ['@openai/codex-sdk'],
  },
  {
    name: 'Deep Agents',
    packageDir: 'packages/harness-deepagents',
    primarySdk: 'deepagents',
    sdkPackages: [
      '@langchain/anthropic',
      '@langchain/core',
      '@langchain/langgraph',
      'deepagents',
      'langchain',
      'langsmith',
    ],
  },
  {
    name: 'OpenCode',
    packageDir: 'packages/harness-opencode',
    primarySdk: '@opencode-ai/sdk',
    sdkPackages: ['@opencode-ai/sdk', 'opencode-ai'],
  },
  {
    name: 'Pi',
    packageDir: 'packages/harness-pi',
    primarySdk: '@earendil-works/pi-coding-agent',
    sdkPackages: ['@earendil-works/pi-coding-agent'],
  },
];

const installDependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function getDependencySpec({ manifest, packageName }) {
  for (const section of installDependencySections) {
    const spec = manifest[section]?.[packageName];
    if (spec != null) return spec;
  }
  return undefined;
}

function findInstalledPackageJson({ fromPackageJsonPath, packageName }) {
  const directPackageJsonPath = resolve(
    dirname(fromPackageJsonPath),
    'node_modules',
    packageName,
    'package.json',
  );
  if (existsSync(directPackageJsonPath)) return directPackageJsonPath;

  const localRequire = createRequire(fromPackageJsonPath);
  try {
    return localRequire.resolve(`${packageName}/package.json`);
  } catch {
    let currentDir;
    try {
      currentDir = dirname(localRequire.resolve(packageName));
    } catch {
      return undefined;
    }

    while (true) {
      const packageJsonPath = join(currentDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        const manifest = readJson(packageJsonPath);
        if (manifest.name === packageName) return packageJsonPath;
      }
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) return undefined;
      currentDir = parentDir;
    }
  }
}

export function validatePeerRanges({
  adapterName,
  manifest,
  manifestPath,
  primaryMetadata,
  sdkPackages,
}) {
  const errors = [];
  const peerDependencies = primaryMetadata.peerDependencies ?? {};

  for (const packageName of sdkPackages) {
    const supportedRange = peerDependencies[packageName];
    if (supportedRange == null) continue;

    const declaredRange = getDependencySpec({ manifest, packageName });
    if (declaredRange == null) continue;

    if (semver.validRange(declaredRange) == null) {
      errors.push(
        `${adapterName} (${manifestPath}) declares ${packageName}@${declaredRange}, ` +
          'which is not a valid semantic-version range.',
      );
      continue;
    }
    if (semver.validRange(supportedRange) == null) {
      errors.push(
        `${primaryMetadata.name}@${primaryMetadata.version} declares an invalid ` +
          `peer range for ${packageName}: ${supportedRange}.`,
      );
      continue;
    }
    if (!semver.subset(declaredRange, supportedRange)) {
      errors.push(
        `${adapterName} (${manifestPath}) declares ${packageName}@${declaredRange}, ` +
          `but ${primaryMetadata.name}@${primaryMetadata.version} supports ` +
          `${packageName}@${supportedRange}.`,
      );
    }
  }

  return errors;
}

export function validatePrimaryVersionAlignment({
  adapterName,
  bridgeManifest,
  bridgeManifestPath,
  primarySdk,
  rootManifest,
  rootManifestPath,
}) {
  const rootSpec = getDependencySpec({
    manifest: rootManifest,
    packageName: primarySdk,
  });
  const bridgeSpec = getDependencySpec({
    manifest: bridgeManifest,
    packageName: primarySdk,
  });

  if (rootSpec == null || bridgeSpec == null || rootSpec === bridgeSpec) {
    return [];
  }

  return [
    `${adapterName} uses ${primarySdk}@${rootSpec} in ${rootManifestPath}, ` +
      `but ${primarySdk}@${bridgeSpec} in ${bridgeManifestPath}.`,
  ];
}

function discoverAdapterPackageDirs() {
  return globSync('packages/harness-*/package.json', {
    cwd: repoRoot,
  })
    .map(packageJsonPath => dirname(packageJsonPath))
    .sort();
}

function reportErrors({ heading, errors }) {
  console.error(`\n✖ ${heading}:\n`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error();
}

function main() {
  const configuredPackageDirs = new Set(
    adapterConfigs.map(adapter => adapter.packageDir),
  );
  const unconfiguredPackageDirs = discoverAdapterPackageDirs().filter(
    packageDir => !configuredPackageDirs.has(packageDir),
  );
  if (unconfiguredPackageDirs.length > 0) {
    reportErrors({
      heading: 'Harness adapter dependency verification is not configured',
      errors: unconfiguredPackageDirs.map(
        packageDir =>
          `${packageDir}/package.json has no entry in adapterConfigs in ` +
          'tools/verify-harness-adapter-deps.mjs.',
      ),
    });
    process.exitCode = 1;
    return;
  }

  const adapterData = [];
  const peerCompatibilityErrors = [];
  let verifiedManifestCount = 0;

  for (const adapter of adapterConfigs) {
    const rootPackageJsonPath = resolve(
      repoRoot,
      adapter.packageDir,
      'package.json',
    );
    if (!existsSync(rootPackageJsonPath)) {
      peerCompatibilityErrors.push(
        `${adapter.name} is configured at ${adapter.packageDir}, but its ` +
          'package.json does not exist.',
      );
      continue;
    }

    const rootManifest = readJson(rootPackageJsonPath);
    const primarySpec = getDependencySpec({
      manifest: rootManifest,
      packageName: adapter.primarySdk,
    });
    if (primarySpec == null) {
      peerCompatibilityErrors.push(
        `${adapter.name} (${adapter.packageDir}/package.json) does not declare ` +
          `its configured primary SDK, ${adapter.primarySdk}.`,
      );
      continue;
    }

    const primaryPackageJsonPath = findInstalledPackageJson({
      fromPackageJsonPath: rootPackageJsonPath,
      packageName: adapter.primarySdk,
    });
    if (primaryPackageJsonPath == null) {
      peerCompatibilityErrors.push(
        `${adapter.name} could not resolve the installed ${adapter.primarySdk} ` +
          `package from ${adapter.packageDir}/package.json. Run pnpm install ` +
          'before this verification.',
      );
      continue;
    }

    const primaryMetadata = readJson(primaryPackageJsonPath);
    if (!semver.satisfies(primaryMetadata.version, primarySpec)) {
      peerCompatibilityErrors.push(
        `${adapter.name} declares ${adapter.primarySdk}@${primarySpec}, but ` +
          `${adapter.primarySdk}@${primaryMetadata.version} is installed.`,
      );
      continue;
    }

    peerCompatibilityErrors.push(
      ...validatePeerRanges({
        adapterName: adapter.name,
        manifest: rootManifest,
        manifestPath: relative(repoRoot, rootPackageJsonPath),
        primaryMetadata,
        sdkPackages: adapter.sdkPackages,
      }),
    );
    verifiedManifestCount++;

    const bridgePackageJsonPath = resolve(
      repoRoot,
      adapter.packageDir,
      'src/bridge/package.json',
    );
    const bridgeManifest = existsSync(bridgePackageJsonPath)
      ? readJson(bridgePackageJsonPath)
      : undefined;
    if (bridgeManifest != null) {
      peerCompatibilityErrors.push(
        ...validatePeerRanges({
          adapterName: `${adapter.name} bridge`,
          manifest: bridgeManifest,
          manifestPath: relative(repoRoot, bridgePackageJsonPath),
          primaryMetadata,
          sdkPackages: adapter.sdkPackages,
        }),
      );
      verifiedManifestCount++;
    }

    adapterData.push({
      adapter,
      bridgeManifest,
      bridgePackageJsonPath,
      rootManifest,
      rootPackageJsonPath,
    });
  }

  if (peerCompatibilityErrors.length > 0) {
    reportErrors({
      heading: 'Harness adapter SDK peer compatibility failed',
      errors: peerCompatibilityErrors,
    });
    process.exitCode = 1;
    return;
  }

  const versionAlignmentErrors = [];
  for (const data of adapterData) {
    if (data.bridgeManifest == null) continue;
    versionAlignmentErrors.push(
      ...validatePrimaryVersionAlignment({
        adapterName: data.adapter.name,
        bridgeManifest: data.bridgeManifest,
        bridgeManifestPath: relative(repoRoot, data.bridgePackageJsonPath),
        primarySdk: data.adapter.primarySdk,
        rootManifest: data.rootManifest,
        rootManifestPath: relative(repoRoot, data.rootPackageJsonPath),
      }),
    );
  }

  if (versionAlignmentErrors.length > 0) {
    reportErrors({
      heading: 'Harness adapter primary SDK version alignment failed',
      errors: versionAlignmentErrors,
    });
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ Verified SDK peer compatibility for ${verifiedManifestCount} harness ` +
      `adapter manifest${verifiedManifestCount === 1 ? '' : 's'}.`,
  );
  console.log('✓ Verified primary SDK versions match across bridge manifests.');
}

if (
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
