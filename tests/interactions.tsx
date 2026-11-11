import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { DrawsciiApp, EditorHandle } from "../src/ui/DrawsciiApp";

async function editor(initialText = "", draft?: string, standalone = false) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLCanvasElement",
    "Node",
    "MutationObserver",
    "Event",
    "KeyboardEvent",
  ] as const)
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? w : w[key],
      configurable: true,
      writable: true,
    });
  Object.defineProperty(globalThis, "navigator", {
    value: w.navigator,
    configurable: true,
  });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const ctx = new Proxy(
    { font: "", textBaseline: "", measureText: () => ({ width: 8.4 }) },
    { get: (t, k) => (k in t ? (t as any)[k] : () => {}) },
  );
  w.HTMLCanvasElement.prototype.getContext = (() => ctx) as any;
  w.HTMLCanvasElement.prototype.setPointerCapture = () => {};
  w.HTMLCanvasElement.prototype.hasPointerCapture = () => false;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 600,
    width: 1000,
    height: 600,
    toJSON() {},
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(w.document.getElementById("root")!);
  let handle!: EditorHandle,
    saved: string | undefined,
    savedDraft: string | null | undefined,
    closed = false,
    fail = false;
  await act(async () =>
    root.render(
      <DrawsciiApp
        initialText={initialText}
        draft={draft}
        standalone={standalone}
        onReady={(h) => {
          handle = h;
        }}
        onSave={async (value) => {
          if (fail) throw new Error("Save failed");
          saved = value;
        }}
        onCancel={() => {
          closed = true;
        }}
        onDraft={(value) => {
          savedDraft = value;
        }}
      />,
    ),
  );
  const canvas = w.document.querySelector("canvas")!;
  async function pointer(
    type: string,
    row: number,
    col: number,
    extra: Record<string, unknown> = {},
  ) {
    const e = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      clientX: (col + 0.5) * 8.4,
      clientY: (row + 0.5) * 18,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...extra,
    });
    await act(async () => canvas.dispatchEvent(e));
  }
  async function drag(r: number, c: number, r2: number, c2: number) {
    await pointer("pointerdown", r, c);
    await pointer("pointermove", r2, c2);
    await pointer("pointerup", r2, c2);
  }
  async function button(name: string) {
    const button = Array.from(w.document.querySelectorAll("button")).find(
      (b) => b.textContent === name,
    )!;
    assert.ok(button, `button ${name} exists`);
    await act(async () => button.click());
  }
  async function key(key: string, extra: Record<string, unknown> = {}) {
    await act(async () =>
      (w.document.activeElement === w.document.body
        ? canvas
        : w.document.activeElement!
      ).dispatchEvent(
        new w.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...extra,
        }),
      ),
    );
  }
  return {
    w,
    canvas,
    pointer,
    drag,
    button,
    key,
    get text() {
      return handle.getText();
    },
    get saved() {
      return saved;
    },
    get draft() {
      return savedDraft;
    },
    get closed() {
      return closed;
    },
    fail() {
      fail = true;
    },
    async dispose() {
      await act(async () => root.unmount());
      dom.window.close();
    },
    async type(value: string) {
      const input = w.document.querySelector("textarea")!;
      input.value = value;
      await act(async () =>
        input.dispatchEvent(new w.Event("input", { bubbles: true })),
      );
    },
    async paste(value: string) {
      const e = new w.Event("paste", { bubbles: true, cancelable: true });
      Object.assign(e, { clipboardData: { getData: () => value } });
      await act(async () => canvas.dispatchEvent(e));
    },
  };
}
test("editor draws, labels, groups undo and saves without closing", async () => {
  const e = await editor();
  try {
    await e.drag(2, 2, 7, 20);
    assert.ok(e.text.includes("┌"));
    await e.button("TextT");
    await e.pointer("pointerdown", 4, 5);
    await e.pointer("pointerup", 4, 5);
    await e.type("Hello");
    assert.ok(e.text.includes("Hello"));
    await e.key("z", { ctrlKey: true });
    assert.ok(!e.text.includes("Hello"));
    await e.key("z", { ctrlKey: true, shiftKey: true });
    assert.ok(e.text.includes("Hello"));
    await e.key("s", { metaKey: true });
    assert.equal(e.saved, e.text);
    assert.equal(e.closed, false);
  } finally {
    await e.dispose();
  }
});
test("floating paste waits for placement then selection nudges and duplicates", async () => {
  const e = await editor();
  try {
    await e.paste("XYZ");
    assert.equal(e.text, "");
    await e.pointer("pointermove", 3, 5);
    await e.pointer("pointerdown", 3, 5);
    await e.pointer("pointerup", 3, 5);
    assert.equal(e.text, "\n\n\n     XYZ");
    await e.key("ArrowRight");
    assert.equal(e.text, "\n\n\n      XYZ");
    await e.key("d", { ctrlKey: true });
    await e.key("Enter");
    assert.equal(String(e.text).match(/XYZ/g)?.length, 2);
  } finally {
    await e.dispose();
  }
});
test("close offers discard confirmation and failed saves preserve work", async () => {
  const e = await editor();
  try {
    await e.drag(1, 1, 4, 12);
    await e.button("Close");
    assert.ok(e.w.document.querySelector('[role="alertdialog"]'));
    assert.equal(e.closed, false);
    await e.button("Keep editing");
    e.fail();
    await e.button("Save");
    assert.ok(
      e.w.document
        .querySelector('[role="alert"]')
        ?.textContent?.includes("Save failed"),
    );
    assert.ok(e.text.includes("┌"));
    await e.button("Close");
    await e.button("Discard changes");
    assert.equal(e.closed, true);
    assert.equal(e.draft, null);
  } finally {
    await e.dispose();
  }
});
test("box handles resize and center a label", async () => {
  const e = await editor(
    "\n\n  ┌─────────────┐\n  │ Hi          │\n  │             │\n  └─────────────┘",
  );
  try {
    await e.button("SelectV");
    await e.drag(2, 2, 5, 16);
    await e.button("Center label");
    assert.ok(e.text.includes("│     Hi      │"));
    await e.drag(5, 16, 7, 20);
    assert.equal(e.text.split("\n")[7][20], "┘");
  } finally {
    await e.dispose();
  }
});
test("recover draft, preview plain text, and cancel a paste with Escape", async () => {
  const e = await editor("old", "recovered");
  try {
    assert.equal(e.text, "recovered");
    await e.button("Preview");
    assert.equal(
      (
        e.w.document.querySelector(
          '[aria-label="Plain-text diagram"]',
        ) as HTMLTextAreaElement
      ).value,
      "recovered",
    );
    await e.button("Back to drawing");
    await e.paste("discard");
    await e.key("Escape");
    assert.equal(e.text, "recovered");
  } finally {
    await e.dispose();
  }
});

test("waypoint connector commits once, and Escape cancels its preview", async () => {
  const e = await editor();
  try {
    await e.button("ArrowA");
    const checkbox = Array.from(
      e.w.document.querySelectorAll('input[type="checkbox"]'),
    ).find((c) =>
      c.parentElement?.textContent?.includes("Waypoints"),
    ) as HTMLInputElement;
    await act(async () => checkbox.click());
    for (const [r, c] of [
      [2, 2],
      [2, 10],
      [6, 10],
    ]) {
      await e.pointer("pointerdown", r, c);
      await e.pointer("pointerup", r, c);
    }
    await e.pointer("pointermove", 6, 15);
    await e.key("Enter");
    assert.equal(e.text.split("\n")[6][15], "►");
    const committed = e.text;
    await e.pointer("pointerdown", 10, 2);
    await e.pointer("pointerup", 10, 2);
    await e.pointer("pointermove", 10, 10);
    await e.key("Escape");
    assert.equal(e.text, committed);
    await e.key("z", { ctrlKey: true });
    assert.equal(e.text, "");
  } finally {
    await e.dispose();
  }
});

test("zoom and pan use the transformed cell coordinates", async () => {
  const e = await editor();
  try {
    const wheel = new e.w.Event("wheel", { bubbles: true, cancelable: true });
    Object.assign(wheel, {
      clientX: 0,
      clientY: 0,
      deltaX: 0,
      deltaY: -Math.log(2) / 0.01,
      deltaMode: 0,
      ctrlKey: true,
      metaKey: false,
    });
    await act(async () => e.canvas.dispatchEvent(wheel));
    await e.drag(4, 4, 12, 20);
    assert.equal(e.text.split("\n")[2][2], "┌");
    assert.equal(e.text.split("\n")[6][10], "┘");
  } finally {
    await e.dispose();
  }
});

test("copy and cut populate the clipboard before removal", async () => {
  const e = await editor("abc");
  try {
    await e.button("Select all");
    let copied = "";
    const event = new e.w.Event("cut", { bubbles: true, cancelable: true });
    Object.assign(event, {
      clipboardData: {
        setData: (_type: string, value: string) => {
          copied = value;
        },
      },
    });
    await act(async () => e.canvas.dispatchEvent(event));
    assert.equal(copied, "abc");
    assert.equal(e.text, "");
    await e.key("z", { ctrlKey: true });
    assert.equal(e.text, "abc");
  } finally {
    await e.dispose();
  }
});

test("tool shortcuts work before the canvas is clicked", async () => {
  const pressed = (e: Awaited<ReturnType<typeof editor>>, label: string) =>
    [...e.w.document.querySelectorAll("button[aria-pressed]")]
      .find((b) => b.textContent?.startsWith(label))
      ?.getAttribute("aria-pressed");
  const press = (
    e: Awaited<ReturnType<typeof editor>>,
    target: Element,
    key: string,
  ) =>
    act(async () => {
      target.dispatchEvent(
        new e.w.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  // The editor takes focus when it opens, so a shortcut works straight away.
  const e = await editor();
  assert.equal(e.w.document.activeElement, e.canvas);
  await press(e, e.w.document.activeElement!, "l");
  assert.equal(pressed(e, "Line"), "true");
  // In the desktop app it also answers keys while nothing has focus.
  const d = await editor("", undefined, true);
  (d.w.document.activeElement as HTMLElement).blur();
  assert.equal(d.w.document.activeElement, d.w.document.body);
  await press(d, d.w.document.body, "a");
  assert.equal(pressed(d, "Arrow"), "true");
});
