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
    const content = await this.app.vault.read(file);
    const matches = [...content.matchAll(/@action:? (.*)/gi)];
    if (matches.length === 0) return;

    const { kanbanFile } = this.plugin.settings;
    const kanban = this.app.vault.getAbstractFileByPath(`${kanbanFile}.md`);
    if (!(kanban instanceof TFile)) return;

    let newContent = content;
    let kanbanEntries = "";

    for (const match of matches) {
      const actionText = match[1].trim();
      const blockId = Math.random().toString(36).substring(2, 9);

      newContent = newContent.replace(
        match[0],
        `**[[${kanbanFile}#^${blockId}|ACTION]]:** ${actionText}`
      );
      // Anchor the Kanban item with the same block ID the ACTION link targets.
      kanbanEntries += `- ${actionText} ^${blockId}\n[[${file.basename}]]\n`;
      new Notice(`Adding auto action: ${actionText}`);
    }

    await this.app.vault.modify(file, newContent);

    // Insert the new action items after the "## ToDo" header.
    const kanbanContent = await this.app.vault.read(kanban);
    await this.app.vault.modify(
      kanban,
      kanbanContent.replace(/(##\s+ToDo\s*\n)/, `$1${kanbanEntries}`)
    );
  }
}
