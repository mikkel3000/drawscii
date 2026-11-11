# Project Guidelines

## Code Style
- TypeScript (strict) and React 18.3; keep typing explicit where helpful.
- Avoid editing `src/main.ts` (deprecated). Use `src/main.tsx` instead.
- Use existing layers (UI → Tools → Renderer → Model → Input) to place new logic.

## Architecture
- **Entry**: `src/main.tsx` registers the `drawscii` code block processor (and `asciiflow` for notes from before the rename) and opens the modal editor.
- **UI**: `src/ui/DrawsciiApp.tsx` hosts the toolbar + canvas and wires tool interactions.
- **Tools**: `src/tools/` implements `ITool` + `ToolManager` and tool-specific logic.
- **Model**: `src/model/Grid.ts` is the sparse grid data source; `Serializer.ts` handles text ↔ grid.
- **Renderer**: `src/renderer/CanvasRenderer.ts` draws the grid on canvas.
- **Input**: `src/input/` maps pointer events to grid coordinates.

## Build and Test
- **Dev watch**: `npm run dev`
- **Build**: `npm run build`

## Conventions
- Tools mutate grid via `ToolContext` and call `render()` after changes.
- The grid grows to include nonnegative writes; negative coordinates are ignored.
- Theme colors come from CSS variables (`--background-primary`, `--text-normal`, `--background-modifier-border`).

## Commit messages
- Always use the versionedcommits format in `VERSIONEDCOMMITS.md`.
- User-facing features use `@minor`; fixes use `@patch`; breaking changes use `@major`.
- Put hints on separate lines in the commit body and close detailed note blocks with the same hint.
- Preserve release metadata when squashing. Conventional-commit prefixes alone are insufficient.
