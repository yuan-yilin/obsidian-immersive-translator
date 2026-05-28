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
  let currentUntrack: (() => void) | null = null;

  function cleanupTooltip(): void {
    currentAbort?.abort();
    currentTooltip?.remove();
    currentUntrack?.();
    currentTooltip = null;
    currentAbort = null;
    currentUntrack = null;
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

    // The tooltip only closes when:
    // 1. The mouse has left BOTH the tooltip and the selected area, AND
    // 2. The user clicks outside those areas.
    let mouseInTooltip = false;
    let mouseWasOutside = false;

    dom.addEventListener("mouseenter", () => { mouseInTooltip = false; mouseWasOutside = false; });
    dom.addEventListener("mouseleave", () => { mouseInTooltip = true; });

    /**
     * Track whether the mouse is currently outside both the tooltip and
     * the selection rect.  We set mouseWasOutside only when the cursor
     * has left both regions.
     */
    const trackHover = (e: MouseEvent) => {
      const inSel = isInsideRect(e, rect);
      if (!inSel && mouseInTooltip) {
        mouseWasOutside = true;
      } else {
        mouseWasOutside = false;
      }
    };
    const untrack = () => document.removeEventListener("mousemove", trackHover);
    document.addEventListener("mousemove", trackHover);
    currentUntrack = untrack;

    /**
     * When the mouse is outside both regions, a click anywhere dismisses
     * the tooltip.  If the click lands inside the tooltip or the selection,
     * the tooltip stays.
     */
    const dismissOnOutsideClick = (e: MouseEvent) => {
      if (!mouseWasOutside) return;
      if (currentTooltip !== dom) return;
      if (isInsideRect(e, rect)) return;
      if (dom.contains(e.target as Node)) return;
      removeTooltip();
    };
    plugin.registerDomEvent(document, "mousedown", dismissOnOutsideClick);

    function removeTooltip(): void {
      untrack();
      currentUntrack = null;
      dom.remove();
      if (currentTooltip === dom) {
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
