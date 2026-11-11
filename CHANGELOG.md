## [v1.0.0]

### Added

- connectors that stay attached to boxes (`c988d06`)

  Moving or resizing a box redraws the lines and arrows attached to it,
  keeping their heads and line style and bending them where needed. A
  connector between two boxes moved together travels with them unchanged.
- Shift-click multi-selection (`f044c3d`)

  With the Select tool, Shift-click items to add them to the selection or remove
  them. Move, nudge, duplicate, rotate, delete, copy and line style apply to all
  selected items together.
- T-bar arrow ends (`fa88d2f`)

  Select an arrow and press Shift+V, or use Head shape, to switch its heads
  between arrowheads and T bars (─┤). V keeps cycling the heads in the chosen
  shape, and lines that end only in T bars are recognized as connectors.
- a desktop diagram editor (`0bc77b8`)

  A standalone Tauri app edits diagrams outside Obsidian. Its sidebar browses a
  folder of .txt diagrams like an IDE: create, rename, duplicate and delete
  diagrams and folders, drag items between folders, and use right-click menus.
  Diagrams save automatically with surrounding whitespace cropped, ready to
  paste into GitHub, GitLab or any Markdown. Run with `npm run tauri dev`;
  build with `npm run tauri build`.
- arrowhead cycling (`0bc77b8`)

  Select an arrow and press V, or use Arrowheads, to move its head to the other
  end, add heads to both ends, then return. A head leaving a line rejoins it as
  a junction.
- 90° rotation of selections (`0bc77b8`)

  Rotate (O, Shift+O counter-clockwise) turns lines, corners, junctions and
  arrowheads while keeping labels readable. Rotating back restores the original.
- dashed and double line styles (`0bc77b8`)

  Select a box or line and press W, or use Line style, to cycle solid, dashed
  and double. Styles survive resizing and rotation, and lines attach to double
  boxes with mixed junctions.
- compact and wide buses (`5865183`)

  Draw straight horizontal or vertical double-line buses, choose rail spacing, and connect single-line branches. Saved diagrams appear as centered embeds with editing controls on hover or focus.
- a searchable figure catalog and smarter diagram editing (`b8f8bc1`)

  Browse and place 24 ready-made figures. Select labels and complete connectors,
  center labels inside boxes, and draw connectors following right-angle turns.

### Changed

- the name to Drawscii (`99417bb`)

  The plugin is now Drawscii with plugin ID `drawscii`, so Obsidian installs it
  as a new plugin: copy it to .obsidian/plugins/drawscii/ and move data.json
  over to keep recovery drafts. New diagrams use ```drawscii blocks, while
  existing ```asciiflow blocks keep rendering and saving unchanged. The
  desktop app is now Drawscii.app and asks for the diagram folder once more.
  Drawscii credits ASCIIFlow by Lewis Hemens and obsidian-asciiflow by
  xvusrmqj, which it is forked from.
- drag-selection to pick whole objects (`d8f9de6`)

  Dragging a rectangle with smart selection selects every label, arrow, line,
  box and freehand shape that lies entirely inside it, leaving out lines that
  reach outside, such as lifelines passing through.
- copy and export to crop surrounding whitespace (`0bc77b8`)

  Copy drawing and Export .txt omit blank rows and columns around the diagram,
  so pasted diagrams no longer carry the position they were drawn at.

### Fixed

- tool shortcuts needing a click on the canvas first (`99417bb`)

  The editor takes keyboard focus when it opens, so shortcut letters switch
  tools straight away.
- selecting a line that crosses another (`d8f9de6`)

  Clicking a line or arrow that crosses another line selects only that line,
  and moving or deleting it leaves the crossed line whole.
- attached connectors stopping at crossed lines (`d8f9de6`)

  When a box moves, attached connectors are re-routed to their real far end
  through lines they cross, with bends placed beside existing lines.
- moved selections erasing drawings underneath (`fa88d2f`)

  Dragging, nudging and duplicating a selection no longer blank what lies
  under its empty cells, and cells it passes over are restored when it moves on.
- resize handles hiding arrowheads (`fa88d2f`)

  Handles now outline their cell, so arrowheads and corners stay visible while
  they are edited.
- creating files in subfolders of the desktop app's folder (`fa88d2f`)

  Folders opened before subfolder access was granted show a Grant access
  button that renews access in one step.
- the editor failing to open without matchMedia (`0bc77b8`)

  The canvas no longer throws when its window lacks matchMedia or a default view.
- canvas scaling and grid pixel alignment (`9618aa7`)

  Use the canvas window pixel ratio, refresh the backing bitmap when display density changes, and align grid lines to physical pixels. Click the zoom percentage to return to 100%.
- connector arrowheads, duplication, and Escape behavior (`b8f8bc1`)

  Arrowheads remain visible at box borders, duplicating preserves the original,
  and Escape resets the tool without closing the editor or asking to save.

### Patch

- Fix blurry canvas (`5127171`)
