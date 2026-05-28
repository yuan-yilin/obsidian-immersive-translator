import { App, Editor, MarkdownView, Modal, Notice, TFile } from "obsidian";
import type ImmersiveTranslatorPlugin from "../main";
import { getLanguageName } from "./translation/languages";
import { splitTextIntoChunks } from "./translation/chunking";
import { translateText } from "./translation/translator";

export async function translateSelection(plugin: ImmersiveTranslatorPlugin, editor: Editor): Promise<void> {
  const selection = editor.getSelection();
  if (!selection) {
    new Notice("请先选中要翻译的文本");
    return;
  }

  const notice = new Notice("翻译中...", 0);
  try {
    const result = await translateText(plugin.getTranslatorConfig(), selection.trim());
    notice.hide();
    new TranslationResultModal(plugin.app, selection.trim(), result).open();
  } catch (error) {
    notice.hide();
    new Notice(`翻译失败: ${error instanceof Error ? error.message : String(error)}`, 6000);
  }
}

/**
 * Resolve the document content and file target for full-document translation.
 * When an editor is available, read from it; otherwise fall back to the active
 * Markdown TFile and read from the vault.
 */
async function resolveFullDocTarget(
  plugin: ImmersiveTranslatorPlugin,
  editor: Editor | undefined,
): Promise<{ content: string; file: TFile | null; kind: "editor" | "file"; editor?: Editor }> {
  const activeFile = plugin.app.workspace.getActiveFile();

  if (editor) {
    const content = editor.getValue();
    if (!content.trim()) {
      throw new Error("文档为空，无法翻译");
    }
    return { content, file: activeFile, kind: "editor", editor };
  }

  if (!activeFile || activeFile.extension !== "md") {
    throw new Error("当前未打开有效的 Markdown 文件");
  }

  const content = await plugin.app.vault.cachedRead(activeFile);
  if (!content.trim()) {
    throw new Error("文档为空，无法翻译");
  }

  return { content, file: activeFile, kind: "file" };
}

export async function translateFullDocument(plugin: ImmersiveTranslatorPlugin, editor?: Editor): Promise<void> {
  let target: Awaited<ReturnType<typeof resolveFullDocTarget>>;
  try {
    target = await resolveFullDocTarget(plugin, editor);
  } catch (error) {
    new Notice(error instanceof Error ? error.message : String(error), 6000);
    return;
  }

  if (plugin.settings.fullDocumentMode === "replace") {
    await translateFullDocReplace(plugin, target);
    return;
  }

  if (plugin.settings.fullDocumentMode === "new-file") {
    await translateFullDocNewFile(plugin, target);
    return;
  }

  new FullDocTranslateModal(plugin, target).open();
}

async function translateFullDocReplace(
  plugin: ImmersiveTranslatorPlugin,
  target: { content: string; file: TFile | null; kind: "editor" | "file"; editor?: Editor },
): Promise<void> {
  const abortController = new AbortController();
  const progress = new TranslationProgressModal(plugin.app, abortController);
  progress.open();

  try {
    const result = await translateFullContent(plugin, target.content, abortController, progress);

    if (target.kind === "editor" && target.editor) {
      target.editor.setValue(result);
    } else if (target.file) {
      await plugin.app.vault.modify(target.file, result);
    }

    progress.close();
    new Notice("全文翻译完成");
  } catch (error) {
    progress.close();
    new Notice(`翻译失败: ${error instanceof Error ? error.message : String(error)}`, 6000);
  }
}

async function translateFullDocNewFile(
  plugin: ImmersiveTranslatorPlugin,
  target: { content: string; file: TFile | null; kind: "editor" | "file"; editor?: Editor },
): Promise<void> {
  const abortController = new AbortController();
  const progress = new TranslationProgressModal(plugin.app, abortController);
  progress.open();

  try {
    const result = await translateFullContent(plugin, target.content, abortController, progress);
    const finalPath = await createTranslatedFile(plugin, target.file, result);
    progress.close();
    new Notice(`翻译完成，已保存为: ${finalPath.split("/").pop()}`);

    const newFile = plugin.app.vault.getAbstractFileByPath(finalPath);
    if (newFile instanceof TFile) {
      await plugin.app.workspace.getLeaf().openFile(newFile);
    }
  } catch (error) {
    progress.close();
    new Notice(`翻译失败: ${error instanceof Error ? error.message : String(error)}`, 6000);
  }
}

async function translateFullContent(
  plugin: ImmersiveTranslatorPlugin,
  content: string,
  abortController: AbortController,
  progress: TranslationProgressModal,
): Promise<string> {
  const config = plugin.getTranslatorConfig();
  const chunks = splitTextIntoChunks(content, config.chunkSize);
  const translated: string[] = [];

  progress.update(0, chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    if (abortController.signal.aborted) {
      throw new Error("翻译已取消");
    }

    const result = await translateText(config, chunks[i], { signal: abortController.signal });
    translated.push(result);
    progress.update(i + 1, chunks.length);
  }

  return translated.join("");
}

async function createTranslatedFile(
  plugin: ImmersiveTranslatorPlugin,
  currentFile: TFile | null,
  content: string,
): Promise<string> {
  const baseName = currentFile?.basename ?? "translated";
  const folderPath = currentFile?.parent?.path ?? "";
  const langName = getLanguageName(plugin.settings.targetLang);
  const fileName = `${baseName} (${langName}).md`;
  let finalPath = folderPath ? `${folderPath}/${fileName}` : fileName;

  if (plugin.app.vault.getAbstractFileByPath(finalPath)) {
    let counter = 1;
    do {
      const candidateName = `${baseName} (${langName}) ${counter}.md`;
      finalPath = folderPath ? `${folderPath}/${candidateName}` : candidateName;
      counter++;
    } while (plugin.app.vault.getAbstractFileByPath(finalPath));
  }

  await plugin.app.vault.create(finalPath, content);
  return finalPath;
}

class TranslationResultModal extends Modal {
  constructor(
    app: App,
    private original: string,
    private translated: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("translator-modal");

    contentEl.createDiv({ cls: "translator-modal-title", text: "翻译结果" });
    contentEl.createDiv({ cls: "translator-modal-section-label", text: "原文" });
    contentEl.createDiv({ cls: "translator-modal-text", text: this.original });
    contentEl.createDiv({ cls: "translator-modal-section-label", text: "译文" });
    contentEl.createDiv({ cls: "translator-modal-text translator-modal-translated", text: this.translated });

    const btnRow = contentEl.createDiv({ cls: "translator-modal-buttons" });

    btnRow.createEl("button", { text: "复制译文" }).addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.translated);
      new Notice("已复制到剪贴板");
    });

    btnRow.createEl("button", { text: "替换原文" }).addEventListener("click", () => {
      const markdownEditor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (!markdownEditor) {
        new Notice("未找到当前编辑器");
        return;
      }
      markdownEditor.replaceSelection(this.translated);
      new Notice("已替换原文");
      this.close();
    });

    btnRow.createEl("button", { text: "插入到下方" }).addEventListener("click", () => {
      const markdownEditor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (!markdownEditor) {
        new Notice("未找到当前编辑器");
        return;
      }
      markdownEditor.replaceSelection(`${this.original}\n\n${this.translated}`);
      new Notice("已插入译文");
      this.close();
    });

    btnRow.createEl("button", { text: "关闭" }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

type FullDocTarget = {
  content: string;
  file: TFile | null;
  kind: "editor" | "file";
  editor?: Editor;
};

class FullDocTranslateModal extends Modal {
  constructor(
    private plugin: ImmersiveTranslatorPlugin,
    private target: FullDocTarget,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("translator-fdl-modal");
    contentEl.createEl("h2", { text: "全文翻译" });
    contentEl.createEl("p", {
      text: `源语言: ${getLanguageName(this.plugin.settings.sourceLang)} → 目标语言: ${getLanguageName(this.plugin.settings.targetLang)}`,
    });
    contentEl.createEl("p", {
      cls: "translator-fdl-warning",
      text: `将翻译约 ${this.target.content.length} 个字符，可能需要一些时间。`,
    });

    const btnRow = contentEl.createDiv({ cls: "translator-fdl-buttons" });
    btnRow.createEl("button", { text: "替换原文" }).addEventListener("click", async () => {
      this.close();
      await translateFullDocReplace(this.plugin, this.target);
    });
    btnRow.createEl("button", { text: "创建新文件" }).addEventListener("click", async () => {
      this.close();
      await translateFullDocNewFile(this.plugin, this.target);
    });
    btnRow.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class TranslationProgressModal extends Modal {
  private statusEl!: HTMLDivElement;

  constructor(app: App, private abortController: AbortController) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("translator-progress-modal");
    contentEl.createEl("h2", { text: "正在翻译" });
    this.statusEl = contentEl.createDiv({ cls: "translator-progress-text", text: "准备中..." });
    const actionRow = contentEl.createDiv({ cls: "translator-progress-actions" });
    actionRow.createEl("button", { text: "停止" }).addEventListener("click", () => {
      this.abortController.abort();
      this.statusEl.textContent = "正在停止...";
    });
  }

  update(completed: number, total: number): void {
    if (this.statusEl) {
      this.statusEl.textContent = `进度: ${completed}/${total}`;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function registerCommands(plugin: ImmersiveTranslatorPlugin): void {
  plugin.addCommand({
    id: "translate-selection",
    name: "翻译选中文本",
    icon: "languages",
    editorCallback: (editor) => translateSelection(plugin, editor),
  });

  plugin.addCommand({
    id: "translate-full-document",
    name: "翻译全文",
    icon: "book-open",
    callback: async () => {
      const editor = plugin.getActiveMarkdownEditor();
      await translateFullDocument(plugin, editor ?? undefined);
    },
  });

  plugin.addCommand({
    id: "translate-full-doc-replace",
    name: "翻译全文（替换原文）",
    icon: "pencil",
    callback: async () => {
      const editor = plugin.getActiveMarkdownEditor();
      const target = await resolveFullDocTarget(plugin, editor ?? undefined);
      await translateFullDocReplace(plugin, target);
    },
  });

  plugin.addCommand({
    id: "translate-full-doc-new-file",
    name: "翻译全文（创建新文件）",
    icon: "file-plus",
    callback: async () => {
      const editor = plugin.getActiveMarkdownEditor();
      const target = await resolveFullDocTarget(plugin, editor ?? undefined);
      await translateFullDocNewFile(plugin, target);
    },
  });

  plugin.addCommand({
    id: "open-translator-sidebar",
    name: "打开翻译侧边栏",
    icon: "panel-right",
    callback: () => plugin.activateSidebar(),
  });
}
