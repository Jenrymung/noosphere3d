# Pre-release checks still owed

## Feedback round 1 (owner review)

Implemented on the wave 1 branch. These still need a person at the machine. This environment did not launch the desktop window, so none of the visual or mouse checks below were done here.

- [ ] Open and save a `.mindmap3d` file and confirm the tab, the window title, and Maps → “This map” all show the file name without `.mindmap3d`. An unsaved map stays “Untitled map”.
- [ ] With titles on, move a node behind the Markdown editor, the Reader, the Maps panel, the legend, the command palette, and the status bar. The title must stay hidden behind each of those panels, in both SDF and CSS2D.
- [ ] Grab a node (G, then move the pointer). It should follow the cursor 1:1 on the camera-facing plane. Shift should make that travel finer. Arrow nudges should feel as they did before.
- [ ] Maps: add the current saved map, add another file, remove a pre-made entry and a file entry, restart the app. The list should match. No file on disk should be deleted.
- [ ] In the Markdown editor, with a node open, edit X, Y, and Z. Each change is one undo. Moving the node another way updates the fields.
- [ ] Show titles cycles Off → Nodes only → Nodes and links. Link titles sit at the middle of the link, including a waypoint path, and use the same under-panel rule as node titles.
- [ ] Windows and macOS still need a real-hardware pass. CI can build them; it does not click through the app.

## Earlier checks

These need a person, another operating system, or a real GPU. This Linux VM did not complete them.

- [ ] **Orca** on Linux, against the Tauri window: selection announcements, Reader open, command palette. Attempted here with Orca 46.1. A normal launch does not register the WebKitGTK window with AT-SPI. With the WebKit sandbox turned off for the test, the window does appear (buttons, the neighbourhood tree, and the About dialog). Orca spoke “Screen reader on.” and then produced no announcement for selection, the Reader, or the palette. A second launch stalled in speech-dispatcher. Those three flows are still owed.
- [ ] **NVDA** on Windows: the same three flows.
- [ ] **VoiceOver** on macOS: the same three flows.
- [ ] **Windows build** and a short launch. SignPath is still a later option if the project qualifies.
- [ ] **macOS build** (unsigned, not notarized, ad-hoc signature for Apple Silicon) and a short launch. After Gatekeeper blocks the first open, use System Settings → Privacy & Security → Open Anyway. Right-click → Open only works on older macOS versions.
- [ ] **SDF titles on a real GPU**, compared with the CSS2D toggle. Software WebGL on this VM is not that measurement.
- [ ] **OS shortcut conflicts** on each platform: confirm the keymap still avoids Cmd+H, Cmd+M, Cmd+Q, Cmd+Space, Cmd+Tab, Alt+Tab, and Alt+F4, and that Ctrl+Tab, Alt+digit, and symbol keys (`/` and `?`) behave on a non-US layout and on each WebView.
- [x] **Third-party notices generated in CI** and uploaded as `noosphere3d-third-party-notices` (npm production dependencies and Rust crates). Generation fails only when a tool errors, not because of a licence string.
- [x] **Full third-party notices bundled in the app** and opened from About → **View all licences** in the Reader. `THIRD-PARTY-NOTICES.md` is generated before the frontend bundle and embedded so it works offline. The About dialog still shows the short fixed list. Required before the pre-release flag is dropped.
- [ ] **Pre-release flag dropped** once the real-hardware Windows/macOS checks, GPU checks, Orca, SignPath, and the bundled notices are done.
- [x] **Bundle identifier** set to `io.github.jenrymung.noosphere3d`.

The licence is MIT, the app name is Noosphere 3D, and macOS builds stay unsigned (no Apple Developer membership). The repository is https://github.com/Jenrymung/noosphere3d. `.github/workflows/build.yml` builds unsigned installers on GitHub Actions and uploads them as artifacts. Pushes to `main` and workflow dispatch upload artifacts. A `v*` tag publishes a pre-release. [v0.1.0](https://github.com/Jenrymung/noosphere3d/releases/tag/v0.1.0) is that pre-release. Check for updates opens https://github.com/Jenrymung/noosphere3d/releases.
