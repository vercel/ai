import path from 'node:path';
import {
  CompositeBackend,
  FilesystemBackend,
  StateBackend,
  createMemoryMiddleware,
  createSkillsMiddleware,
} from 'deepagents';

export function createDeepAgentsRepositoryResourceMiddlewares({
  workDir,
  homeDir,
  skillsPaths,
}: {
  workDir: string;
  homeDir: string;
  skillsPaths?: ReadonlyArray<string>;
}): {
  memory: ReturnType<typeof createMemoryMiddleware>;
  skills?: ReturnType<typeof createSkillsMiddleware>;
} {
  const backend = new CompositeBackend(new StateBackend(), {
    [`${path.resolve(workDir)}/`]: new FilesystemBackend({
      rootDir: workDir,
      virtualMode: true,
    }),
    [`${path.resolve(homeDir)}/`]: new FilesystemBackend({
      rootDir: homeDir,
      virtualMode: true,
    }),
  });

  return {
    memory: createMemoryMiddleware({
      backend,
      sources: [path.join(workDir, 'AGENTS.md')],
    }),
    ...(skillsPaths?.length
      ? {
          skills: createSkillsMiddleware({
            backend,
            sources: [...skillsPaths],
          }),
        }
      : {}),
  };
}
