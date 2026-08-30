interface DossiersPluginContext {
  log?: {
    info?(message: string): void;
  };
}

export default class DossiersPlugin {
  ctx!: DossiersPluginContext;

  onload(): void {
    this.ctx.log?.info?.("Hana Dossiers loaded; workspace compatibility is checked when the Page or a tool opens a library.");
  }

  onunload(): void {
    this.ctx.log?.info?.("Hana Dossiers unloaded; workspace dossier data was left in place.");
  }
}
