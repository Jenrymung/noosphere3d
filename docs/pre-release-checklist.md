# Pre-release checks still owed

These need a person, another operating system, or a real GPU. This Linux VM did not complete them.

- [ ] **Orca** on Linux, against the Tauri window: selection announcements, Reader open, command palette. Attempted here with Orca 46.1. A normal launch does not register the WebKitGTK window with AT-SPI. With the WebKit sandbox turned off for the test, the window does appear (buttons, the neighbourhood tree, and the About dialog). Orca spoke “Screen reader on.” and then produced no announcement for selection, the Reader, or the palette. A second launch stalled in speech-dispatcher. Those three flows are still owed.
- [ ] **NVDA** on Windows: the same three flows.
- [ ] **VoiceOver** on macOS: the same three flows.
- [ ] **Windows build** and a short launch. SignPath is still a later option if the project qualifies.
- [ ] **macOS build** (unsigned, not notarized, ad-hoc signature for Apple Silicon) and a short launch. After Gatekeeper blocks the first open, use System Settings → Privacy & Security → Open Anyway. Right-click → Open only works on older macOS versions.
- [ ] **SDF titles on a real GPU**, compared with the CSS2D toggle. Software WebGL on this VM is not that measurement.
- [ ] **OS shortcut conflicts** on each platform: confirm the keymap still avoids Cmd+H, Cmd+M, Cmd+Q, Cmd+Space, Cmd+Tab, Alt+Tab, and Alt+F4, and that Ctrl+Tab, Alt+digit, and symbol keys (`/` and `?`) behave on a non-US layout and on each WebView.
- [ ] **Third-party notices generated in CI**, replacing the fixed list in About.
- [ ] **Bundle identifier** set to `io.github.<owner>.noosphere3d` once the GitHub owner is known. The current identifier stays `io.github.noosphere3d.app` until then.

The licence is MIT, the app name is Noosphere 3D, and macOS builds stay unsigned (no Apple Developer membership). Hosting the repository on GitHub, so the existing workflow and Releases can run, is decided and not set up in this tree.
