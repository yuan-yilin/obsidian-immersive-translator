import { hoverTooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type ImmersiveTranslatorPlugin from "../main";
import { translateText } from "./translation/translator";

export function createHoverTranslationExtension(plugin: ImmersiveTranslatorPlugin): Extension {
  let cachedText = "";
  let cachedTranslation = "";
  let activeAbortController: AbortController | null = null;

  return hoverTooltip((view, pos) => {
    if (!plugin.settings.enableHover) return null;

    const selection = view.state.selection.main;
    if (selection.empty || pos < selection.from || pos > selection.to) return null;

    const selectedText = view.state.doc.sliceString(selection.from, selection.to).trim();
    if (selectedText.length < 2 || selectedText.length > plugin.settings.hoverMaxChars) return null;

    return {
      pos: selection.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "translator-hover-tooltip";

        if (selectedText === cachedText && cachedTranslation) {
          dom.textContent = cachedTranslation;
          return { dom };
        }

        activeAbortController?.abort();
        const abortController = new AbortController();
        activeAbortController = abortController;
        dom.textContent = "翻译中...";

        translateText(plugin.getTranslatorConfig(), selectedText, { signal: abortController.signal })
          .then((translation) => {
            cachedText = selectedText;
            cachedTranslation = translation;
            if (!abortController.signal.aborted) {
              dom.textContent = translation;
            }
          })
          .catch((error) => {
            if (!abortController.signal.aborted) {
              dom.textContent = error instanceof Error ? error.message : String(error);
            }
          });

        return {
          dom,
          destroy() {
            abortController.abort();
            if (activeAbortController === abortController) {
              activeAbortController = null;
            }
          },
        };
      },
    };
  }, { hoverTime: plugin.settings.hoverDelay });
}
