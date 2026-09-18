# Consept redesign verification

Date: 2026-09-16

final result: passed

## Visual target

The five supplied references and the approved implementation plan define this
redesign: neutral near-black surfaces, compact bottom tools, a narrow workspace
rail, categorized rounded node choices, and a project-focused home. Soft blue is
the default accent; orange, monochrome and lime are available presets. Pipeline
starters are documented in `TODO/home-pipelines.md` for a later iteration.

The supplied home and editor references were viewed alongside the rendered
screenshots. The home comparison also includes a capture at the source image's
2559 x 1426 dimensions. Layout adapts the references to Consept's existing
operations and the approved project-first home content.

## Browser verification

Verified against the running local application with Playwright CLI. The in-app
browser connection failed during planning, so it was not used for visual proof.

- Home, editor dock, category panel and appearance controls fit 1920, 1366,
  1024 and 390 pixel viewports. The 390 pixel checks used a browser viewport,
  not a physical device.
- All 12 node types were rendered and individually captured, including the
  existing local GLB preview. Images and 3D lighting retain their original content.
- All four presets, light canvas/dark panels and dark canvas/light panels apply.
  Appearance changes leave the project revision unchanged and persist on reload.
- Category search, empty search, keyboard selection, Escape, focus restoration,
  upload, right-click creation and output-drag creation work.
- A connection from Reference Set preserves the `all` handle and passes both
  source images to Relative Atlas.
- Left-button partial marquee selection, Space+left drag, middle-button drag,
  permanent pan mode, undo/redo and reference grouping were exercised.
- Home/create/rename/delete use real local project APIs. New projects have an
  empty graph and independent undo history; the default project remains protected.
- Returning to the same project preserves its viewport and graph. Home keyboard
  and paste events cannot modify hidden nodes. The editor becomes inert during a
  delayed departure save.
- A simulated failed project-list request restores the browser backup as an
  accessible Home card; the recovered graph can be opened.
- Project JSON export downloaded successfully and was imported back with all
  13 fixture nodes retained.
- Temporary QA projects were removed through project deletion. The remaining
  active project list contains the original `Untitled pipeline` and `ui` projects.

## Visual issues corrected

- Hidden React Flow nodes initially overlaid Home because of their explicit
  visibility rules. The retained editor now hides its entire rendered subtree.
- Atlas labels and controls competed for horizontal space. Labels and units now
  occupy their own row above full-width fields.
- Preview backgrounds now use a subtle consistent transparency checker.
- Source filenames use muted text rather than error styling; material-grid empty
  cells use a neutral surface.

No outstanding blocking visual findings remained in the reviewed states.

## Automated checks

- TypeScript and production build passed.
- Client tests: 12 passed, including theme contrast/storage and non-mutating
  edge presentation. Theme tests cover 324 mixed color combinations.
- Server regression tests: 26 passed.
- `git diff --check` passed.

The production build retains a non-blocking warning for large JavaScript chunks.
Paid generation, external provider workflows and production deployment were not
part of this frontend verification. No backend source changes were made for the
redesign; pre-existing working-tree changes were preserved.

## Evidence

Screenshots and browser check scripts are in the ignored `output/playwright/`
directory. Key captures: `home-final.png`, `editor-empty-1366.png`,
`catalog-1366.png`, `home-390.png`, `editor-catalog-390.png`,
`appearance-390.png`, and the twelve `node-*.png` captures.
