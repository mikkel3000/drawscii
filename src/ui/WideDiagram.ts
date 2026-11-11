import { MarkdownRenderChild } from "obsidian";

/** Expand only the rendered drawing, leaving the note's text column intact. */
export class WideDiagram extends MarkdownRenderChild {
  constructor(
    private host: HTMLElement,
    private figure: HTMLElement,
  ) {
    super(figure);
  }

  onload() {
    const pane = this.host.closest<HTMLElement>(
      ".markdown-preview-view, .cm-scroller",
    );
    // Embedded notes and callouts have their own layout boundaries.
    if (
      !pane ||
      this.host.closest(".markdown-embed, .callout, blockquote, li, td")
    )
      return;
    const win = this.host.ownerDocument.defaultView!;
    const update = () => {
      const column = this.host.getBoundingClientRect();
      const view = pane.getBoundingClientRect();
      let left = view.left + pane.clientLeft + 24;
      let right = view.left + pane.clientLeft + pane.clientWidth - 24;
      // Respect theme wrappers that intentionally clip their contents.
      for (
        let parent = this.host.parentElement;
        parent && parent !== pane;
        parent = parent.parentElement
      ) {
        if (win.getComputedStyle(parent).overflowX !== "visible") {
          const bounds = parent.getBoundingClientRect();
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
      }
      const extra = Math.max(
        0,
        Math.floor(Math.min(column.left - left, right - column.right)),
      );
      this.figure.style.setProperty("--drawscii-gutter", `${extra}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    observer.observe(this.host);
    this.register(() => observer.disconnect());
    this.registerDomEvent(win, "resize", update);
    update();
  }
}
