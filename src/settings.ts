import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ImmersiveTranslatorPlugin from "../main";
import { findClaudeCLIPath } from "./claude/findClaudeCLIPath";
import { getLanguageName, LANGUAGE_NAMES } from "./translation/languages";
import { testClaudeCli } from "./translation/translator";

export interface PluginSettings {
  claudePath: string;
  autoDetectClaudePath: boolean;
  model: string;
  sourceLang: string;
  targetLang: string;
  preserveMarkdown: boolean;
  fullDocumentMode: "ask" | "replace" | "new-file";
  chunkSize: number;
  enableHover: boolean;
  hoverDelay: number;
  hoverMaxChars: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  claudePath: "",
  autoDetectClaudePath: true,
  model: "sonnet",
  sourceLang: "auto",
  targetLang: "zh",
  preserveMarkdown: true,
  fullDocumentMode: "ask",
  chunkSize: 3000,
  enableHover: false,
  hoverDelay: 900,
  hoverMaxChars: 1200,
};

const LANGUAGE_OPTIONS = Object.entries(LANGUAGE_NAMES);

export class TranslatorSettingTab extends PluginSettingTab {
  plugin: ImmersiveTranslatorPlugin;

  constructor(app: App, plugin: ImmersiveTranslatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Immersive Translator 设置" });
    containerEl.createEl("h3", { text: "Claude CLI" });

    new Setting(containerEl)
      .setName("Claude CLI 路径")
      .setDesc("留空时将自动检测本机 claude 命令。")
      .addText((text) => {
        text
          .setPlaceholder("/Users/me/.claude/local/claude")
          .setValue(this.plugin.settings.claudePath)
          .onChange(async (value) => {
            this.plugin.settings.claudePath = value.trim();
            await this.plugin.saveSettings();
          });
        return text;
      });

    new Setting(containerEl)
      .setName("自动检测 Claude CLI")
      .setDesc("启用后会搜索 PATH、Homebrew、Volta、asdf、npm、nvm 和 Claude 默认安装目录。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoDetectClaudePath)
        .onChange(async (value) => {
          this.plugin.settings.autoDetectClaudePath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("检测 CLI 路径")
      .setDesc("尝试自动查找 Claude CLI，并写入上面的路径。")
      .addButton((button) => button
        .setButtonText("检测")
        .onClick(async () => {
          const path = findClaudeCLIPath(process.env.PATH);
          if (!path) {
            new Notice("未找到 Claude CLI");
            return;
          }
          this.plugin.settings.claudePath = path;
          await this.plugin.saveSettings();
          new Notice(`已找到 Claude CLI: ${path}`);
          this.display();
        }));

    new Setting(containerEl)
      .setName("测试 Claude CLI")
      .setDesc("发送一句简短文本验证 Claude CLI 是否可以翻译。")
      .addButton((button) => button
        .setButtonText("测试")
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("测试中...");
          try {
            const result = await testClaudeCli(this.plugin.getTranslatorConfig());
            new Notice(`连接成功: ${result}`);
          } catch (error) {
            new Notice(`连接失败: ${error instanceof Error ? error.message : String(error)}`, 6000);
          } finally {
            button.setDisabled(false);
            button.setButtonText("测试");
          }
        }));

    new Setting(containerEl)
      .setName("模型")
      .setDesc("传给 Claude CLI 的模型名称，例如 sonnet、opus 或具体模型 ID。")
      .addText((text) => {
        text
          .setPlaceholder("sonnet")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim() || DEFAULT_SETTINGS.model;
            await this.plugin.saveSettings();
          });
        return text;
      });

    containerEl.createEl("h3", { text: "翻译设置" });

    const sourceSetting = new Setting(containerEl)
      .setName("源语言")
      .setDesc("选择自动检测或指定源语言。")
      .addDropdown((dropdown) => {
        for (const [code, name] of LANGUAGE_OPTIONS) {
          dropdown.addOption(code, name);
        }
        return dropdown
          .setValue(this.plugin.settings.sourceLang)
          .onChange(async (value) => {
            this.plugin.settings.sourceLang = value;
            await this.plugin.saveSettings();
          });
      });

    sourceSetting.setDesc(`当前: ${getLanguageName(this.plugin.settings.sourceLang)}`);

    new Setting(containerEl)
      .setName("目标语言")
      .setDesc("选择译文语言。")
      .addDropdown((dropdown) => {
        for (const [code, name] of LANGUAGE_OPTIONS) {
          if (code !== "auto") dropdown.addOption(code, name);
        }
        return dropdown
          .setValue(this.plugin.settings.targetLang)
          .onChange(async (value) => {
            this.plugin.settings.targetLang = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("保留 Markdown")
      .setDesc("提示 Claude 保留 Markdown、代码块、链接、frontmatter 和 Obsidian 语法。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.preserveMarkdown)
        .onChange(async (value) => {
          this.plugin.settings.preserveMarkdown = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("全文翻译默认模式")
      .setDesc("ask 会在每次全文翻译前弹窗选择。")
      .addDropdown((dropdown) => dropdown
        .addOption("ask", "每次询问")
        .addOption("replace", "替换原文")
        .addOption("new-file", "创建新文件")
        .setValue(this.plugin.settings.fullDocumentMode)
        .onChange(async (value) => {
          this.plugin.settings.fullDocumentMode = value as PluginSettings["fullDocumentMode"];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("分块字符数")
      .setDesc("长文档会按 Markdown 边界分块后顺序翻译。")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(this.plugin.settings.chunkSize))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed >= 500) {
              this.plugin.settings.chunkSize = parsed;
              await this.plugin.saveSettings();
            }
          });
        return text;
      });

    containerEl.createEl("h3", { text: "悬停翻译" });

    new Setting(containerEl)
      .setName("启用悬停翻译")
      .setDesc("选中文本后悬停显示译文。Claude CLI 启动较慢，默认关闭。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableHover)
        .onChange(async (value) => {
          this.plugin.settings.enableHover = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("悬停延迟")
      .setDesc("触发悬停翻译前等待的毫秒数。")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(this.plugin.settings.hoverDelay))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed >= 300) {
              this.plugin.settings.hoverDelay = parsed;
              await this.plugin.saveSettings();
            }
          });
        return text;
      });

    new Setting(containerEl)
      .setName("悬停最大字符数")
      .setDesc("超过该长度的选中文本不会触发悬停翻译。")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(this.plugin.settings.hoverMaxChars))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed >= 50) {
              this.plugin.settings.hoverMaxChars = parsed;
              await this.plugin.saveSettings();
            }
          });
        return text;
      });
  }
}
