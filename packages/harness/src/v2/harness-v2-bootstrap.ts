export interface HarnessV2BootstrapFile {
  readonly path: string;
  readonly content: string;
}

export interface HarnessV2BootstrapCommand {
  readonly command: string;
}

export interface HarnessV2Bootstrap {
  readonly harnessId: string;
  readonly bootstrapDir: string;
  readonly files: ReadonlyArray<HarnessV2BootstrapFile>;
  readonly commands: ReadonlyArray<HarnessV2BootstrapCommand>;
}
