import React from "react";
import { createRoot } from "react-dom/client";
import { DrawsciiApp, EditorHandle } from "../src/ui/DrawsciiApp";
const state = window as unknown as {
  saved?: string;
  draft?: string | null;
  closed?: boolean;
  editor?: EditorHandle;
  failSave?: boolean;
  initial?: string;
};
createRoot(document.getElementById("root")!).render(
  <DrawsciiApp
    initialText={new URLSearchParams(location.search).get("initial") ?? ""}
    onReady={(handle) => {
      state.editor = handle;
    }}
    onSave={async (text) => {
      if (state.failSave) throw new Error("Simulated save failure");
      state.saved = text;
    }}
    onDraft={(text) => {
      state.draft = text;
    }}
    onCancel={() => {
      state.closed = true;
    }}
  />,
);
