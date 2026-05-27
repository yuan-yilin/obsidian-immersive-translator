import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type ImmersiveTranslatorPlugin from "../main";
import { translateTextStreaming } from "./translation/translator";
import { LANGUAGE_NAMES } from "./translation/languages";

export const SIDEBAR_VIEW_TYPE = "immersive-translator-sidebar";

export class TranslatorSidebarView extends ItemView {
  plugin: ImmersiveTranslatorPlugin;
  private inputEl!: HTMLTextAreaElement;
  private outputEl!: HTMLDivElement;
  private sourceLangEl!: HTMLSelectElement;
  private targetLangEl!: HTMLSelectElement;
  private translateBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private loadingEl!: HTMLDivElement;
  private abortController: AbortController | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ImmersiveTranslatorPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "沉浸式翻译";
  }

  getIcon(): string {
    return "languages";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("translator-sidebar");

    const header = container.createDiv("translator-sidebar-header");
    header.createSpan({ text: "Immersive Translator", cls: "translator-sidebar-title" });

    const scrollBody = container.createDiv("translator-sidebar-scroll");
    const langRow = scrollBody.createDiv("translator-lang-row");

    const sourceGroup = langRow.createDiv("translator-lang-group");
    sourceGroup.createSpan({ text: "源语言" });
    this.sourceLangEl = sourceGroup.createEl("select", { cls: "translator-lang-select" });
    for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
      const option = this.sourceLangEl.createEl("option", { text: name });
      option.value = code;
      option.selected = code === this.plugin.settings.sourceLang;
    }

    const swapBtn = langRow.createEl("button", { cls: "translator-swap-btn", text: "⇄" });
    swapBtn.setAttribute("aria-label", "交换语言");
    swapBtn.addEventListener("click", () => this.swapLanguages());

    const targetGroup = langRow.createDiv("translator-lang-group");
    targetGroup.createSpan({ text: "目标语言" });
    this.targetLangEl = targetGroup.createEl("select", { cls: "translator-lang-select" });
    for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
      if (code === "auto") continue;
      const option = this.targetLangEl.createEl("option", { text: name });
      option.value = code;
      option.selected = code === this.plugin.settings.targetLang;
    }

    const inputSection = scrollBody.createDiv("translator-input-section");
    inputSection.createSpan({ text: "输入文本", cls: "translator-section-label" });
    this.inputEl = inputSection.createEl("textarea", {
      cls: "translator-input",
      attr: { placeholder: "输入或粘贴要翻译的文本..." },
    });
    this.inputEl.addEventListener("input", () => this.autoResize());
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.doTranslate();
      }
    });

    const btnRow = scrollBody.createDiv("translator-btn-row");
    this.translateBtn = btnRow.createEl("button", { cls: "translator-translate-btn", text: "翻译" });
    this.translateBtn.addEventListener("click", () => this.doTranslate());

    this.stopBtn = btnRow.createEl("button", { cls: "translator-stop-btn", text: "停止" });
    this.stopBtn.disabled = true;
    this.stopBtn.addEventListener("click", () => this.abortController?.abort());

    const clearBtn = btnRow.createEl("button", { cls: "translator-clear-btn", text: "清空" });
    clearBtn.addEventListener("click", () => this.clearAll());

    this.loadingEl = scrollBody.createDiv("translator-loading");
    this.loadingEl.textContent = "翻译中...";
    this.loadingEl.style.display = "none";

    const outputSection = scrollBody.createDiv("translator-output-section");
    const outputHeader = outputSection.createDiv("translator-output-header");
    outputHeader.createSpan({ text: "翻译结果", cls: "translator-section-label" });
    const copyBtn = outputHeader.createEl("button", { cls: "translator-copy-btn", text: "复制" });
    copyBtn.addEventListener("click", () => this.copyOutput());

    this.outputEl = outputSection.createDiv("translator-output");
  }

  async onClose(): Promise<void> {
    this.abortController?.abort();
  }

  private async doTranslate(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) {
      new Notice("请输入要翻译的文本");
      return;
    }
    if (this.abortController) return;

    this.abortController = new AbortController();
    this.translateBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.translateBtn.textContent = "翻译中...";
    this.loadingEl.style.display = "flex";
    this.outputEl.empty();

    const config = this.plugin.getTranslatorConfig({
      sourceLang: this.sourceLangEl.value,
      targetLang: this.targetLangEl.value,
    });

    try {
      const result = await translateTextStreaming(config, text, (accumulatedText) => {
        this.outputEl.textContent = accumulatedText;
        this.outputEl.scrollTop = this.outputEl.scrollHeight;
      }, { signal: this.abortController.signal });

      if (!result) {
        this.outputEl.textContent = "(翻译结果为空)";
      }
    } catch (error) {
      this.outputEl.empty();
      this.outputEl.createDiv({
        cls: "translator-error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.abortController = null;
      this.translateBtn.disabled = false;
      this.stopBtn.disabled = true;
      this.translateBtn.textContent = "翻译";
      this.loadingEl.style.display = "none";
    }
  }

  private swapLanguages(): void {
    const sourceValue = this.sourceLangEl.value;
    const targetValue = this.targetLangEl.value;
    if (sourceValue === "auto") {
      new Notice("自动检测不能作为目标语言");
      return;
    }
    this.sourceLangEl.value = targetValue;
    this.targetLangEl.value = sourceValue;
  }

  private clearAll(): void {
    this.inputEl.value = "";
    this.outputEl.empty();
    this.inputEl.style.height = "auto";
  }

  private async copyOutput(): Promise<void> {
    const text = this.outputEl.textContent ?? "";
    if (!text.trim()) {
      new Notice("没有可复制的内容");
      return;
    }
    await navigator.clipboard.writeText(text);
    new Notice("已复制到剪贴板");
  }

  private autoResize(): void {
    this.inputEl.style.height = "auto";
    this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 300)}px`;
  }
}
