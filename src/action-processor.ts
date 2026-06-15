import { App, Notice, TFile } from "obsidian";
import WonderPlugin from "./main";

export class ActionProcessor {
  plugin: WonderPlugin;
  app: App;

  constructor(plugin: WonderPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  async processActionMarkers(file: TFile) {
    // Cheap guard so we don't touch notes that have nothing to do.
    const content = await this.app.vault.read(file);
    if (!/@action:? .*/i.test(content)) return;

    const { kanbanFile } = this.plugin.settings;
    const kanban = this.app.vault.getAbstractFileByPath(`${kanbanFile}.md`);
    if (!(kanban instanceof TFile)) return;

    const kanbanEntries: string[] = [];

    // vault.process reads, transforms, and writes atomically, so we compute
    // the rewrite from the data it hands us rather than a stale read.
    await this.app.vault.process(file, (data) => {
      let newData = data;
      for (const match of data.matchAll(/@action:? (.*)/gi)) {
        const actionText = match[1].trim();
        const blockId = Math.random().toString(36).substring(2, 9);

        newData = newData.replace(
          match[0],
          `**[[${kanbanFile}#^${blockId}|ACTION]]:** ${actionText}`
        );
        // Anchor the Kanban item with the same block ID the ACTION link targets.
        kanbanEntries.push(`- ${actionText} ^${blockId}\n[[${file.basename}]]`);
        new Notice(`Adding auto action: ${actionText}`);
      }
      return newData;
    });

    if (kanbanEntries.length === 0) return;

    // Insert the new action items after the "## ToDo" header.
    await this.app.vault.process(kanban, (data) =>
      data.replace(/(##\s+ToDo\s*\n)/, `$1${kanbanEntries.join("\n")}\n`)
    );
  }
}
