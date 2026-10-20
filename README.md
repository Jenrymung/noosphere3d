# 3D Mind Map

Keyboard-first desktop app for free-form 3D mind maps. This slice is the Phase 0 scene, the Phase 1 headless map engine, and Phase 2 navigation: you can fly around a loaded map and move the selection by keyboard alone. The reader, tabs, saving, and the link palette are not in this build. The plan is `docs/plan.md`.

The UI and the engine are TypeScript (Svelte 5, Vite, Three.js). The desktop shell is Tauri 2. The same page also runs in a browser, which is how the scene was checked on this Linux machine.

## Run the scene in a browser

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 43123
```

Open http://127.0.0.1:43123/

The stress map starts selected: 2,304 document icons and about 6,000 links. Switch to **Flooding sample** for the small urban-flooding document in `samples/urban-flooding.mindmap3d`.

| Key | Action |
| --- | --- |
| Arrow keys | Select the node in that screen direction. With a link selected, Left/Right jump to its source/target |
| `]` / `[` | Next / previous visible link on the current node |
| B / Shift+B | Back / forward through node history |
| Shift+Arrows | Orbit around the focus point |
| Alt+Arrows | Pan |
| `=` / `-` | Zoom in / out |
| F | Focus the selection |
| Shift+F or Home | Frame every node |
| V | View operator: move the mouse to orbit, Shift pans, wheel zooms. Click or Enter keeps the view. Esc or right-click restores it |
| Ctrl+Up / Ctrl+Down (Cmd on macOS) | Step nearer / farther in depth |
| 1 / 2 / 0 | SDF labels, CSS2D labels, icons only |
| 9 | Toggle nearby titles and every title in front of the camera |
| M | Swap the stress map and the flooding sample |

Mouse: left-drag orbits, right-drag or middle-drag pans, wheel zooms. Click a title, icon, link label, or link line to select it. Double-click a title to focus it. The scene renders on demand and keeps drawing while the camera is moving.

Icons are billboarded document sprites. A page with text lines has body copy beyond its title; a blank page is title only. Link curves are batched per type (colour, dash pattern, width), with cone arrowheads and a fan around the pair axis. Waypoint links keep the user's route. A self-link draws as a loop. Link labels are two SDF lines (title, then a smaller type name); a link with no title shows only the type.

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

Vitest covers titles, the link index, schema and integrity, the v0→v1 migration, undo grouping, and a fast-check property that a random command sequence round-trips through undo, redo, and JSON. Spatial navigation has its own unit tests.

## Labels

The viewport can draw titles three ways, on the same map:

- **SDF** — [troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text), with a dark outline. This is the default. Nearby mode uses one `Text` mesh per visible title (capped). All-titles mode packs them into one experimental `BatchedText` draw. A rounded plate behind the SDF title is deferred to v1.
- **CSS2D** — Three.js `CSS2DRenderer`, one DOM card per visible title. Still available from the HUD and the 2 key.
- **Icons** — instanced billboard sprites only.

Nearby mode keeps the selection, its neighbours inside 48 world units, and up to 240 other in-front titles. Nodes behind the camera are skipped.

Frame times in the HUD and from **Measure orbit** are real `requestAnimationFrame` deltas. On a machine with no GPU they include software WebGL and are not a laptop 60 fps number. Compare SDF and CSS2D against each other on the same machine. `scripts/label-bench.mjs` repeats that orbit measurement in headless Chrome (devDependency `puppeteer-core`, system Chrome).

## Layout

- `src/lib/core` — document, commands, history, graph index
- `src/lib/io` — Valibot schema, integrity repair, migrations, canonical JSON
- `src/lib/input/spatialNav.config.ts` — arrow-key score weights (angle, screen distance, 3D distance, link bonus) and cone limits
- `src/lib/input/spatial.ts` — that score, used for arrow keys and depth steps
- `src/lib/input/viewOperator.ts` — operator confirm/cancel, and the V view operator
- `src/lib/input/navHistory.ts` — back/forward node history
- `src/lib/scene/route.ts` — curved links, pair fan, waypoint splines, self-link loops
- `src/lib/scene` — Three.js view and the dummy stress map
- `samples/urban-flooding.mindmap3d` — the section 7.2 sample, canonical JSON

## Licence

MIT OR Apache-2.0. See `LICENSE-MIT` and `LICENSE-APACHE`.
