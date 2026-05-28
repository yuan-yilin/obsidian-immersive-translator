import { MarkdownView, Plugin } from "obsidian";
import { ClaudeCliResolver } from "./src/claude/ClaudeCliResolver";
import { registerCommands, translateFullDocument, translateSelection } from "./src/commands";
import { createHoverTranslationExtension, registerReadingHoverTranslation } from "./src/hover";
import { TranslatorSettingTab, DEFAULT_SETTINGS, PluginSettings } from "./src/settings";
import { SIDEBAR_VIEW_TYPE, TranslatorSidebarView } from "./src/sidebar";
import { TranslatorConfig } from "./src/translation/translator";
import { getVaultPath } from "./src/utils/path";

export default class ImmersiveTranslatorPlugin extends Plugin {
  settings!: PluginSettings;
  private cliResolver = new ClaudeCliResolver();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new TranslatorSettingTab(this.app, this));

    this.registerView(
      SIDEBAR_VIEW_TYPE,
      (leaf) => new TranslatorSidebarView(leaf, this),
    );

    this.registerEditorExtension([
      createHoverTranslationExtension(this),
    ]);

    registerReadingHoverTranslation(this);

    registerCommands(this);

    this.addRibbonIcon("languages", "Immersive Translator", () => {
      this.activateSidebar();
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (editor.getSelection()) {
          menu.addItem((item) => {
            item
              .setTitle("翻译选中文本")
              .setIcon("languages")
              .onClick(() => translateSelection(this, editor));
          });
        }

        menu.addItem((item) => {
          item
            .setTitle("翻译全文")
            .setIcon("book-open")
            .onClick(() => translateFullDocument(this, editor));
        });
      }),
    );
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.cliResolver.reset();
  }

  getResolvedClaudePath(): string | null {
    return this.cliResolver.resolve(
      this.settings.claudePath,
      this.settings.autoDetectClaudePath,
      process.env.PATH ?? "",
    );
  }

  getTranslatorConfig(overrides: Partial<Pick<TranslatorConfig, "sourceLang" | "targetLang">> = {}): TranslatorConfig {
    const vaultPath = getVaultPath(this.app);
    return {
      claudePath: this.getResolvedClaudePath(),
      model: this.settings.model,
      sourceLang: overrides.sourceLang ?? this.settings.sourceLang,
      targetLang: overrides.targetLang ?? this.settings.targetLang,
      preserveMarkdown: this.settings.preserveMarkdown,
      chunkSize: this.settings.chunkSize,
      vaultPath,
    };
  }

  async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;

    await leaf.setViewState({
      type: SIDEBAR_VIEW_TYPE,
      active: true,
    });

    const [newLeaf] = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (newLeaf) {
      this.app.workspace.revealLeaf(newLeaf);
    }
  }

  getActiveMarkdownEditor() {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null;
  }
}

