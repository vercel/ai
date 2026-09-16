import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild, type RsbuildConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const realtimeMarkers = [
  'RTCPeerConnection',
  'createDataChannel',
  'getUserMedia',
  'createScriptProcessor',
] as const;

type BuildResult = {
  gzipBytes: number;
  jsFiles: string[];
  presentMarkers: string[];
};

async function buildPackage(repositoryRoot: string, packageDirectory: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['-C', packageDirectory, 'build'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Package build failed with exit code ${code}`));
      }
    });
  });
}

async function materializePackage({
  packageName,
  sourceDirectory,
  temporaryRoot,
}: {
  packageName: string;
  sourceDirectory: string;
  temporaryRoot: string;
}) {
  const targetDirectory = path.join(temporaryRoot, 'node_modules', packageName);
  await mkdir(targetDirectory, { recursive: true });
  await cp(
    path.join(sourceDirectory, 'package.json'),
    path.join(targetDirectory, 'package.json'),
  );
  await cp(
    path.join(sourceDirectory, 'dist'),
    path.join(targetDirectory, 'dist'),
    {
      recursive: true,
    },
  );
}

async function linkDependency({
  packageName,
  packageRequire,
  temporaryRoot,
}: {
  packageName: string;
  packageRequire: NodeJS.Require;
  temporaryRoot: string;
}) {
  let packageDirectory: string;
  try {
    packageDirectory = path.dirname(
      packageRequire.resolve(`${packageName}/package.json`),
    );
  } catch {
    packageDirectory = path.dirname(packageRequire.resolve(packageName));
    while (true) {
      try {
        const manifest = JSON.parse(
          await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
        ) as { name?: string };
        if (manifest.name === packageName) {
          break;
        }
      } catch {
        // Continue walking toward the package root.
      }

      const parent = path.dirname(packageDirectory);
      if (parent === packageDirectory) {
        throw new Error(`Could not locate package root for ${packageName}`);
      }
      packageDirectory = parent;
    }
  }
  const target = path.join(temporaryRoot, 'node_modules', packageName);

  await mkdir(path.dirname(target), { recursive: true });
  try {
    await symlink(packageDirectory, target, 'dir');
  } catch (error) {
    if (
      error == null ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    ) {
      throw error;
    }
  }
}

async function prepareNodeModules({
  repositoryRoot,
  temporaryRoot,
}: {
  repositoryRoot: string;
  temporaryRoot: string;
}) {
  const aiDirectory = path.join(repositoryRoot, 'packages/ai');
  const reactDirectory = path.join(repositoryRoot, 'packages/react');
  const aiPackage = JSON.parse(
    await readFile(path.join(aiDirectory, 'package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> };
  const reactPackage = JSON.parse(
    await readFile(path.join(reactDirectory, 'package.json'), 'utf8'),
  ) as {
    dependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  };

  await materializePackage({
    packageName: 'ai',
    sourceDirectory: aiDirectory,
    temporaryRoot,
  });
  await materializePackage({
    packageName: '@ai-sdk/react',
    sourceDirectory: reactDirectory,
    temporaryRoot,
  });

  const aiRequire = createRequire(path.join(aiDirectory, 'package.json'));
  const reactRequire = createRequire(path.join(reactDirectory, 'package.json'));

  for (const packageName of Object.keys(aiPackage.dependencies)) {
    await linkDependency({
      packageName,
      packageRequire: aiRequire,
      temporaryRoot,
    });
  }

  for (const packageName of [
    ...Object.keys(reactPackage.dependencies),
    ...Object.keys(reactPackage.peerDependencies),
  ]) {
    if (packageName === 'ai') {
      continue;
    }
    await linkDependency({
      packageName,
      packageRequire: reactRequire,
      temporaryRoot,
    });
  }
}

async function buildVariant({
  root,
  name,
  chunkSplit,
}: {
  root: string;
  name: string;
  chunkSplit?: NonNullable<
    NonNullable<RsbuildConfig['performance']>['chunkSplit']
  >;
}): Promise<BuildResult> {
  const distPath = path.join(root, name);
  const rsbuild = await createRsbuild({
    cwd: root,
    rsbuildConfig: {
      plugins: [pluginReact()],
      source: {
        entry: {
          index: './src/index.js',
        },
      },
      output: {
        distPath: {
          root: distPath,
        },
        filenameHash: false,
        sourceMap: false,
      },
      performance: {
        chunkSplit,
        printFileSize: false,
      },
      tools: {
        htmlPlugin: false,
      },
    },
  });

  const build = await rsbuild.build();
  await build.close();

  const emittedFiles = await readdir(distPath, {
    recursive: true,
    withFileTypes: true,
  });
  const jsFiles = emittedFiles
    .filter(file => file.isFile() && file.name.endsWith('.js'))
    .map(file => path.join(file.parentPath, file.name))
    .sort();
  const contents = await Promise.all(jsFiles.map(file => readFile(file)));
  const emittedJavaScript = Buffer.concat(contents).toString('utf8');

  return {
    gzipBytes: contents.reduce(
      (total, content) => total + gzipSync(content, { level: 4 }).byteLength,
      0,
    ),
    jsFiles: jsFiles.map(file => path.relative(distPath, file)),
    presentMarkers: realtimeMarkers.filter(marker =>
      emittedJavaScript.includes(marker),
    ),
  };
}

async function main() {
  const reproductionDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(reproductionDirectory, '../../../..');
  const temporaryRoot = path.join(reproductionDirectory, '.issue-20845');

  await buildPackage(repositoryRoot, 'packages/ai');
  await buildPackage(repositoryRoot, 'packages/react');
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(path.join(temporaryRoot, 'src'), { recursive: true });
  await prepareNodeModules({ repositoryRoot, temporaryRoot });
  await writeFile(
    path.join(temporaryRoot, 'src/index.js'),
    [
      "import { useChat } from '@ai-sdk/react';",
      "import { DefaultChatTransport } from 'ai';",
      'console.log(useChat, DefaultChatTransport);',
      '',
    ].join('\n'),
  );

  try {
    const defaultSplitting = await buildVariant({
      root: temporaryRoot,
      name: 'dist-default',
    });
    const allInOne = await buildVariant({
      root: temporaryRoot,
      name: 'dist-all-in-one',
      chunkSplit: { strategy: 'all-in-one' },
    });

    console.log(
      JSON.stringify(
        {
          versions: {
            ai: '7.0.102',
            '@ai-sdk/react': '4.0.105',
            '@rsbuild/core': '2.2.6',
            '@rspack/core': '2.2.4',
          },
          defaultSplitting,
          allInOne,
        },
        null,
        2,
      ),
    );

    if (allInOne.presentMarkers.length > 0) {
      throw new Error(
        'Reproduction control failed: all-in-one bundle still contains realtime browser runtime',
      );
    }

    if (defaultSplitting.presentMarkers.length > 0) {
      throw new Error(
        'ISSUE #20845 REPRODUCED: useChat-only default split bundle contains realtime browser runtime',
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
