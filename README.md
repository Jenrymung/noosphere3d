# 3D Mind Map

Keyboard-first desktop app for free-form 3D mind maps. This slice covers the Phase 0 scene, the Phase 1 map engine, Phase 2 navigation, Phase 3 editing, Phase 4 links and link types, Phase 5 files, tabs, and crash recovery, and Phase 6 keyboard and accessibility basics. Waypoint editing is later. The plan is `docs/plan.md`.

The UI and the engine are TypeScript (Svelte 5, Vite, Three.js). The desktop shell is Tauri 2. The same page also runs in a browser, which is how the scene was checked on this Linux machine.

## Run the scene in a browser

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 43123
```

Open http://127.0.0.1:43123/

A new tab starts with one empty node in Edit, and the status reads “Not saved yet”. **2,304 nodes** and **Flooding sample** open those documents as further tabs. The flooding sample is the document in `samples/urban-flooding.mindmap3d`. In the browser, Open and Save As use an in-app path list backed by this browser’s storage. The desktop shell uses the system dialogs and writes the real file.

| Key | Action |
| --- | --- |
| Arrow keys | Select the node in that screen direction. With a link selected, Left/Right jump to its source/target |
| Enter | Open the Reader for the selected node or link |
| E | Edit. From the map this skips the Reader; from the Reader it steps into Edit |
| Esc | Step back one level: Edit, then Reader, then the selection. On a link, return to the node you arrived from. On a node, with nothing else open, clear the selection |
| Tab | Create a linked node with the last-used type, place it, and edit it |
| Shift+Tab | Same as Tab, after you pick the link type |
| Mod+Enter | From the map (Navigate, including a pinned Reader while the scene has the keyboard), place an unlinked node and edit it. From Edit, commit and open the Reader |
| L | Link mode. The current node is the source. Arrows aim a target and Enter confirms it. Hovering aims the target and a click creates the link. 1–9 pre-pick a type, N places a new unlinked target, `/` searches nodes by name. Esc or right-click cancels |
| 1–9 | On a selected link, set that type. In Link mode, pre-pick the type (the rubber band takes its colour) |
| T | Open the type picker for the selected link. Shift+T / Alt+Shift+T cycle next / previous. A run of cycles is one undo |
| R | Reverse the selected link |
| `.` / `,` | Follow the active type forward / backward. Several candidates open a numbered chooser |
| Alt+] / Alt+[ | Cycle only links of the active type |
| Alt+1–9 | Show or hide that type. Alt+0 shows every type |
| Shift+L | Legend: Space cycles shown, dimmed, hidden. S solos. A shows all |
| Mod+Shift+L | Link-type manager. Enter edits, Mod+N adds, Alt+arrows reorder the number keys, Delete asks before removing a type |
| G | Grab the selected node. Move the mouse or nudge with the arrows (Shift is a larger step). X/Y/Z lock a world axis, wheel or PageUp/PageDown change depth, Shift slows the mouse, Ctrl/Cmd snaps to 0.5. Click or Enter keeps the move. Esc or right-click puts it back |
| Delete / Backspace | Delete the selected node (its links go too) or the selected link |
| Mod+Z / Mod+Shift+Z / Ctrl+Y | Undo / redo. Typing in one edit session is a single step until you pause |
| Mod+\ | Pin the Reader so it follows the selection while the scene keeps the keyboard |
| `]` / `[` | Next / previous visible link on the current node |
| B / Shift+B | Back / forward through node history |
| Shift+Arrows | Orbit around the focus point |
| Alt+Arrows | Pan |
| `=` / `-` | Zoom in / out |
| F | Focus the selection |
| Shift+F or Home | Frame every node |
| V | View operator: move the mouse to orbit, Shift pans, wheel zooms. Click or Enter keeps the view. Esc or right-click restores it |
| Ctrl+Up / Ctrl+Down (Cmd on macOS) | Step nearer / farther in depth |
| `` ` `` | Cycle label drawing: SDF, CSS2D, icons only. Shift+`` ` `` toggles nearby titles and every title in front of the camera |
| M | Open the other of the stress map and the flooding sample in a new tab |
| Mod+S / Mod+Shift+S | Save / Save As. Manual save is the default |
| Mod+O | Open a `.mindmap3d` file. A path that is already open switches to that tab |
| Mod+T / Mod+N | New tab (Mod+N stays with the type manager while that window is open) |
| Mod+W | Close the tab. Save, Don’t save, or Cancel when the map is unsaved |
| Mod+Shift+T | Reopen the last closed tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Mod+1–8 / Mod+9 | A numbered tab, or the last tab |
| Mod+, | Preferences: save mode, autosave timing, backups, theme, label size, reduced motion, dim nodes with no visible links, the corner axis gizmo, skip the type picker |
| / or Mod+K | Command palette. Type to filter commands and node text. Prefix `>` for commands only, `@` for nodes only. In Link mode, `/` still searches for a target and Mod+K opens the palette |
| ? | Shortcut sheet, generated from the keymap |
| F6 / Shift+F6 | Move focus between the tab strip, the scene, the Reader, and the status bar |

Mouse: left-drag orbits, right-drag or middle-drag pans, wheel zooms. Click a title or a link to select it. Clicking empty space leaves the selection as it is. Click a document icon, or double-click a link label, to open the Reader. Double-click a title to focus it. The scene renders on demand and keeps drawing while the camera is moving.

Icons are billboarded document sprites with a minimum on-screen size. A page with text lines has body copy beyond its title; a blank page is title only. Link curves are batched per type (colour, dash pattern, width), with cone arrowheads that stay at least 12 pixels tall, and a fan around the pair axis. Waypoint links keep the user's route. A self-link draws as a loop. Link labels are two SDF lines (title, then a smaller type name); a link with no title shows only the type.

The Reader is docked on the right. It renders Markdown with `markdown-it` (raw HTML off) and DOMPurify. Image markdown is a labelled placeholder, and links open in a new tab. Edit mode is a title field plus CodeMirror, with a live preview underneath. Alt+T moves between the title and the body. When the Reader opens, focus moves to its heading. Positions are part of the document. Save writes them, along with the camera and type filters, into the `.mindmap3d` file. Camera moves and type filters are not undo steps and do not mark the map unsaved. In autosave mode they do not start a save; the next save from a real edit writes them. In manual mode, closing after only those changes does not prompt and does not write the file. The camera is copied in at save time.

A small axis gizmo sits in the corner of the scene. It has no keys of its own. Preferences can hide it. A clipped ARIA tree mirrors the selected node's links, grouped by type, and a polite live region announces selection and mode changes. Loops are named once, without listing that node's links again. Tab creates a node only while the scene has focus, so F6 can move through the rest of the page.

Link mode draws a dashed rubber band from the source to the aimed node. Enter, or a click, creates the link when a type is already chosen or when Preferences has “Skip the picker” on. Otherwise the type picker opens. The next Enter on that link opens the Reader, where E edits the link text. Hidden types are not drawn and are skipped by cycle and follow. Dimmed types stay faint and can still be navigated. Those filters sit on the map view, so a save keeps them, and they are not undo steps. The legend lists every type, greying unused ones, and each row shows that type’s colour, dash pattern, and arrow direction.

Saving is manual until Preferences switches it to autosave. Autosave waits about two seconds after a document edit, and at most about thirty seconds during a burst, and it also runs when the window blurs or closes. A camera move or a type-filter change does not start that timer. Turning autosave on does not itself write the file. A recovery copy is written in both modes after a short idle. Closing a never-saved map, or a manually saved map with unsaved edits, asks Save / Don’t save / Cancel. Several such tabs ask Save all / Review each / Discard all / Cancel. Undo back to the saved history is clean. A file changed by another program is not overwritten. A map from a newer major version is refused and left untouched, with the message “This map was made with a newer version of the app. Please update to open it.” Preferences stay on this computer, not in the map file.

## Run the desktop shell

Linux packages the shell needs (Debian/Ubuntu):

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Rust 1.90 or newer (Tauri 2.12 uses edition 2024 in its dependencies). Then:

```bash
npm run tauri dev
```

`tauri dev` starts Vite on port 43123. Stop any other dev server on that port first. A release build is `npm run tauri build`.

**Windows and macOS builds are unverified.** This tree was only compiled and launched on Linux.

`.github/workflows/build.yml` is the cross-platform matrix: `npm test`, then unsigned Tauri bundles for Linux x64, Windows x64, and macOS Apple Silicon and Intel. macOS bundles are ad-hoc signed (`signingIdentity: "-"`). Artifacts are whatever the CI host attaches to the run (GitHub Actions artifacts, or the equivalent on a connected app). Origin does not run this file. Depot CI has no Windows or macOS sandboxes and would rebuild every job on Linux. A host with real Windows and macOS runners, such as GitHub Actions or Buildkite with those queues mapped, is still required before anyone can download a Windows or Mac installer.

## Tests

```bash
npm test
```

Vitest covers titles, the link index, schema and integrity, the v0→v1 migration, undo grouping, spatial navigation, placement, the grab operator, Escape stepping, Mod+Enter, link types and filters, reader Markdown, save timing, the browser save stand-in, and tab history. Rust tests in `src-tauri` cover atomic save, the external-change refusal, the newer-major file left byte-for-byte alone, and recovery that survives a killed process.

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib files
```

## Labels

The viewport can draw titles three ways, on the same map:

- **SDF** — [troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text), with a dark outline. This is the default. Nearby mode uses one `Text` mesh per visible title (capped). All-titles mode packs them into one experimental `BatchedText` draw. A rounded plate behind the SDF title is deferred to v1. Fallback glyph data is served from `static/unicode-fonts` so label layout does not call out to a font CDN.
- **CSS2D** — Three.js `CSS2DRenderer`, one DOM card per visible title. Still available from the HUD and the 2 key.
- **Icons** — instanced billboard sprites only.

Nearby mode keeps the selection, its neighbours inside 48 world units, and up to 240 other in-front titles. Nodes behind the camera are skipped.

Frame times in the HUD and from **Measure orbit** are real `requestAnimationFrame` deltas. On a machine with no GPU they include software WebGL and are not a laptop 60 fps number. Compare SDF and CSS2D against each other on the same machine. `scripts/label-bench.mjs` repeats that orbit measurement in headless Chrome (devDependency `puppeteer-core`, system Chrome).

## Layout

- `src/lib/core` — document, commands, history, graph index
- `src/lib/io` — Valibot schema, integrity repair, migrations, canonical JSON
- `src/lib/input/spatialNav.config.ts` — arrow-key score weights (angle, screen distance, 3D distance, link bonus) and cone limits
- `src/lib/input/spatial.ts` — that score, used for arrow keys and depth steps
- `src/lib/input/escape.ts` — Esc stepping from Edit to Reader to the selection
- `src/lib/input/grab.ts` — grab confirm/cancel, axis lock, precision, snap
- `src/lib/editor` — sanitized Markdown and the Reader / Edit panel
- `src/lib/scene/placement.ts` — one-shot placement for a new node
- `src/lib/scene/arrowScale.ts` — minimum on-screen arrowhead size
- `src/lib/scene/route.ts` — curved links, pair fan, waypoint splines, self-link loops
- `src/lib/scene` — Three.js view and the dummy stress map
- `samples/urban-flooding.mindmap3d` — the section 7.2 sample, canonical JSON

## Licence

MIT OR Apache-2.0. See `LICENSE-MIT` and `LICENSE-APACHE`.
