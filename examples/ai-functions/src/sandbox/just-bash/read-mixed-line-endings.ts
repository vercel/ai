import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';

const networkSandboxSession = await createJustBashNetworkSandboxSession({
  cwd: '/work',
});
const sandboxSession = networkSandboxSession.restricted();

try {
  await sandboxSession.writeTextFile({
    path: '/work/mixed-line-endings.txt',
    content: 'first\r\nsecond\nthird\rfourth',
  });

  const secondLine = await sandboxSession.readTextFile({
    path: '/work/mixed-line-endings.txt',
    startLine: 2,
    endLine: 2,
  });

  const firstThreeLines = await sandboxSession.readTextFile({
    path: '/work/mixed-line-endings.txt',
    startLine: 1,
    endLine: 3,
  });

  console.log({ secondLine, firstThreeLines });
} finally {
  await networkSandboxSession.destroy();
}
