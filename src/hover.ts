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
          return { dom, destroy: createDestroy(null, dom) };
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
          destroy: createDestroy(abortController, dom),
        };
      },
    };
  }, { hoverTime: plugin.settings.hoverDelay });
}

/**
 * Return a destroy function that keeps the tooltip alive while the mouse
 * hovers over the tooltip element itself.  The tooltip only closes once
 * the mouse has left both the selection AND the tooltip DOM.
 */
function createDestroy(
  abortController: AbortController | null,
  dom: HTMLElement,
): () => void {
  let mouseInTooltip = false;
  let pending = false;

  dom.addEventListener("mouseenter", () => {
    mouseInTooltip = true;
  });

  dom.addEventListener("mouseleave", () => {
    mouseInTooltip = false;
    if (pending) {
      dom.remove();
    }
  });

  return () => {
    abortController?.abort();
    if (mouseInTooltip) {
      pending = true;
      return;
    }
    dom.remove();
  };
}

/**
 * Register DOM-level hover translation for Obsidian reading/preview mode.
 * Uses window.getSelection() and a floating tooltip instead of CodeMirror.
 */
export function registerReadingHoverTranslation(plugin: ImmersiveTranslatorPlugin): void {
  let currentAbort: AbortController | null = null;
  let currentTooltip: HTMLElement | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let cachedText = "";
  let cachedTranslation = "";

  function cleanupTooltip(): void {
    currentAbort?.abort();
    currentTooltip?.remove();
    currentTooltip = null;
    currentAbort = null;
  }

  function hideTooltip(): void {
    currentTooltip?.remove();
    currentTooltip = null;
  }

  function showTooltip(text: string, rect: DOMRect): void {
    cleanupTooltip();

    const dom = document.createElement("div");
    dom.className = "translator-reading-tooltip";
    dom.textContent = text;

    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    let left = rect.right;
    let top = rect.bottom + 8;

    if (left + 320 > viewWidth) {
      left = Math.max(8, viewWidth - 330);
    }
    if (top + 100 > viewHeight) {
      top = rect.top - 8;
      dom.style.bottom = "100%";
    }

    dom.style.left = `${left}px`;
    dom.style.top = `${top}px`;
    dom.style.maxWidth = "320px";

    document.body.appendChild(dom);
    currentTooltip = dom;

    // The tooltip only closes when the mouse has left BOTH the tooltip
    // and the selected text area.  We track both regions independently.
    let mouseInTooltip = false;
    let mouseInSelection = false;

    dom.addEventListener("mouseenter", () => { mouseInTooltip = true; });
    dom.addEventListener("mouseleave", () => {
      mouseInTooltip = false;
      tryRemove(dom);
    });

    // Attach a temporary mousemove listener to the document so we know
    // whether the cursor is currently inside the selection rect.
    const trackSelection = (e: MouseEvent) => {
      mouseInSelection = isInsideRect(e, rect);
    };
    plugin.registerDomEvent(document, "mousemove", trackSelection);

    // Try removing once the 60s timeout fires.
    const autoHideId = setTimeout(() => tryRemove(dom), 60_000);

    /**
     * Remove the tooltip only when the mouse is outside BOTH regions.
     */
    function tryRemove(domRef: HTMLElement): void {
      if (currentTooltip !== domRef) return;
      if (mouseInTooltip || mouseInSelection) return;
      removeTooltip(domRef);
    }

    function removeTooltip(domRef: HTMLElement): void {
      clearTimeout(autoHideId);
      domRef.remove();
      if (currentTooltip === domRef) {
        currentTooltip = null;
        currentAbort = null;
      }
    }
  }

  function handleSelection(): void {
    if (!plugin.settings.enableHover) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideTooltip();
      return;
    }

    const selectedText = sel.toString().trim();
    if (selectedText.length < 2 || selectedText.length > plugin.settings.hoverMaxChars) {
      hideTooltip();
      return;
    }

    const activeLeaves = plugin.app.workspace.getLeavesOfType("markdown");
    if (activeLeaves.length === 0) return;

    const activeLeaf = activeLeaves[0];
    const viewDom = (activeLeaf.view as any).containerEl;
    if (!viewDom) return;

    const range = sel.getRangeAt(0);
    if (!viewDom.contains(range.commonAncestorContainer)) return;

    if (selectedText === cachedText && cachedTranslation) {
      showTooltip(cachedTranslation, range.getBoundingClientRect());
      return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentAbort?.abort();
      const abortController = new AbortController();
      currentAbort = abortController;

      showTooltip("翻译中...", range.getBoundingClientRect());

      translateText(plugin.getTranslatorConfig(), selectedText, { signal: abortController.signal })
        .then((translation) => {
          cachedText = selectedText;
          cachedTranslation = translation;
          if (!abortController.signal.aborted && currentTooltip) {
            currentTooltip.textContent = translation;
          }
        })
        .catch((error) => {
          if (!abortController.signal.aborted && currentTooltip) {
            currentTooltip.textContent = error instanceof Error ? error.message : String(error);
          }
        });
    }, plugin.settings.hoverDelay);
  }

  plugin.registerDomEvent(window, "mouseup", handleSelection);
  plugin.registerDomEvent(window, "selectionchange", handleSelection);

  plugin.registerDomEvent(window, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanupTooltip();
    }
  });
}

/**
 * Check whether a mouse event falls inside a DOM rect.
 */
function isInsideRect(e: MouseEvent, rect: DOMRect): boolean {
  return (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  );
}
