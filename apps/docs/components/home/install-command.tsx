import {
  CommandPromptContent,
  CommandPromptCopy,
  CommandPromptPrefix,
  CommandPromptRoot,
  CommandPromptSurface,
  CommandPromptViewport,
} from '@vercel/geistdocs/components/command-prompt';

export function InstallCommand({ command }: { command: string }) {
  return (
    <CommandPromptRoot defaultValue="install">
      <CommandPromptSurface>
        <CommandPromptPrefix>$</CommandPromptPrefix>
        <CommandPromptViewport>
          <CommandPromptContent value="install">{command}</CommandPromptContent>
        </CommandPromptViewport>
        <CommandPromptCopy aria-label={`Copy ${command}`} />
      </CommandPromptSurface>
    </CommandPromptRoot>
  );
}
