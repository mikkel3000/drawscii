# Obsidian ASCIIFlow — local fork

Draw and revise text diagrams inside Obsidian. Diagrams remain ordinary `asciiflow` code blocks in your Markdown notes.

## Start a drawing

Run **ASCIIFlow: Insert ASCII diagram** from the command palette. It inserts a block at the cursor and opens the editor. To edit an existing diagram:

- In Reading view and rendered Live Preview blocks, drawings appear as centered embeds without a code-block background. They expand beyond the readable text column into available pane space, while paragraphs keep their normal width. Oversized diagrams scroll horizontally; drawings inside callouts or embedded notes retain their container width. Hover or focus the drawing to reveal **Edit drawing** and **Open in pane** (always visible on touch devices). Double-click the drawing, or focus it and press Enter, to edit.
- Source mode and active Live Preview blocks still expose the underlying `asciiflow` code fence for text editing.
- In the note editor, put the cursor inside a diagram and run **ASCIIFlow: Edit ASCII diagram at cursor**.

You can also write a block manually:

````markdown
```asciiflow
┌────────────┐
│ Start here │
└────────────┘
```
````

## Drawing controls

| Action                                      | How                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Select, Box, Line, Arrow, Text, Draw, Erase | Toolbar or S, B, L, A, T, F, E when not typing a label                                                                                |
| Place accurately                            | Hover highlights the target cell; Draw previews its character                                                                         |
| Connect shapes                              | Lines merge into corners, tees and crossings automatically                                                                            |
| Change a connector bend                     | Drag following the desired path; corners follow deliberate turns. Hold Shift for a fixed vertical-first bend                          |
| Multiple connector bends                    | Enable **Waypoints**, click successive points, hover the final endpoint and press Enter; Escape cancels                               |
| Label a diagram                             | Double-click, or select Text and click; Enter keeps the starting column                                                               |
| Center a label                              | Select a label inside a box or select the whole box, then **Center label** / C                                                        |
| Move a selection                            | Drag inside it, or use arrow keys; Shift nudges ten cells                                                                             |
| Duplicate                                   | Cmd/Ctrl-drag, or Cmd/Ctrl+D / **Duplicate** then position and click/Enter. Escape cancels; Alt+arrow keys copy while nudging         |
| Paste                                       | Cmd/Ctrl+V, move the floating preview, then click or Enter; Escape cancels. Red cells indicate existing content that will be replaced |
| Resize a box                                | Select its exact bounds; drag a corner handle. Resizing refuses to crop labels                                                        |
| Move arrow endpoints                        | Select a simple arrow's exact bounds; drag an endpoint handle                                                                         |
| Erase                                       | Drag with Erase; select a 1-, 3-, or 5-cell brush                                                                                     |
| Pick a character                            | Alt-click existing text with Draw selected                                                                                            |
| Pan                                         | Scroll, Space-drag on the canvas, or middle-button drag                                                                               |
| Zoom                                        | Pinch, Cmd/Ctrl-scroll, or +/− controls                                                                                               |
| Fit drawing                                 | **Fit** or 0                                                                                                                          |
| View plain text                             | **Preview** shows selectable text with the note's monospace spacing                                                                   |
| Help                                        | **Help** or ?                                                                                                                         |

The grid grows to the right and downward when you draw. Freehand and eraser strokes interpolate between pointer events. Undo groups nearby typing into a single step and restores the label cursor. Selection paste replaces the whole rectangle, including spaces.

## Save and recover

- **Save** / Cmd/Ctrl+S saves without closing. **Save & close** / Cmd/Ctrl+Shift+S does both.
- Closing a modal with changes offers Save, Discard, or Keep editing.
- Unsaved drafts are stored in this plugin's `data.json`, with a short debounce and a flush on editor teardown. Reopening the unchanged diagram restores its draft.
- Closing a pane using Obsidian's own tab-close button keeps its draft; it does not display the modal's confirmation dialog.
- **ASCIIFlow: Recover latest drawing draft** creates a separate recovery note. Use this if the original diagram was moved, removed, or changed.
- Saving merges changes to an unchanged, uniquely identifiable diagram while preserving edits elsewhere in the note. Conflicting or ambiguous diagrams are rejected, with your drawing kept available.
- **Copy drawing** copies the diagram with surrounding blank rows and columns cropped, ready to paste anywhere. **Export .txt** downloads the same cropped text. **Clear** asks first and can be undone.

## Use your local fork

Requires Node.js 20 or newer:

```bash
npm ci
npm test
npm run build
```

Set your vault path, then copy the build:

```bash
VAULT_PATH="/absolute/path/to/your/vault"
mkdir -p "$VAULT_PATH/.obsidian/plugins/asciiflow"
cp main.js manifest.json styles.css "$VAULT_PATH/.obsidian/plugins/asciiflow/"
```

Disable an existing ASCIIFlow installation before copying. This fork uses the same plugin ID, `asciiflow`. Restart Obsidian and enable ASCIIFlow under **Settings → Community plugins**. If your vault uses a custom configuration folder, substitute it for `.obsidian`.

After changes, rebuild, copy the files again, and toggle the plugin off/on. `npm run dev` watches and rebuilds source files in the repository; it does not install or reload the plugin automatically. Keep the vault's `data.json` when updating so recovery drafts survive.

## Desktop editor

The same editor also runs as a desktop app (Tauri), outside Obsidian. Its left sidebar browses a folder you choose: create, rename and delete diagrams (`.txt` files) and subfolders. Hidden folders such as `.git` are skipped. Diagrams autosave as you draw, cropped to their content, so a file pastes cleanly into GitHub, GitLab or any Markdown. The app reopens the last folder and diagram on start.

Requires Node.js 20+ and Rust 1.85+, plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (Xcode Command Line Tools on macOS):

```bash
npm ci
npm run tauri dev     # run the app
npm run tauri build   # build the installer, e.g. src-tauri/target/release/bundle/macos/ASCIIFlow.app
```

`npm run tauri dev` starts a watcher that serves the editor on port 1420: saving a TypeScript or CSS file reloads the app window within a second, and Rust changes in `src-tauri/` rebuild and restart the app. `npm run tauri build` makes a minified bundle in `desktop-dist/` instead; `npm run build:desktop` does only that step.

## Development and validation

- `npm test`: model and DOM interaction regression tests, including note merging, conflicts, undo/redo, drawing tools, resize handles, labels, clipboard, waypoints, zoom mapping, drafts, and close/save behavior.
- `npm run typecheck`: TypeScript checking.
- `npm run build`: typecheck and bundle the plugin.
- `npm run format`: format source and test files.
- `npx playwright install chromium`, then `npm run test:browser`: browser interaction tests against the standalone editor harness.

The DOM tests mock canvas rendering and Obsidian is not present in that harness. Browser tests require a separate browser download. Validate the installed plugin in Obsidian before relying on it for important diagrams.

### Current boundaries

- Resize handles recognize rectangular boxes and simple, unbranched arrows from their characters. Complex drawings remain editable through rectangular selection; no hidden shape metadata is stored.
- Keep blocks at the top level of notes; up to three spaces of indentation are supported. Nested list and blockquote blocks are rejected by the save validator.
- Reopening a workspace pane after restarting Obsidian shows an instruction to reopen a diagram; recovery drafts persist separately.
- Full desktop, mobile, and pop-out-window behavior needs an Obsidian smoke test. Keyboard shortcuts are designed for desktop; touch supports basic drawing and erasing.

## Architecture

- `src/main.tsx`: Obsidian commands, modal/pane lifecycle, draft persistence, note saves.
- `src/ui/AsciiFlowApp.tsx`: editor controls, keyboard/clipboard handling, save and recovery UI.
- `src/model/`: sparse grid, text serialization, line joining, shape recognition and note merging.
- `src/tools/`: drawing tools, selection, labels and undo history.
- `src/input/`: pointer, pan/zoom and coordinate mapping.
- `src/renderer/`: canvas drawing, hover, selection and overwrite previews.

MIT license. Based on [xvusrmqj/obsidian-asciiflow](https://github.com/xvusrmqj/obsidian-asciiflow).

## Selection and action shortcuts

Smart selection is enabled by default. Click a box border, label, connector, or connected freehand object to select it. Drag a rectangle to select every object that lies entirely inside it: labels, arrows, lines, boxes and freehand shapes. Objects that reach outside the rectangle, such as long lines passing through, are left out, and an arrow crossing such a line is cut out at the crossing so the line stays whole. Turn **Smart selection** off for literal rectangular cell selection.

**Connectors stay attached.** Moving or resizing a box redraws the lines and arrows attached to its border, keeping their heads and line style. They leave the box at a right angle and bend where needed. A connector between two boxes that move together travels with them unchanged. Duplicating (⌘/Ctrl-drag) leaves connectors with the original. A connector that branches is left as it is.

**Shift-click** adds the clicked item (box, label, connector or freehand object) to the selection, or removes it if it is already selected. Move, nudge, duplicate, rotate, delete, copy and line style then apply to all selected items together. Drag a multi-selection from one of its items.

**Escape** cancels the current gesture, clears the selection, and resets to Select. It never closes the editor or opens a save prompt. Use the explicit Close button to leave.

| Action                                   | Shortcut                                       |
| ---------------------------------------- | ---------------------------------------------- |
| Select tool                              | S                                              |
| Undo                                     | U or Cmd/Ctrl+Z                                |
| Redo                                     | R or Cmd/Ctrl+Shift+Z; Ctrl+Y also works       |
| Select all                               | Cmd/Ctrl+A                                     |
| Duplicate                                | D or Cmd/Ctrl+D, then position and click/Enter |
| Center label horizontally and vertically | C                                              |
| Cycle arrowheads: one end, other, both   | Select an arrow, then V                        |
| Head shape: arrowhead ► or T bar ┤       | Select an arrow, then Shift+V                  |
| Rotate selection 90°                     | O clockwise, Shift+O counter-clockwise         |
| Line style: solid → dashed → double      | Select a box or line, then W                   |
| Clear drawing                            | X, then confirm                                |

Single-letter actions are inactive while entering a label. Duplicates cannot be placed over their source; move the preview clear of the original before committing. Rendered notes crop empty margins and center the visible drawing, without changing stored coordinates.

## Figure catalog

Use **Figures** / **G** to browse 24 built-in shapes, flowcharts, architecture symbols, connectors, and characters. Search matches names, categories, and tags. Click a figure to start a floating placement preview; click the canvas or press Enter to place, or Escape to cancel. The catalog works offline and stores placed figures as ordinary diagram text.

Smart connector selection includes its box attachment cells and arrowheads, highlights the actual path, and restores the box boundary when moving or deleting the connector.

## Buses

Choose **Bus** (**I**) and drag a straight horizontal or vertical path. **Compact** draws `═` or `║`. **Wide** draws two double-line rails with a 1-, 3-, or 5-cell gap, leaving existing content between them intact. The drag anchors the top/left rail; the second rail sits below/to its right. **Auto** locks direction on the first movement; choose **Horizontal** or **Vertical** for an explicit lock. Use Text (**T**) to label the gap. Lines connect with mixed single/double junctions. Each drag is one undo step; Escape cancels it.
