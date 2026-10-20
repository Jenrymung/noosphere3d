# 3D Mind Map — Product & Technical Plan

*Working title: "3D Mind Map". Status: planning draft. Audience: the app's creator.*

---

## Contents

- [1. Overview](#1-overview)
- [2. Goals and non-goals](#2-goals-and-non-goals)
- [3. Target users and core use cases](#3-target-users-and-core-use-cases)
- [4. Feature list](#4-feature-list)
- [5. UX and interaction design](#5-ux-and-interaction-design)
- [6. Keyboard design](#6-keyboard-design)
- [7. Data model](#7-data-model)
- [8. Architecture](#8-architecture)
- [9. Performance](#9-performance)
- [10. Tech stack](#10-tech-stack)
- [11. Roadmap and milestones](#11-roadmap-and-milestones)
- [12. Risks and open questions](#12-risks-and-open-questions)
- [13. Testing strategy](#13-testing-strategy)
- [14. Summary](#14-summary)

---

## 1. Overview

A desktop app for building **mind maps in 3D space**. Each idea is a **node** that floats in 3D and holds text. Nodes join to other nodes through **links**, and links can hold text too. A map is a **free-form web**, not a tree: any node can link to any other, loops are allowed, and there's no required central node. Every link has a **link type** (such as "causes", "part of" or "contradicts") that shows *what kind* of relationship it is through its colour, line style and direction. All node and link text is written in **Markdown**. The app is **keyboard-first**: everything can be done without a mouse, though the mouse still works.

### Decisions

These have been decided by the creator. All the earlier open questions have now been answered and moved here (see [Section 12.2](#122-open-questions-for-the-creator) for the few small items left).

| Area | Decision |
|---|---|
| App shell | **Tauri** (Rust backend, web UI in the system WebView). Electron was considered and rejected as heavier. |
| 3D | **Three.js** (WebGL) |
| Platforms | Windows, macOS, Linux |
| Storage | Local **JSON files** the user opens, saves and backs up like normal documents |
| **File extension** | **`.mindmap3d`** (the content is plain JSON). Registered as a file association through Tauri's bundler, so double-clicking a map opens it. A distinctive extension avoids clashes such as FreeMind's `.mm`. |
| **Local only** | **Everything stays on the user's computer.** No cloud service, no account, no sync, no telemetry. The app makes no network requests in normal use, and remote images in Markdown aren't loaded by default. Users who want sync can keep maps in a folder they sync themselves. |
| **Saving** | **The user chooses, in Preferences.** The **default is manual save** (**Mod+S**), with a clear unsaved-changes indicator and a "Save / Don't save / Cancel" prompt on close. An optional **autosave mode** writes to the real file automatically (debounced, plus a maximum interval). **In both modes**, every write is **atomic** and a **crash-recovery file** is kept in the app's data folder. *(Previously the open question "autosave behaviour".)* |
| **Node appearance** | In 3D, a node is a **small document icon** (a billboarded sprite) with its **title floating above it**. The title is an optional explicit **`title` field**, or if that's empty, the first heading or first line of the Markdown. **Clicking the icon, or pressing Enter** on the selected node, **opens** the node's full Markdown, rendered, in the **Reader panel**. **E** (or Enter again) switches to editing; **Esc** closes. *(Previously the open question "what appears on the node in 3D?")* |
| **Map structure** | **Free-form web.** Any node can link to any node; loops are allowed; there's no required root or parent. *(Previously the open question "graph or tree?")* |
| **Layout** | **Auto-placed once, then manual.** A new node is placed automatically near the node it's linked from, avoiding overlaps. After that it **keeps whatever position the user gives it**. There is **no automatic global re-layout**. Rearranging only happens when the user runs **Auto-arrange selection** or **Auto-arrange all**, and that is one undoable step. *(Previously the open question "manual positions or auto-layout by default?")* |
| **Link routing** | Links **auto-route** between their two nodes by default. The user can add **pinned waypoints** to a link: the link passes through all of them in a user-set order before reaching the target. Waypoints are **v1**, and the data model already supports them. |
| **Waypoints and moving** | **Waypoints move with the selection.** When a group of nodes is moved together, waypoints on links *within* the group move with it, and any waypoints that are themselves selected move too. Waypoints that aren't selected and aren't inside a moved group stay where they are. |
| **Link types** | Links are **typed**. Each map has its own **user-editable registry of link types** (name, colour, line style, direction, optional icon and description) and starts with a default starter set. Every link points to one type and still has its own Markdown text. |
| **Starter link types** | The **seven starter types are approved** (relates to, leads to / causes, part of, depends on, contradicts, example of, supports). They can be **deleted** like any other type. Users can save **their own default starter set** for new maps (an app-level link-type template). |
| **Link direction** | **No per-link direction override.** Direction always comes from the link type. To change it, press **R** to reverse the link or pick a different type. |
| **Self-links** | **Allowed** (a node can link to itself), but creating them is **not in the MVP**. The data model allows them from version 1. MVP keeps any it finds in a file and draws them as a small loop. |
| **Link labels** | A link's 3D label shows its **title** (explicit `title` field, else the Markdown's first heading or line, the same rule as nodes), with the **type name just below it** in a smaller, lighter style. A link without a title shows **only the type name**. **Enter** on a selected link opens its full Markdown in the Reader, like nodes. |
| **Images and attachments** | Referenced by **relative path** into a **resources folder** next to the map (default `<map name>.resources/`, or a folder path stored in the map). Inserting an image **copies** it into that folder. Planned for **v1** (see [5.9](#59-images-and-attachments-v1)). |
| **Mouse** | **Blender-style "hotkey + mouse movement"** for editing: press a key, move the mouse, then **click/Enter to confirm** or **Esc/right-click to cancel**. Examples: **G** grabs (moves), **L** links, **V** orbits the view, **S** scales. Otherwise the mouse is for the camera and selection (see [5.7](#57-mouse-hotkey-mouse-movement-operators)). |
| **Vim-style keys** | **Not a priority.** An optional Vim keymap is a *Later* item. |
| **Licence and distribution** | **Open source**, distributed through **GitHub Releases**. The recommended licence is **MIT OR Apache-2.0** (the creator can change it). For updates, the MVP has no in-app network use: a "Check for updates" menu item just opens the Releases page. An **opt-in** automatic check (off by default) can come in v1. See [10.1](#101-licence-distribution-and-updates). |
| **Collaboration-ready format** | Collaboration itself is *Later*, but the format is **CRDT-friendly now**: stable ids, **objects keyed by id** instead of arrays wherever position would carry meaning, and explicit **fractional-index `order` keys** for link-type order and waypoint order. |
| **Tabs** | **Several maps open as tabs in one window.** Each tab has its own undo history, selection, camera and unsaved state. Shortcuts: **Mod+T** new, **Mod+W** close, **Ctrl+Tab** / **Mod+1…9** switch (see [5.8](#58-tabs)). |
| **Reader** | **Docked Reader panel by default**, with a pop-over card as an option. |
| **Save-mode scope** | **One app-wide preference** for now. A per-map override may come later. |
| **Newer file versions** *(after Phase 0/1)* | The format version is **MAJOR.MINOR**. A file with a **newer major** version is **refused**, with a clear message ("This map was made with a newer version of the app. Please update to open it."), and the app **never writes to it**. A read-only viewer for newer majors is *Later*. A file with the **same major but a newer minor** opens normally, and **unknown fields are kept** when saving (round-trip). See [7.5](#75-versioning-and-migrations). |
| **Spatial navigation scoring** *(after Phase 0/1)* | Arrow keys use **one scoring function with tunable weights**: angle away from the arrow direction on screen, screen distance, a **stronger depth / 3D-distance penalty** (so jumps stay in the local cluster), and a **bonus for nodes directly linked** to the current one. The cone limit stays. Weights live in **one config** and are covered by **fixture-layout tests**. See [6.3](#63-spatial-navigation-rules). |
| **Label technique** *(after Phase 0)* | **troika SDF titles are the default.** In the Phase 0 test, CSS2D was sharper close up but became a wall of cards at ~2,300 titles. A **dev/preferences toggle for CSS2D** stays until both are tested on real GPU hardware. In the MVP a **text outline** provides contrast; the rounded plate behind titles moves to **v1** as an appearance option. |
| **Repairing missing link types** *(after Phase 0/1)* | If a file has **no link types**, restore **only "relates to"**; never inject the full starter set into an existing map. Links pointing at **missing `typeId`s are reassigned to "relates to"**. **New maps** get the starter set (or, from v1, the user's template). |

**What the free-form web decision changes in this plan**

- Nodes have **no parent field**. "Child", "sibling" and "go to parent" are replaced by "new linked node", "pick a link type first" and "go back" (navigation history). See [6.2](#62-shortcut-map).
- Tree-only features become web features: "collapse subtree" becomes **focus mode** (show only nodes within N links of the selection), and the outline view becomes a **neighbourhood view** (the selected node and its links, grouped by type).
- **Force-directed auto-arrange** (an explicit command) fits a web naturally; loops and disconnected clusters are fine (see [8.7](#87-placement-and-auto-arrange-v1-for-the-command)).

**What the layout and routing decisions change**

- The map is a **stable mental picture**: nothing moves unless the user moves it or asks for an arrange. This matters in 3D, where people remember ideas by *where* they are.
- New nodes need a good **automatic placement heuristic** (see [5.4](#54-editing-flow)). It's in the MVP, because every new node depends on it.
- Links get an optional **`waypoints`** list in the data model, plus a keyboard **Waypoint mode** and mouse handles (see [5.5](#55-links-and-link-types)).

**What the node-appearance and saving decisions change**

- The 3D view shows only **icons and titles**. Rich Markdown is never drawn in the scene, only in the Reader panel when a node is opened. This keeps the scene calm and fast (see [5.3](#53-nodes-selection-and-opening) and [5.6](#56-rendering-text-legibly-in-3d)).
- Working with a node becomes **select → open (read) → edit**, with Esc stepping back one level at a time.
- File handling has **two save modes** sharing the same safety net (see [8.6](#86-file-io-saving-and-recovery)), controlled by an app-level preference (see [8.8](#88-preferences-app-settings)).

**What the latest round of decisions changes**

- The file format uses **id-keyed objects** for nodes, links, link types and waypoints, plus **`order` keys**, and gains optional `title` on links and a `resourcesFolder` setting (see [Section 7](#7-data-model)).
- The old **Move mode (M)** becomes the **Grab operator (G)**, which works with the arrow keys *and* the mouse. A new **View operator (V)** and, in v1, a **Scale operator (S)** follow the same confirm/cancel pattern. "Go to node" moves from G to **Mod+P**.
- **Tabs** make the app a multi-document workspace: per-tab stores, history and recovery files. Camera bookmarks move to **Mod+Alt+1…9**, because **Mod+1…9** now switches tabs.
- **Link labels** show title plus type name. **Images** live in a resources folder (v1). The **release pipeline** is GitHub Releases, with signing options for an open-source project.

**What the Phase 0/1 decisions change**

- File loading checks **major/minor** versions before anything else (see [7.5](#75-versioning-and-migrations)).
- Section 6.3 now describes **one weighted scoring function** instead of a cone score plus a separate depth check.
- SDF titles with an **outline** are the MVP look; title plates become a v1 option; CSS2D stays behind a toggle.
- Repair rules for link types are narrower (see [7.4](#74-integrity-rules-checked-on-load-and-after-every-command)).
- The CI build matrix moves early, because Windows and macOS haven't been verified yet (see [12.1](#121-risks) and [Section 11](#11-roadmap-and-milestones)).

**Recommendations made in this plan** (explained in [Section 10](#10-tech-stack))

| Area | Recommendation | One-line reason |
|---|---|---|
| Language | **TypeScript** | Types catch mistakes in the data model and commands early |
| UI framework | **Svelte 5** (via Vite) | Small, fast, little boilerplate; the 3D scene stays outside it anyway |
| Markdown | **markdown-it** + **DOMPurify** | Fast, synchronous, plugin-rich, easy to lock down |
| Editor | **CodeMirror 6** | Best-in-class keyboard handling, accessible, small, extensible |
| Undo/redo | **Immer** patches behind a command layer | Gives exact inverse changes almost for free |
| 3D text | **SDF text (troika-three-text)** for titles above the doc icons; full Markdown only in the **Reader panel** (HTML) when a node is opened | Legible and scalable in 3D; rich and accessible where it matters |
| Node icons | **Instanced billboarded sprites** from a small icon atlas | One draw call for every node; same silhouette from every angle |
| Preferences | **Tauri store plugin** (a JSON file in the app's config folder) | Simple, local, per-user |
| Fuzzy search | **uFuzzy** or **fuzzysort** | Tiny and fast for a command palette and the link-type picker |
| Link rendering | One batched line geometry **per link type**, instanced arrowheads | Cheap filtering (hide/dim a type in one switch) and few draw calls |
| Validation | **Valibot** or **Zod** | Safe loading of files and clean migrations |
| Ordering | **fractional-indexing** (order keys) | Collaboration-ready ordering of link types and waypoints |
| Licence | **MIT OR Apache-2.0** | Permissive and matches Tauri and most dependencies; the creator can change it (see [10.1](#101-licence-distribution-and-updates)) |

---

## 2. Goals and non-goals

### Goals

1. **Thinking in space.** Let people arrange ideas in three dimensions, so large or tangled topics have more room than a flat canvas.
2. **Keyboard-first.** Every action is reachable from the keyboard, fast, and predictable. A mouse is optional.
3. **Show what kind of relationship it is.** Typed links make "A causes B", "A is part of B" and "A contradicts B" look different at a glance, and let people filter and navigate by relationship.
4. **Markdown everywhere.** Node and link text is plain Markdown: portable, readable in the raw file, easy to edit.
5. **Legible 3D.** Text stays readable however the camera moves.
6. **Your files, your machine.** Maps are ordinary local files. Everything stays on the user's computer: no account, no cloud, no telemetry.
7. **Lightweight and fast.** Quick start-up, small download, smooth with large maps.
8. **Safe with your data.** You choose manual save (default) or autosave; either way, crash recovery, atomic saves and a versioned file format.

### Non-goals (for MVP and v1)

| Non-goal | Why |
|---|---|
| General 3D modelling or drawing | It's a thinking tool, not Blender. Nodes are simple document icons. |
| Cloud sync, accounts, sharing service, telemetry | Decided: everything is local. Users can put files in their own synced folder. |
| Real-time collaboration | Hard to do well. Planned for "Later" (see [Section 4](#4-feature-list)). |
| Strict hierarchies / org-chart tools | Maps are free-form webs. A tree is just one shape a web can take. |
| Formal ontologies or knowledge-graph reasoning | Link types are for people to read, not for inference engines (though the typed JSON makes export possible later). |
| Mobile apps | Desktop first. A read-only viewer might come later. |
| Full note-taking or wiki app | Nodes hold short-to-medium notes, not whole documents. |
| VR/AR | Possible later via WebXR, out of scope now. |

---

## 3. Target users and core use cases

These are *likely* audiences, not research findings. The creator should check them against their own reasons for building the app.

### Likely users

| User type | What they want |
|---|---|
| **The creator** | A tool that fits the way they think |
| **Keyboard power users** (developers, Vim/Emacs users, writers) | Fast capture and navigation without touching the mouse |
| **Students and researchers** | Map topics, sources and how they relate, with notes on the links |
| **Writers and worldbuilders** | Characters, places and plot threads, with relationships described on links |
| **Engineers and architects** | Map systems, dependencies and concepts where a flat diagram gets crowded |
| **Visual and spatial thinkers** | Use depth and grouping to show structure |

### Core use cases

1. **Quick capture.** Open a new map, type an idea, press **Tab** repeatedly to brainstorm connected ideas, all without leaving the keyboard. There's no need to decide on a "centre" first.
2. **Describe relationships.** Link two existing ideas, pick a **link type** with a single number key ("causes", "contradicts", "example of"…), and optionally write *why* in the link's own Markdown text.
3. **Read the web by relationship.** Show only "causes" links to see a chain of cause and effect, dim everything except "contradicts" to find tensions, or walk along "depends on" links from node to node with the keyboard.
4. **Explore and review.** Fly around a large map, jump between nodes with the arrow keys, read the full Markdown of each node in the side panel.
5. **Find anything.** Press **/** and type part of a node's text to jump straight to it.
6. **Restructure.** Move nodes in 3D, re-link, change link types, delete, undo.
7. **Keep and share files.** Save as a `.json`-based file, back it up, put it in version control, send it to a friend.

---

## 4. Feature list

### MVP — the smallest version that's genuinely useful

| Area | Feature |
|---|---|
| Nodes | Create, edit, delete; Markdown text; optional explicit title; shown in 3D as a **doc icon with its title floating above** |
| Reader | **Open** a node or link (click icon / Enter) to see its full rendered Markdown in the Reader panel; **E** or Enter switches to editing; Esc closes; optional "pin reader" that follows the selection |
| Placement | **Auto-placement of new nodes** near the node they're linked from, avoiding overlaps; positions then persist exactly as the user leaves them (Grab, by keyboard or mouse) |
| Links | Create between any two nodes (loops allowed), optional Markdown text and title, delete; 3D label shows the **link title with the type name below it** (type name only if there's no title); Enter opens the link in the Reader; **several links between the same pair** curve apart; self-links in files are kept and drawn as a loop |
| Link types | **Typed links with the default starter set** (see [5.5](#55-links-and-link-types)); **type picker** when creating (number keys or fuzzy search); change or cycle the type of a selected link; reverse direction; type shown by colour + line style + arrowheads |
| Link-type manager (basic) | Create, rename, recolour, restyle, set direction, reorder, delete (with "move these links to…" type) |
| Legend and filters | **Legend overlay** listing the map's types with counts; per-type **show / dim / hide / solo**, by keyboard |
| Type navigation | Cycle a node's links of one type; **follow** links of the active type from node to node |
| Editing | CodeMirror Markdown editor with live preview in the same panel (opened from the Reader, or directly with E); optional title field |
| Camera | Orbit, pan, zoom (keyboard and mouse, including the **V** view operator); "focus selection"; "frame all" |
| Mouse operators | Blender-style **hotkey + mouse movement**: **G** grab/move (axis constraints, depth, precision, snap), **L** link (target follows the pointer), **V** view; click/Enter confirms, Esc/right-click cancels; one undo step each |
| Tabs | Several maps as **tabs** in one window, each with its own undo history, selection, camera, Reader state and unsaved indicator; Mod+T / Mod+W / Ctrl+Tab / Mod+1…9; single instance (opening a file from the OS adds a tab) |
| Navigation | Spatial arrow-key navigation between nodes; cycle through a node's links; back/forward navigation history |
| Modes | Navigate, Reader, Edit, Link, Grab, View, Command palette… always shown in the status bar |
| Command palette | **/** or **Ctrl/Cmd+K**: fuzzy search over commands and node text |
| Undo/redo | For all document changes, with typing grouped into sensible steps |
| Files | New, Open, Save, Save As; **`.mindmap3d`** versioned JSON format with id-keyed objects and order keys; atomic writes; all local; **file association** registered by the installers |
| Saving | **Manual save by default** (Mod+S) with unsaved-changes indicator and prompt on close; **optional autosave-to-file mode** in Preferences |
| Safety | Crash-recovery file (in both modes); crash recovery prompt on start-up; backups of previous versions |
| Preferences | Basic Preferences window (Mod+,): save mode, autosave timing, backups, label size, theme, reduced motion, link-type picker behaviour |
| Help | **?** shows a shortcut cheat sheet |
| Accessibility baseline | Visible focus/selection, screen-reader announcements of selection, reduced-motion support, no keyboard traps |
| Packaging and release | Installers for Windows, macOS, Linux, built by CI and published on **GitHub Releases** with checksums; open-source licence files; "Check for updates" menu item that opens the Releases page (no in-app network use) |

### v1 — a polished, "real" release

| Area | Feature |
|---|---|
| Auto-arrange | **Auto-arrange selection** and **Auto-arrange all**: explicit, undoable commands running a 3D force-directed layout in a background worker; never automatic. Pinned nodes are excluded; **per-type spring settings** (e.g. "part of" pulls tight, "relates to" is loose) |
| Link waypoints | Pinned waypoints on links: add, select, move, delete, reorder by keyboard (**Waypoint mode**) and mouse (click to select, **G** to grab, double-click the path to insert); smooth spline routing through them; waypoints move with a moved selection; "clear waypoints" returns to auto-routing |
| Images and attachments | **Resources folder** next to the map; insert by keyboard (Mod+Shift+I), drag-and-drop or paste (always **copied** into the folder); images shown in the Reader; other files open in their default app; missing-file placeholders with Locate/Remove; "Check resources"; Save As copies the folder |
| Update check | **Opt-in** automatic check against GitHub Releases (off by default; notification only) |
| Neighbourhood view | A 2D list of the selected node and its links grouped by type, expandable hop by hop (loops shown as references), synced with the 3D view; also the main screen-reader path |
| Link types (advanced) | Icons and descriptions polish, **animated flow** along directed links, type-set templates (save/load a type set to reuse in other maps), **"use these types as my default for new maps"** (app-level starter set), merge two types, usage counts |
| Advanced filters | Saved filter presets ("Causal view"), combine type filters with text search, "show path between two nodes using only type X" |
| Multi-select | Select several nodes (and waypoints); grab, delete, style them together; Shift+click; **S** scale operator for node size |
| Styling | Node colour, size and icon variant; link colour, style and direction arrow |
| Themes | Light, dark, high-contrast; user-adjustable font size; **rounded plates behind titles** (appearance option) |
| Search | Find with highlight and "next match"; filter/dim non-matching nodes |
| Focus mode | Show only nodes within N links of the selection (optionally only through chosen types); replaces tree-style "collapse" |
| Export | PNG screenshot; Markdown outline; plain JSON |
| Import | Markdown outline (headings or nested lists) to map |
| Keymap | User-remappable shortcuts |
| Camera bookmarks | Save and recall viewpoints (**Mod+Alt+Shift+1…9** / **Mod+Alt+1…9**) |
| Session | Reopen last session's tabs (preference); recent files |
| Label LOD | Smarter level-of-detail and overlap handling for labels on big maps |

### Why link types are split this way

- **MVP: typed links, starter set, picker, legend, basic manager and simple filters.** Link types are now central to the concept, so a version without them wouldn't show what the app is for. The cost is also small once types exist in the data model. The basic manager is a short form (name, colour, pattern, width, direction). Show/dim/hide is nearly free, because each type is drawn as its own batch, so hiding a type is one switch. Without a legend and filters, a map with several types quickly becomes hard to read.
- **Waypoints in v1, with the data field from version 1.** Auto-routing plus fanning of parallel links covers most maps, and waypoints add a new mode, spline routing, handle picking and their own undo cases (roughly 2–3 units). The `waypoints` field is in the file format from version 1, so adding the feature needs no migration. If hand-routing links matters early to the creator, it's the easiest v1 item to pull forward.
- **Tabs and mouse operators in MVP.** Tabs change the core architecture (one store, history and save controller per document), so it's cheaper to build them in from the start than to add them later. The G/L/V operators share one small modal framework that the keyboard modes need anyway.
- **Images in v1.** They need scoped file access, copying, Save As copying, relinking and missing-file handling (roughly 2–3 units), and the MVP is already full. The format reserves `resourcesFolder` from version 1, so no migration is needed. Until then, the MVP Reader shows image Markdown as a labelled placeholder rather than a broken image.
- **Auto-arrange in v1, auto-placement in MVP.** Every new node needs a good position, so placement is MVP. A full force-directed arrange needs a worker and tuning, and isn't needed while maps are small.
- **v1: the polish and power features.** Animated flow, icons, templates, merging types, saved filter presets, path-finding and per-type layout springs. They're valuable but not needed to prove the idea, and several depend on v1 auto-layout.

### Later — ideas, not commitments

- Real-time collaboration (likely a CRDT such as Yjs or Automerge)
- Typed-link queries ("everything that eventually causes X"), and export of the typed web to graph formats (e.g. GraphML, CSV edge lists)
- Shared link-type libraries across maps
- **Creating self-links** (a node linked to itself), with a proper loop rendering and editing UI
- **Optional Vim-style keymap** (h/j/k/l etc.)
- **Per-map save-mode override**
- In-app update download and install (Tauri updater), only if users ask for it
- Interactive HTML export (a self-contained 3D viewer), glTF export
- Import from OPML, FreeMind/Freeplane and other mind-map formats
- Links between maps; dragging a tab out into its own window
- Version history browser
- Plugin/scripting API
- WebXR/VR viewing mode
- Read-only mobile viewer
- **Read-only viewer for files from a newer major format version** (instead of refusing to open them)

---

## 5. UX and interaction design

### 5.1 Screen layout

```
+--------------------------------------------------------------+
|  Title bar / native menu                                     |
|  [ Urban flooding * ] [ Research ] [ + ]        (tab strip)  |
+-------------------------------------------+------------------+
|                                           | Reader / editor  |
|                  3D scene                 | panel (opens on  |
|    (doc icons + titles, links, labels)    | Enter/click;     |
|                                           | E to edit)       |
|                                           |                  |
+-------------------------------------------+------------------+
| Status bar: MODE | selection | hints | ● Unsaved changes     |
+--------------------------------------------------------------+
     Overlays: command palette, help sheet, dialogs
```

- The **Reader / editor panel** is docked on the right, resizable, and **closed until a node or link is opened**. It shows rendered Markdown (Reader) or the editor with live preview (Edit). **Mod+\\** "pins" it open so it follows the selection while you navigate.
- The **save indicator** appears in the status bar and window title: a dot "●" and "Unsaved changes" in manual mode; "Autosaving…" / "Saved 14:32" in autosave mode; "Not saved yet" for a new, never-saved map. On macOS the standard "edited" dot in the window's close button is used where the platform allows.
- The **status bar** always shows the current **mode** and context hints such as "Enter: open · E: edit · L: link · G: grab · /: commands". During a mouse operator it shows the operator, any axis constraint and the current value ("Grab · X axis · 2.40"). A keyboard-first app depends on this.
- The **tab strip** shows one tab per open map, with "●" on tabs with unsaved changes (shown as `*` in the sketch above; see [5.8](#58-tabs)).

### 5.2 3D navigation

The camera **orbits around a focus point**, normally the selected node. This is easier to keep track of than free flight, which tends to leave people lost.

| Action | Keyboard | Mouse |
|---|---|---|
| Orbit around focus | Shift + Arrows | Left-drag on empty space |
| Pan | Alt/Option + Arrows | Right-drag or middle-drag |
| Zoom | **=** / **-** | Scroll wheel |
| Focus on selection | **F** | Double-click a node's title |
| Frame all | **Shift+F** or **Home** | — |
| View operator | **V**, then move the mouse (orbit; Shift pans; wheel zooms) | Click keeps the view; Esc/right-click restores it |

Design rules:

- **Smooth, short camera moves** (about 250–400 ms). When reduced motion is on, the camera cuts straight to the new view.
- **Auto-follow:** when the selection jumps to a node that is off-screen or too far away, the camera eases over to keep it in view.
- **Orientation aids:** a small axis gizmo in a corner, a subtle ground grid or fog for depth, and depth cues (far nodes are a little smaller and dimmer).
- **"Up" stays up:** the camera never rolls, so the horizon stays level.

### 5.3 Nodes, selection and opening

#### What a node looks like

| Element | Design |
|---|---|
| **Icon** | A small **document icon** (page with a folded corner), drawn as a **billboarded sprite**, so it always faces the camera and has the same recognisable silhouette from every angle. Tinted with the node's colour. Two variants show at a glance whether there's more to read: a page with text lines (the node has body text beyond its title) or a blank page (title only). |
| **Title** | Floats **just above the icon**, billboarded, in SDF text (troika-three-text) with a thin contrasting **outline** (a rounded plate behind it is a v1 appearance option). Up to 2 lines (about 28 characters each), then "…". |
| **Title source** | The node's **explicit `title`** if set, otherwise **derived** from the Markdown: the first heading if the text starts with one, else the first non-empty line, with inline formatting removed. The same title is used everywhere: 3D, palette, legend counts, announcements, Reader header. |
| **Size** | Fixed world size with a clamped minimum on-screen size, so icons never vanish; an optional per-node size in style. |
| **Distance** | Near: icon + full title. Mid: icon + shortened title. Far: icon only. Very far: a small dot. |

*Why a billboarded sprite rather than a 3D model:* it reads clearly from every angle, it's one cheap instanced draw call for thousands of nodes, and it matches the billboarded titles. A slight shading in the icon art gives a hint of depth. A true 3D page model can be an optional theme later.

#### Selection

- There is always a **current item** (a node or a link). A selected node's icon grows slightly and gets a strong outline and glow, and its title becomes bold and brighter. Colour is never the only signal; size, outline shape and thickness change too.
- **Mouse:** clicking a **title** selects the node; clicking the **icon** selects it *and opens it*; hovering an icon lifts it slightly and shows a pointer cursor. Clicking a link's label or line selects the link. Editing with the mouse uses the hotkey operators (see [5.7](#57-mouse-hotkey-mouse-movement-operators)).
- With multi-select (v1), **Space** adds or removes the current item from the selection set. The current item and the set are shown differently.
- Selection changes are announced to screen readers (see [Section 6.5](#65-accessibility)).

#### Opening a node (Reader)

- **Enter** on the selected node, or **clicking its doc icon**, **opens** it: the Reader panel slides in and shows the node's **full Markdown, rendered** as HTML (headings, lists, code, tables, task lists, links), under a header with the title, the node colour, and a compact list of its links grouped by type.
- The 3D node stays highlighted while it's open, and the camera eases to keep it visible beside the panel.
- **Why a docked panel and not a floating card:** notes can be long, and a panel scrolls comfortably and never covers the scene. Switching to editing happens in the same place, and it's a stable, well-labelled region for keyboard and screen-reader focus. A floating card beside the node is offered as a Preference ("Open as pop-over card") for people with mostly short notes.
- In the Reader: **↑/↓, PageUp/PageDown, Space** scroll; **Tab** moves through links in the content; **E** or **Enter** switches to **Edit**; **Esc** closes and returns focus to the node in the scene.
- **Links open the same way:** Enter on a selected link (or double-clicking its label) opens the link's Reader. It shows the link's **title**, its type and direction ("*Rain* → causes → *Flooding*"), and its full rendered Markdown. **E** edits it, with the same title field and editor as nodes.
- **Pin reader (Mod+\\):** keeps the panel open in Navigate mode and shows whatever is selected, read-only, while focus stays in the scene. It's good for browsing a map with the arrow keys.
- Rendered Markdown is sanitized, and links in it open in the external browser. Remote images aren't loaded unless the user allows it (local-only decision).

### 5.4 Editing flow

1. **Get into Edit:** from the Reader press **E** or **Enter**, or from Navigate press **E** to skip the Reader and edit straight away. New nodes made with Tab open directly in Edit. Links are edited the same way: their title field sets the label shown in 3D.
2. The panel shows an optional single-line **Title** field (its placeholder shows the derived title) above the **CodeMirror** Markdown editor, with live preview beside or below it. **Alt+T** moves between the title field and the body.
3. Type Markdown. The preview updates as you type, and the 3D title updates after a short debounce.
4. **Esc** commits and **goes back to where you came from**: the Reader if you came from it, otherwise Navigate. **Mod+Enter** commits and goes straight to Navigate. Focus returns to the scene with the same item selected.
5. Each edit session counts as **one undo step**. Long sessions are split into steps after pauses in typing.

**Creating with Tab:** in Navigate mode, **Tab** creates a new node linked from the current node, using the **last-used link type** (or the map's default type, "relates to", at first). It is placed at a sensible offset (see below), selected, and opened straight into Edit mode. So "type, Esc, Tab, type, Esc, Tab…" is a fast brainstorming loop. **Shift+Tab** does the same, but opens the link-type picker first.

**Where new nodes go (auto-placement, then manual):**

1. **Anchor:** the node it's linked from (Tab, Shift+Tab, N in Link mode). For an unlinked node (Mod+Enter), the anchor is the camera's focus point, slightly in front of the camera.
2. **Candidates:** about 30–60 directions spread evenly on a sphere around the anchor, at a standard distance (scaled to node size).
3. **Score each candidate:** heavily penalise being close to any existing node or link label (overlap); prefer directions *away* from the anchor's existing neighbours (so links fan out); prefer positions visible from the current camera and not hidden behind other nodes; slightly prefer staying near the screen plane, so the new node is easy to see.
4. **Pick the best.** If everything nearby is crowded, try again at 1.5× and then 2× the distance.
5. **Local nudge:** run a few repulsion-only steps on **the new node only** against its near neighbours (found with a spatial grid), so it settles into free space. **Existing nodes never move.**
6. The position is now **the user's**. It only changes when the user moves the node (the **G** grab operator, by keyboard or mouse) or explicitly runs Auto-arrange.

Pasted nodes keep their arrangement relative to each other, and the group is offset into the nearest free space using the same scoring.

### 5.5 Links and link types

#### Link types

Each map has a **link-type registry**. A type defines how its links look and behave:

| Property | Options | Notes |
|---|---|---|
| Name | Free text | Shown in the legend, picker and screen-reader announcements |
| Colour | Any colour | The starter set uses a colour-blind-friendly palette (Okabe–Ito) |
| Line pattern | solid · dashed · dotted | So types differ even without colour |
| Line width | thin · normal · thick | |
| Direction | **directed** (A → B) · **bidirectional** (A ↔ B) · **undirected** (A — B) | Controls arrowheads and which way "follow" goes |
| Icon (optional) | A short symbol or emoji, e.g. ✕, +, ⚙ | Drawn next to the link's label |
| Description (optional) | Markdown | Shown in the manager and as a hint in the picker |

**Default starter set** (every new map gets these; all of them can be edited or deleted):

| # | Type | Direction | Colour | Line | Icon | Meaning |
|---|---|---|---|---|---|---|
| 1 | **relates to** *(default)* | undirected | grey #999999 | solid, normal | — | General connection |
| 2 | **leads to / causes** | directed | orange #E69F00 | solid, normal | → | A causes or results in B |
| 3 | **part of** | directed | blue #0072B2 | solid, thick | ◆ | A is a component of B |
| 4 | **depends on** | directed | purple #CC79A7 | dashed, normal | ⚙ | A needs B |
| 5 | **contradicts** | undirected | vermilion #D55E00 | dashed, thick | ✕ | A and B are in tension |
| 6 | **example of** | directed | sky blue #56B4E9 | dotted, normal | ● | A is an instance of B |
| 7 | **supports** | directed | green #009E73 | solid, normal | + | A is evidence for B |

None of the starter types is bidirectional. That option is there for user types such as "collaborates with" or "influences each other". Types are listed in a **user-set order**, and the first nine get number keys **1–9** in the picker.

**Direction is defined by the type.** A link stores `source` and `target`. For directed types that's the arrow's direction; for undirected types the order doesn't matter. **R** reverses a selected link (swaps source and target). A per-link direction override is left out on purpose, to keep the meaning of a type consistent.

#### How links look in 3D

- **Auto-routed curves (default):** gentle quadratic Bézier curves between node surfaces (not centres), so arrowheads aren't hidden inside nodes. They re-route live whenever either node moves. Links with waypoints follow the user's route instead (see *Waypoints* below).
- **Starter set:** approved as listed. Every starter type can be edited or deleted. In v1, *"Use these types as my default for new maps"* saves the current map's types as an **app-level template**, stored in the app's config folder. New maps then start from it instead of the built-in seven, and *"Reset to built-in starter set"* restores the original.
- **Pattern and width:** Three.js "fat lines" (`Line2`/`LineMaterial`) support dashes and real widths. WebGL ignores plain line width on most platforms. Dashes need line distances computed when the curve geometry is built.
- **Colour + pattern + icon together**, so no type relies on colour alone.
- **Label:** at the curve's midpoint, billboarded, with the same contrasting outline (optional plate in v1), in two lines:
    - **Line 1, the link's title:** its explicit `title`, else the first heading of its Markdown, else its first line, with formatting removed. The same rule as node titles, shortened with "…" if long.
    - **Line 2, the type name**, in a smaller, lighter style in the type's colour, with the type icon in front ("→ leads to / causes").
    - **A link with no title** shows only the type line.
- The full link Markdown is never drawn in 3D. **Enter** opens it in the Reader, exactly like a node.
- **Level of detail:** near, both lines show. Mid-range, only the title (or the type name if there's no title). Far, no label; the line style and colour still identify the type, and the legend explains them.

#### Rendering direction

| Direction | Static rendering (default) | Animated flow (v1, optional) |
|---|---|---|
| Directed | A 3D cone arrowhead at the target end, just outside the target node, pointing along the path's final direction (so it's correct with waypoints too); optionally small chevrons along long links | Dashes or small dots drift from source to target |
| Bidirectional | Arrowheads at both ends | Dots drift both ways |
| Undirected | No arrowheads | None |

- Arrowheads are real 3D cones (instanced, one batch per type), so they read from any angle. They scale with the link width and are clamped to a minimum on-screen size, so they never disappear.
- **Animated flow** is a shader effect (scrolling the dash offset over time). It's off by default, can be switched on for **all links**, **only the selection's links**, or **off**, and is always off when the OS "reduce motion" setting is on. Animation means rendering continuously, so it runs at a capped frame rate and stops when the window is in the background.

#### Several links between the same two nodes

A web often has more than one relationship between the same pair (A *causes* B **and** A *contradicts* B). All links between a pair, in either direction, are grouped:

- One link: a gentle default bow (or straight, by setting).
- Two or more: the curves **fan out around the line between the two nodes**, at equal angles around it (two links bow to opposite sides, three at 120°, and so on), with the bow growing a little for each extra link. They stay apart from every viewing angle.
- Labels sit at each curve's own midpoint, so they don't stack.
- **Links with waypoints are left out of the fan.** Their route belongs to the user, and the remaining auto-routed links in the pair fan among themselves. Two links can share a waypoint *position* but never a waypoint *object*, so each link stays independent.
- **Self-links** (a node linked to itself) are **allowed by the data model**, but creating them is a *Later* feature. If a file contains one, the MVP keeps it and draws a small loop beside the node, with its label at the top of the loop.

#### Waypoints (pinned link routes)

By default a link routes itself. When a link needs to go *around* something, or the user wants a tidy route, they can pin **waypoints** on it. The link then travels **source → waypoint 1 → waypoint 2 → … → target**, in the user's order.

**Rendering a link with waypoints**

- The path is a **centripetal Catmull–Rom spline** through: the point on the source node's surface facing waypoint 1, every waypoint in order, and the point on the target's surface facing the last waypoint. Centripetal Catmull–Rom passes exactly *through* every pin, doesn't overshoot into loops or cusps, and needs no extra control handles. A per-link "tension" setting can come later.
- The spline is sampled **adaptively** (more points on tight bends) into the same per-type batched line geometry as other links. Dashes, dots and flow animation run continuously along the whole path, measured by arc length.
- **Arrowheads** sit at the end of the path, oriented along its final direction, just outside the target node. Bidirectional links get one at each end.
- **Label** at the **arc-length midpoint** of the whole path by default, billboarded as usual. A per-link option anchors it to the middle of a chosen segment instead ("label on segment 2"), useful when the midpoint lands on a sharp bend.
- **Waypoint handles** (small diamonds numbered 1, 2, 3…) are only shown when the link is selected or in Waypoint mode, so they add no clutter otherwise. They're clamped to a minimum on-screen size. A faint "drop line" to the ground grid shows each handle's depth.
- **Order** is stored as a fractional-index `order` key on each waypoint, so reordering changes one key and never renumbers the others (collaboration-ready).

**Keyboard: Waypoint mode** (full table in [6.2](#62-shortcut-map))

- With a link selected, **W** enters **Waypoint mode** with the first waypoint selected (or none, if the link has none yet). **Shift+W** is a fast path: it adds one waypoint at the middle of the path and enters Waypoint mode with it selected, so *Shift+W, arrows, Enter* bends a link in a few keystrokes.
- **] / [** select the next / previous waypoint; **Home / End** the first / last; **1–9** jump to waypoint 1–9.
- **A** inserts a new waypoint **after** the selected one, at the middle of the next segment; **Shift+A** inserts **before**. With nothing selected, it goes in the middle of the longest segment.
- **Arrows** move the selected waypoint in the screen plane, **Shift+Arrows** in bigger steps, and **PageUp / PageDown** further from / closer to the camera. The path redraws live, and the camera eases to keep the waypoint in view. **G** grabs the selected waypoint(s) with the mouse (same operator as for nodes).
- **Space** adds or removes the current waypoint from the selection, so several waypoints can be grabbed together.
- **Mod+← / Mod+→** move the selected waypoint **earlier / later in the order**. Its position stays the same; the route changes.
- **Delete / Backspace** removes the selected waypoint; **Shift+Delete** clears all of this link's waypoints, so the link goes back to auto-routing.
- **Esc** backs out one level: during a run of moves, the first Esc puts the waypoint back where that run started, and the next Esc leaves Waypoint mode. **Enter** leaves Waypoint mode, keeping everything. Every change is undoable either way.
- From Navigate mode, **Shift+Delete** on a selected link also clears its waypoints.

**Mouse**

Following the hotkey + mouse scheme ([5.7](#57-mouse-hotkey-mouse-movement-operators)):

- Selecting a link shows its handles. **Click a handle** to select it (**Shift+click** adds to the selection), then press **G** and move the mouse. **Click** or **Enter** confirms; **Esc** or **right-click** cancels. While grabbing, **X/Y/Z** constrain to an axis and the **wheel** moves in depth.
- **Double-click the path** to insert a waypoint at that spot. Its place in the order comes from the segment that was clicked, so it never scrambles the route. The new waypoint is selected, ready for **G**.
- **Delete** removes the selected waypoint(s). **Shift+Delete** clears them all.

**When nodes move**

**Waypoints move with the selection** (decided):

- When a **group of nodes is grabbed together**, waypoints on links with **both ends inside the group** move with it as one rigid piece, so a cluster keeps its internal routes.
- **Selected waypoints** also move with the selection. Selecting nodes plus some waypoints and pressing **G** moves all of them by the same amount.
- **Everything else stays put.** If you move one node on its own, the waypoints on its links don't move (unless they're selected); only the first or last stretch of the path re-attaches to the node's new position. Waypoints on links with just one end in the moved group also stay put.
- **Auto-arrange** isn't a rigid move, so waypoints on links between arranged nodes are shifted by the **average movement of the link's two end nodes**. That keeps routes roughly attached. The option *"Reset waypoints on links between arranged nodes"* gives a clean slate instead. Either way it's one undo step.
- **Deleting a node** deletes its links and their waypoints. **Copy/paste** keeps waypoints on links between copied nodes, offset with the pasted group.
- **Reversing a link (R)** reverses the waypoint order too, so the drawn route stays the same.

#### Creating a link and choosing its type

1. Press **L** to enter **Link mode**. The current node is the source, and a dashed "rubber band" follows a target cursor.
2. Move the target with the **arrow keys** (same spatial rules), press **/** to pick a target by name, or **N** to create a new target node.
3. *Optional shortcut:* press **1–9** while in Link mode to pick a type up front. The rubber band changes to that type's colour and style.
4. Press **Enter**.
   - If you already picked a type, the link is created straight away.
   - Otherwise the **type picker** pops up next to the rubber band. It lists types with number keys, colour swatches and icons, with the last-used type highlighted. Press **1–9** to pick instantly, type to fuzzy-search, **↑/↓** and **Enter** to choose, **Mod+N** to create a new type from what you typed, or **Esc** to go back to Link mode.
5. The new link is selected. Press **Enter** to write its Markdown text, or **Esc** to carry on.

A setting "Skip the picker; use the last-used type" turns step 4 into a single keypress for fast linking.

#### Changing the type of an existing link

With a link (or several) selected in Navigate mode:

- **1–9** sets the type directly.
- **T** opens the type picker.
- **Shift+T** / **Alt+Shift+T** cycles to the next / previous type. The status bar shows the new type name, and one undo step covers a whole run of cycling.
- **R** reverses the direction.

#### Link-type manager

A panel (**Mod+Shift+L**, or "Manage link types" in the palette), usable entirely by keyboard:

- A list of types in order, each with its swatch, pattern, direction, icon and **how many links use it**.
- **↑/↓** move between types, **Enter** edits the selected type in a small form (name, colour, pattern, width, direction, icon, description), **Mod+N** adds a type, **Alt+↑/↓** reorders (which changes the 1–9 keys), **Delete** removes a type.
- Deleting a type that's still in use asks what to do with its links: **move them to another type** (default: "relates to") or **delete them**. One undo step either way.
- Every map must keep at least one type. The default type for new links can be changed here.
- *(v1)* Merge two types; save the type set as a template; load a template into another map.

#### Legend overlay

- A compact, semi-transparent panel in a corner (toggled with **Shift+L**). It lists every type in use with its swatch, line sample, arrow style, icon, number key and count.
- Each entry shows its filter state: **shown**, **dimmed** or **hidden**.
- **Shift+L** opens it with keyboard focus inside: **↑/↓** move, **Space** cycles shown → dimmed → hidden, **S** "solo" (show only this type, dim the rest), **A** show all, **Enter** opens the type in the manager, **Esc** returns focus to the scene.
- It updates live as types are added or used. Unused types are greyed out, or hidden by a setting.
- The legend is the full key to the line styles. The type name under each link label covers types close up; the legend covers links seen from a distance, where labels are hidden.

#### Filtering and highlighting by type

| State | Effect |
|---|---|
| **Shown** | Normal rendering |
| **Dimmed** | Lines, arrowheads and labels drawn at low opacity; still navigable |
| **Hidden** | Not drawn, not picked by the mouse, skipped by link cycling and by follow navigation |

- Quick keys in Navigate mode: **Alt+1…9** toggles type 1–9 between shown and hidden, and **Alt+0** shows all types. The palette has commands such as "Filter: solo *causes*".
- Option: **"Dim nodes with no visible links"**, so the chosen relationship's structure stands out.
- Filters are **view state**: never in undo history and never "unsaved changes". They are remembered in the file alongside the camera, so a map reopens with the same view.
- The status bar shows a reminder when any filter is active ("2 types hidden"), so hidden links never surprise anyone.

#### Navigating along links of a type

- **] / [** cycle through all visible links attached to the current node.
- **Alt+] / Alt+[** cycle only through links of the **active type**. The active type is the type of the most recently selected link; change it with the picker.
- **.** (follow) jumps from the current node across a link of the active type **in its direction** (outgoing for directed types), and **,** jumps backwards (incoming). If there are several candidates, a mini chooser lists them with number keys. Repeating **.** walks a chain, e.g. along a sequence of "causes" links.
- When a link is selected, **←/→** jump to its source/target node.

### 5.6 Rendering text legibly in 3D

This is the biggest UX risk, so it gets its own section.

**Options compared**

| Technique | How it works | Pros | Cons |
|---|---|---|---|
| **CSS2DRenderer** (HTML overlay) | DOM elements positioned over the canvas at projected 3D points | Crisp text; full HTML/CSS so rendered Markdown "just works"; easy | Not hidden behind 3D objects; every label is a DOM element, so it gets slow past a few hundred; manual z-ordering |
| **CSS3DRenderer** | DOM elements transformed with CSS 3D | Real perspective | Blurry at angles; same DOM costs; hard to read |
| **SDF text** (e.g. troika-three-text) | Text drawn in WebGL from signed-distance-field glyphs | Lives in the scene (correct occlusion and depth); sharp at any scale; thousands of labels are fine | Limited formatting (no rich Markdown); glyph generation for large character sets such as CJK has a first-use cost |
| **Canvas textures on sprites** | Draw text to a 2D canvas and use it as a texture | Simple | Blurry when zoomed; memory-hungry; re-render on every edit |

**Recommendation (fits the node-appearance decision)**

- **Titles in 3D use SDF text (troika-three-text)**, billboarded and anchored just above each node's doc icon (bottom-centre of the text at the icon's top, plus a small gap in screen pixels). Plain text only: the explicit title or the derived first heading/line, at most 2 lines.
- **Link labels** use the same SDF text at the link's path midpoint: the link's **title** on top and the **type name** below in a smaller, lighter style (type name only if there's no title).
- **Full Markdown is rendered only when a node or link is opened**, as real HTML in the Reader panel (or the optional pop-over card). The scene never has to draw rich text, so there's no DOM-per-node cost and no blurry text in 3D.

**Phase 0 result (decided):** both versions were built and compared. **CSS2D** was sharper close up, but with ~2,300 titles it became a wall of overlapping cards. **troika SDF** stayed readable and scales, so **SDF is the default**. A **dev/preferences toggle** keeps the CSS2D renderer available until both have been tested on real GPU hardware (the Phase 0 numbers didn't come from a range of real GPUs). After that, the toggle can be removed or kept as a hidden option.

**Legibility rules (any technique)**

- **Billboarding:** labels always face the camera.
- **Clamped size:** labels scale with distance but are clamped to a minimum and maximum *on-screen* size, so near labels don't fill the screen and far ones don't become specks.
- **Contrast:** in the MVP, a thin **outline** around the SDF glyphs (troika supports outlines), coloured per theme. It's cheap and stays crisp at any distance. A semi-opaque **rounded plate** behind titles is a **v1 appearance option**.
- **Distance fade and culling:** labels fade out beyond a set distance and are hidden completely further away. The doc icon itself stays visible, shrinking to a dot at extreme distance.
- **Priority and overlap:** if labels overlap on screen, show the higher-priority one (selected > neighbours of selected > nearer > more connections) and hide or fade the rest.
- **Device pixel ratio:** render at the screen's real pixel density so text is sharp on HiDPI displays.
- **User font scale:** a setting to make every label larger.

### 5.7 Mouse: hotkey + mouse-movement operators

The mouse works **Blender-style**: the mouse is for **camera and selection**, and **editing is "press a key, then move the mouse"**. This keeps one hand on the keyboard, avoids fiddly dragging of small targets in 3D, and every operation has the same confirm/cancel rules.

**Plain mouse (no operator active)**

| Action | Mouse |
|---|---|
| Orbit / pan / zoom | Left-drag on empty space / right- or middle-drag / wheel |
| Select node or link | Click its title, icon, label or line |
| Open node | Click its doc icon (or double-click a link label) |
| Add to selection (v1) | Shift+click |
| Focus camera | Double-click a node's title |
| Insert waypoint (v1) | Double-click a link's path |

Clicking empty space does **not** clear the selection, so a stray click never loses your place. **Esc** clears it.

**Operators**

| Key | Operator | Moving the mouse… | While active |
|---|---|---|---|
| **G** | **Grab** the selected node(s) and selected waypoints | moves them in the plane facing the camera | **X / Y / Z** lock to a world axis (press again to unlock); **wheel** or **PageUp/PageDown** moves in depth; **Shift** = precision (slower); **Ctrl** = snap to grid; **arrows** nudge; *(v1)* type a number for an exact distance, e.g. *G X 2 Enter* |
| **L** | **Link** from the current node | the rubber band follows the pointer; the node nearest the pointer highlights as the target | **click** a node = target; **N** = new node at the pointer; **1–9** pre-pick a type; arrows / **/** still work |
| **V** | **View**: orbit around the focus point | orbits | **Shift** pans; **wheel** or **Ctrl+move** zooms |
| **S** *(v1)* | **Scale** node size | pointer distance from the selection centre scales it | **Shift** = precision; **Ctrl** = 10% steps |

**Rules for every operator**

- **Press, don't hold:** tap the key and the operator starts from the pointer's current position. Nothing needs holding down, which helps accessibility.
- **Confirm:** left-click or **Enter**. **Cancel:** **Esc** or right-click, which restores *exactly* the previous state (positions, camera, selection).
- **One undo step** per confirmed operator.
- **Keyboard-only works too:** every operator also responds to arrows and PageUp/PageDown, so mouse movement is optional. Pressing **G** with no mouse movement is the old "Move mode".
- **Feedback:** the status bar shows the operator, the constraint and the live value; an axis line is drawn when constrained; the original position is shown as a faint "ghost" until you confirm.
- If the pointer is outside the 3D view when the key is pressed, the operator starts in keyboard-only mode. Optionally, the Pointer Lock API gives endless movement for G and V without hitting the screen edge.
- In Edit mode and text fields these letters just type text. Operators only start in Navigate (and Waypoint) mode.

### 5.8 Tabs

- **One window, many maps:** each open map is a tab in a strip above the scene, showing the map's name, "●" when unsaved, and a close button. Hovering shows the file path.
- **Each tab is independent:** its own document, **undo/redo history**, selection, mode, camera and filters, Reader state, **unsaved state** and **recovery file**. Undo never crosses tabs.
- **Opening:** **Mod+O** opens a file in a new tab, reusing an empty, untouched tab if one is active. Opening a file that's already open just switches to its tab. Double-clicking a `.mindmap3d` file in the OS while the app is running opens it as a new tab in the existing window (single-instance).
- **Closing:** **Mod+W** closes the tab. In manual-save mode with unsaved changes it asks *Save / Don't save / Cancel*. Quitting with several unsaved tabs shows **one** dialog listing them: *Save all / Review each / Discard all / Cancel*. In autosave mode, tabs are flushed first.
- **Switching:** **Ctrl+Tab / Ctrl+Shift+Tab** (on every platform, because Cmd+Tab belongs to macOS), **Mod+Shift+] / [**, and **Mod+1…8** for tab 1–8 with **Mod+9** for the last tab. **Mod+Shift+PageUp/PageDown** moves the current tab left or right; tabs can also be dragged with the mouse.
- **Reopen closed tab:** **Mod+Shift+T** reopens the last closed map from its file.
- **Between tabs:** copy/paste carries nodes and links. Link types are matched by id, and missing ones are added. In v1, images are copied into the target map's resources folder.
- **Session restore** (v1, preference): reopen last session's tabs on start-up.
- **Performance:** only the active tab renders. Inactive tabs keep their document in memory; their GPU resources are released after a while and rebuilt when you switch back.
- **Accessibility:** the tab strip is a standard `tablist`, reachable with F6. Switching tabs is announced ("Research, tab 2 of 3, unsaved changes").

### 5.9 Images and attachments (v1)

**Where files live**

- Each map has a **resources folder** next to it. The default name is **`<map name>.resources/`**, so `Urban flooding.mindmap3d` sits beside `Urban flooding.resources/`.
- The map stores the folder in `settings.resourcesFolder` as a path **relative to the map file**. Users can point it at another folder (e.g. a shared `assets/` folder). Absolute paths are allowed but warned about, because they don't travel with the map.
- **Markdown references resolve relative to that folder:** `![Drain diagram](drain-diagram.png)` or `![](images/rain.png)`. Other files work as links: `[Survey](survey.pdf)`.
- Map plus folder is easy to back up, zip, sync or put in git.

**Inserting** (always **copies** the file into the resources folder, so the map never depends on the original's location)

| How | What happens |
|---|---|
| **Mod+Shift+I** in Edit mode | File dialog → copy into the folder → insert `![alt](name.png)` at the cursor with the alt text selected, so typing replaces it |
| **Drag and drop** files onto the editor | Same, inserted at the drop point |
| Drop files onto a **node in 3D** | Same, appended to the end of that node's Markdown |
| **Paste** an image (Mod+V) | Saved as `pasted-YYYYMMDD-HHMMSS.png` and inserted |
| Non-image files | Copied and inserted as a link; in the Reader, **Enter** on the link opens it in the OS default app (executables are blocked) |

- Name clashes get a suffix (`name-2.png`). Identical files (same content hash) are reused rather than copied twice.
- **Never-saved maps:** files go into a temporary resources folder in the app's data folder, which moves next to the map on first save.
- Copying happens straight away and isn't part of undo. Undo removes the *reference*, and "Check resources" can tidy up unused files later.

**Displaying**

- Images appear only in the **Reader** (and editor preview), never in the 3D scene. A node with images can get a small badge on its icon (v1).
- Files are served through Tauri's asset protocol, **scoped to that map's resources folder**. Paths containing `..` or pointing outside the folder are refused. SVGs are shown as images, so scripts inside them don't run. Images load lazily, with size limits.
- **Missing files** show a placeholder in the Reader ("Missing image: drain-diagram.png") with **Locate…** (pick a file; it's copied in) and **Remove reference**. The palette command **Check resources** lists missing and unused files. Unused files are only deleted after confirmation, and go to the OS trash.

**Save As, moving and renaming**

- **Save As** copies the resources folder to `<new name>.resources/` beside the new file (with progress for big folders). The original map and folder are left untouched.
- If a map is moved or renamed *outside* the app and its folder isn't found, the app looks for `<current name>.resources/` and the old name, and **offers** to relink. It never relinks silently.
- Backups and recovery files cover the map file only; resources aren't duplicated.

**MVP behaviour:** image Markdown is shown as a labelled placeholder ("Image: Drain diagram, available in v1") rather than a broken image.

---

## 6. Keyboard design

### 6.1 Modes

The app has a few explicit modes. The current mode is always shown in the status bar, and **Esc always backs out one level**, ending in Navigate mode.

| Mode | How you enter | What keys do | How you leave |
|---|---|---|---|
| **Navigate** (default) | Start-up; Esc from anything | Single keys are commands (Tab, Enter, L, arrows…) | — |
| **Reader** | Enter or click icon on a node/link | Scroll, Tab through links in the content | E or Enter (to Edit); Esc (close) |
| **Edit** | E or Enter from Reader; E from Navigate; Tab on a new node | Typing goes into the title field or Markdown editor | Esc (back to where you came from) or Mod+Enter (to Navigate) |
| **Link** | L | Arrows or the mouse move the target cursor; 1–9 pre-pick a type | Enter or click (create / open type picker); Esc or right-click (cancel) |
| **Type picker** | Enter in Link mode, T, Shift+Tab | 1–9 or type to search | Enter or digit (choose), Esc (back) |
| **Legend focus** | Shift+L | Arrows, Space, S, A | Esc |
| **Link-type manager** | Mod+Shift+L | Arrows, Enter, Mod+N, Delete | Esc |
| **Grab** | G | Mouse or arrows move the selected node(s) and waypoints; X/Y/Z constrain | Click or Enter (keep); Esc or right-click (revert) |
| **View** | V | Mouse orbits (Shift pans, wheel zooms) | Click or Enter (keep); Esc or right-click (restore) |
| **Scale** *(v1)* | S | Mouse scales node size | Click or Enter; Esc or right-click |
| **Waypoint** | W or Shift+W on a selected link | ] / [ select, A add, arrows move, Mod+←/→ reorder, Delete remove | Enter (done); Esc (cancel current move, then leave) |
| **Palette** | / or Ctrl/Cmd+K | Typing filters; ↑/↓ choose | Enter (run) or Esc |
| **Help** | ? | Scroll/search the cheat sheet | Esc or ? |

Mode rules:

- Single-letter shortcuts only work in Navigate mode (and E in the Reader), so they can never fire while you're typing.
- **Esc steps back one level:** Edit → Reader → Navigate (or Edit → Navigate when you didn't come through the Reader).
- A modal dialog or palette **captures** keys until it closes, then focus returns exactly where it was.
- **Operators (G, L, V, S)** always confirm with click/Enter and cancel with Esc/right-click, so the mouse and keyboard follow the same rules.
- Modes and selection are **per tab**. Switching tabs returns you to that tab's Navigate mode.

### 6.2 Shortcut map

"Mod" means **Ctrl** on Windows/Linux and **Cmd** on macOS. "Alt" is **Option** on macOS.

#### Navigate mode — creating and editing

| Key | Action |
|---|---|
| **Tab** | New node linked from the current node (last-used link type), then Edit mode |
| **Shift+Tab** | Same, but pick the link type first (type picker), then Edit mode |
| **Mod+Enter** | New unlinked node near the camera's focus point, then Edit mode |
| **Enter** | **Open** the current node or link in the Reader (rendered Markdown) |
| **E** | Edit the current node or link directly (skips the Reader) |
| **L** | Start a link from the current node (Link mode) |
| **G** | **Grab**: move the current node(s) and selected waypoints (mouse or arrows; X/Y/Z constrain) |
| **S** | Scale node size with the mouse (v1) |
| **Delete** / **Backspace** | Delete current item(s); links to a deleted node are deleted too (undoable) |
| **Mod+D** | Duplicate current node(s) |
| **Shift+A** | Auto-arrange selection (and its immediate neighbours), one undo step (v1) |
| **Mod+Shift+A** | Auto-arrange all (unpinned) nodes, one undo step (v1) |
| **Shift+P** | Pin / unpin node(s): pinned nodes are never moved by Auto-arrange |
| **Mod+Z** | Undo |
| **Mod+Shift+Z** / **Ctrl+Y** | Redo |
| **Mod+C / Mod+X / Mod+V** | Copy / cut / paste nodes (with links among them; missing link types are added to the map) |

#### Navigate mode — link types (when a link is selected)

| Key | Action |
|---|---|
| **1…9** | Set the selected link(s) to type 1–9 |
| **T** | Open the type picker for the selected link(s) |
| **Shift+T** / **Alt+Shift+T** | Cycle to next / previous type |
| **R** | Reverse direction (swap source and target; waypoint order reverses too) |
| **W** | Enter Waypoint mode for the selected link (v1) |
| **Shift+W** | Add a waypoint at the path's middle and enter Waypoint mode (v1) |
| **Shift+Delete** | Clear the link's waypoints (back to auto-routing) (v1) |
| **Enter** | Open the link in the Reader (type, direction, rendered text); **E** edits its text |

#### Navigate mode — moving the selection

| Key | Action |
|---|---|
| **← → ↑ ↓** | Jump to the nearest node in that on-screen direction (see [6.3](#63-spatial-navigation-rules)) |
| **Mod+↑ / Mod+↓** | Jump to the nearest node *further away* / *closer* (depth) |
| **B** / **Shift+B** | Back / forward through navigation history |
| **]** / **[** | Select the next / previous visible link attached to the current node |
| **Alt+]** / **Alt+[** | Next / previous link of the **active type** on the current node |
| **.** / **,** | Follow a link of the active type forward (outgoing) / backward (incoming) to the next node |
| **← / →** (when a link is selected) | Jump to the link's source / target node |
| **Space** | Add/remove the current item to/from the multi-selection (v1) |
| **Mod+A** | Select all nodes (v1) |
| **Mod+P** | "Go to…": palette in node-search mode |

#### Navigate mode — camera

| Key | Action |
|---|---|
| **Shift+Arrows** | Orbit camera around the focus point |
| **Alt+Arrows** | Pan camera |
| **=** / **-** | Zoom in / out |
| **F** | Focus camera on selection |
| **Shift+F** / **Home** | Frame the whole map |
| **V** | View operator: orbit with the mouse (Shift pans, wheel zooms); click keeps, Esc restores |
| **Mod+Alt+1…9** / **Mod+Alt+Shift+1…9** | Recall / save a camera bookmark (v1) |

#### Global (any mode unless noted)

| Key | Action |
|---|---|
| **/** or **Mod+K** | Command palette (fuzzy search over commands and nodes) |
| **?** | Shortcut cheat sheet |
| **Esc** | Back out one level: close overlay, cancel an operator, leave Edit/Link/Waypoint, then clear the selection |
| **Mod+N** / **Mod+T** | New map in a new tab |
| **Mod+O** | Open a map in a new tab |
| **Mod+S** | Save now (in autosave mode too, saves immediately) |
| **Mod+Shift+S** | Save as |
| **Mod+W** | Close the current tab (in manual mode asks "Save / Don't save / Cancel" if there are unsaved changes) |
| **Mod+,** | Preferences (save mode, autosave timing, backups, appearance…) |
| **Mod+\\** | Pin/unpin the Reader panel (follows the selection) |
| **F6** / **Shift+F6** | Move focus between regions: tab strip → scene → Reader/editor panel → status bar |
| **Mod+= / Mod+-** | Increase / decrease UI and label font size |
| **O** (Navigate) | Toggle neighbourhood view (v1) |
| **Shift+L** (Navigate) | Show/hide the legend overlay (and focus it) |
| **Mod+Shift+L** | Open the link-type manager |
| **Alt+1…9** (Navigate) | Toggle visibility of link type 1–9 |
| **Alt+0** (Navigate) | Show all link types |

#### Tabs

| Key | Action |
|---|---|
| **Mod+T** / **Mod+N** | New map in a new tab |
| **Mod+O** | Open map in a new tab (or switch to it if already open) |
| **Mod+W** | Close tab |
| **Mod+Shift+T** | Reopen last closed tab |
| **Ctrl+Tab** / **Ctrl+Shift+Tab** | Next / previous tab (all platforms; Cmd+Tab is reserved by macOS) |
| **Mod+Shift+]** / **Mod+Shift+[** | Next / previous tab (alternative) |
| **Mod+1…8** / **Mod+9** | Go to tab 1–8 / last tab |
| **Mod+Shift+PageUp / PageDown** | Move current tab left / right |

#### Reader

| Key | Action |
|---|---|
| **E** or **Enter** | Switch to Edit |
| **↑ / ↓**, **PageUp / PageDown**, **Space** | Scroll |
| **Home / End** | Top / bottom |
| **Tab / Shift+Tab** | Move through links in the rendered content (Enter opens a link in the external browser) |
| **Mod+= / Mod+-** | Larger / smaller reading text |
| **Esc** | Close the Reader; focus returns to the node in the scene |

#### Edit mode (title field + CodeMirror)

| Key | Action |
|---|---|
| **Esc** | Commit and go back to where you came from (Reader, or Navigate) |
| **Mod+Enter** | Commit and return to Navigate mode |
| **Alt+T** | Move between the title field and the Markdown body |
| **Mod+B / Mod+I** | Bold / italic |
| **Mod+Shift+K** | Insert link syntax |
| **Tab / Shift+Tab** | Indent / outdent list items (Esc always gets you out, so this is not a trap) |
| **Mod+Shift+P** | Toggle live preview |
| **Mod+Shift+I** | Insert image or file (copied into the resources folder) (v1) |
| **Mod+V** | Paste; pasting an image saves it into the resources folder (v1) |
| Standard text keys | Selection, word movement, undo inside the editor, etc. |

#### Link mode

| Key | Action |
|---|---|
| **Arrows** / **mouse** | Move the target cursor between nodes (spatial rules) / target the node nearest the pointer |
| **Click** | Choose the node under the pointer as target |
| **/** | Pick the target by name |
| **N** | Create a new node as the target |
| **1…9** | Pre-pick link type 1–9 (rubber band shows its style) |
| **Enter** | Create the link (opens the type picker if no type was pre-picked) |
| **Esc** / **right-click** | Cancel |

#### Type picker

| Key | Action |
|---|---|
| **1…9** | Choose type 1–9 immediately |
| Type | Fuzzy-search type names and descriptions |
| **↑ / ↓**, **Enter** | Move through and choose |
| **Mod+N** | Create a new type named after the search text (opens a short form) |
| **Esc** | Cancel (back to the previous mode) |

#### Legend (focused) and link-type manager

| Key | Legend | Manager |
|---|---|---|
| **↑ / ↓** | Move between types | Move between types |
| **Space** | Cycle shown → dimmed → hidden | — |
| **S** / **A** | Solo this type / show all | — |
| **Enter** | Open type in manager | Edit type |
| **Mod+N** | — | New type |
| **Alt+↑ / Alt+↓** | — | Reorder (changes number keys) |
| **Delete** | — | Delete type (asks where its links go) |
| **Esc** | Back to scene | Close |

#### Waypoint mode (v1)

| Key | Action |
|---|---|
| **] / [** | Select next / previous waypoint |
| **Home / End** | Select first / last waypoint |
| **1…9** | Select waypoint 1–9 |
| **A** / **Shift+A** | Insert a waypoint after / before the selected one |
| **Arrows** | Move selected waypoint in the screen plane |
| **Shift+Arrows** | Larger step |
| **PageUp / PageDown** | Move further from / closer to the camera |
| **Mod+← / Mod+→** | Move the waypoint earlier / later in the route order |
| **Delete / Backspace** | Delete selected waypoint |
| **Shift+Delete** | Clear all waypoints on this link |
| **G** | Grab the selected waypoint(s) with the mouse (X/Y/Z constrain; click/Enter confirm; Esc/right-click cancel) |
| **Space** | Add/remove the current waypoint to/from the selection |
| **= / -**, **F** | Zoom / focus camera on the selected waypoint |
| **Enter** | Done (back to Navigate, link still selected) |
| **Esc** | Cancel the current run of moves; press again to leave |

#### Grab operator (G)

| Key / mouse | Action |
|---|---|
| **Mouse movement** | Move in the plane facing the camera |
| **Arrows** / **Shift+Arrows** | Nudge in the screen plane (small / larger step) |
| **Wheel** or **PageUp / PageDown** | Move further away from / closer to the camera |
| **X / Y / Z** | Lock to a world axis (press again to unlock) |
| Hold **Shift** / **Ctrl** | Precision movement / snap to grid |
| Type a number *(v1)* | Exact distance along the locked axis |
| **Click** or **Enter** | Keep the new position (one undo step) |
| **Esc** or **right-click** | Put everything back where it was |

#### View operator (V)

| Key / mouse | Action |
|---|---|
| **Mouse movement** | Orbit around the focus point |
| Hold **Shift** + move | Pan |
| **Wheel** / **Ctrl** + move | Zoom |
| **Click** or **Enter** | Keep the new view |
| **Esc** or **right-click** | Restore the previous view |

#### Palette

| Key | Action |
|---|---|
| Type | Fuzzy filter; prefix **>** for commands only, **@** for nodes only |
| **↑ / ↓** | Move through results |
| **Enter** | Run command / jump to node |
| **Esc** | Close |

### 6.3 Spatial navigation rules

Arrow keys should feel obvious: "go to the thing that's to the left *on my screen*". Use **screen space**, not world space, because that's what the user sees.

Algorithm, run on each arrow press:

1. Project the current node and every other visible node to 2D screen coordinates. Skip nodes behind the camera.
2. For each candidate, take the vector **d** from the current node to it. Work out the angle θ between **d** and the arrow direction.
3. Keep only candidates inside a **cone of ±60°** around the arrow direction (the cone limit is kept).
4. Score each remaining candidate with **one function**; lower is better:

    `score = wAngle·(θ/θmax)² + wScreen·(screenDist / viewportDiagonal) + wDepth·(dist3D / typicalSpacing) − wLink·[directly linked]`

    - **Angle:** how far the candidate is from the arrow direction on screen (θmax = the cone half-angle).
    - **Screen distance:** how far away it looks.
    - **Depth / 3D distance:** the **stronger penalty**, normalised by the map's typical spacing (e.g. median nearest-neighbour distance). It keeps jumps inside the local cluster instead of leaping to something far behind that only *looks* close.
    - **Link bonus:** subtracted if the candidate is directly linked to the current node by a visible link type (hidden types don't count).
5. Pick the lowest score. If there is none in the cone, widen it to ±90°. If there's still none, stay put and give a soft visual "bump".
6. **Tie-breaker / memory:** if the user presses the opposite arrow straight away, go back to the node they came from, even if scoring would choose another. This makes navigation reversible and predictable.
7. Once selected, the camera eases to keep the new node in view, but only if it's near the screen edge. This avoids constant camera motion.

**Depth navigation (Mod+↑/↓):** uses the **same scoring function and weights**. The "direction" is away from / towards the camera instead of a screen direction, and the angle term measures how far a candidate is off the camera's line of sight. There's no separate depth check any more.

**Tunable weights (decided):** all weights and limits (`wAngle`, `wScreen`, `wDepth`, `wLink`, cone half-angle, fallback cone) live in **one config object** (e.g. `spatialNav.config.ts`). Suggested starting values are wAngle 1.0, wScreen 1.0, wDepth 1.5 and wLink 0.3, tuned by testing. They're covered by **fixture-layout tests**: small hand-built maps with a fixed camera and the expected target for each arrow press. Fixtures include two clusters at different depths, a straight line receding in depth, a grid, linked vs unlinked nodes at equal distance, and a node exactly on the cone edge. Changing a weight must keep every fixture passing, or the fixture is consciously updated.

**Graph navigation** ([, ], Alt+[/], . and , for following, ←/→ on a link, and B for back) follows actual connections, so the user always has a reliable path that doesn't depend on the camera angle. In a free-form web with loops, **B (back)** stands in for "go to parent": it always returns the way you came. Hidden link types are skipped by link cycling and following. Spatial arrow navigation can still land on any visible node, and nodes dimmed by "dim nodes with no visible links" stay reachable.

### 6.4 Keyboard pitfalls to handle

- **Non-US keyboard layouts:** on many layouts (e.g. German) **/** and **?** need Shift or AltGr. Match symbol shortcuts on `event.key` (the character), match letter shortcuts on `event.code` (the physical key) where the position matters, and always give an alternative (**Mod+K** for the palette). The remappable keymap (v1) is the final safety net.
- **OS and WebView reserved keys:** some combinations are taken by the OS (e.g. Cmd+H on macOS, Alt+F4 on Windows) or by the WebView. Avoid them, and test on all three platforms.
- **Cmd+Tab on macOS** belongs to the OS app switcher, so tab switching uses **Ctrl+Tab** on every platform, plus **Mod+Shift+] / [** and **Mod+1…9**.
- **Single letters used by operators** (G, L, V, S) only act in Navigate/Waypoint mode, never while typing.
- **Tab and focus:** Tab normally moves browser focus. The scene captures Tab only while it has focus, and **F6** gives a standard way to move between regions.
- **Alt+digits and Mod+Shift+digits:** on macOS, Option+digit types special characters, and on many layouts Shift+digit gives a symbol. Match these shortcuts on `event.code` (Digit1…Digit9). They're only active in Navigate mode, where no text is being typed.
- **Key repeat:** holding an arrow should repeat navigation at a controlled rate, not queue up dozens of camera animations.
- **IME/composition:** in Edit mode, respect text composition events so typing Chinese, Japanese and similar languages works.

### 6.5 Accessibility

A WebGL canvas is invisible to screen readers, so accessibility has to be designed in, not bolted on.

| Need | Approach |
|---|---|
| Screen readers | A hidden-but-present **ARIA tree** (`role="tree"`) mirrors the selection's neighbourhood: the current node, then its links **grouped by type**, each leading to the node at the other end (loops shown as references, not endless nesting). Screen readers announce, for example, "Node: *Ideas*. 5 links: 2 causes, 1 part of, 2 relates to". From v1 the **neighbourhood view** makes this visible and useful for everyone. |
| Announcements | An `aria-live="polite"` region announces mode changes, selection changes and results. Links are read with their type and direction: "Link: *Rain* causes *Flooding*", "Type changed to depends on", "Contradicts hidden". Waypoints: "Waypoint 2 of 4 on *Rain* causes *Flooding*", "Waypoint moved to position 3", "Waypoints cleared". |
| Link types without colour | Every type differs by name, line pattern/width and icon as well as colour. The starter set uses a colour-blind-friendly palette. |
| Doc icons and titles | Each node in the ARIA tree has an accessible name of its title plus a short description ("document, 120 words, 5 links"). Icons aren't the only cue: titles are always present nearby, and selection changes size and outline as well as colour. |
| Reader panel | A labelled region (`role="complementary"`, `aria-labelledby` the title) containing real HTML, so screen readers can read headings, lists, tables and links with their normal commands. When it opens, focus moves to its heading and the app announces "Opened *Flooding*. Press E to edit, Escape to close". Esc returns focus to the same node. |
| Save state | The save indicator is text, not just a dot ("Unsaved changes", "Saved 14:32"), and it's announced politely on change. Close prompts are standard, keyboard-operable dialogs. |
| Mouse operators | Every mouse operator (G, L, V, S) also works fully from the keyboard, and confirm/cancel are always Enter/Esc as well as click/right-click. No action needs holding a key or precise dragging. |
| Link labels | Links are announced with title and type: "Link: *Overwhelms drains*, type leads to / causes, from *Heavy rain* to *Flooding*", or just the type when there's no title. |
| Images (v1) | Inserting an image selects its alt text for typing; images without alt text are flagged in "Check resources". |
| Tabs | Standard `tablist` semantics; switching and unsaved state are announced. |
| No keyboard traps | Esc always leaves the current mode; F6 cycles regions; dialogs return focus to where they started. |
| Visible focus | Strong selection outline in 3D, plus normal focus rings in the HTML UI. |
| Colour | Never the only signal; a high-contrast theme (v1); outlined labels (optional plates in v1). |
| Motion | Respect the OS "reduce motion" setting (`prefers-reduced-motion`): no camera easing, no idle animation. |
| Text size | Global font-scale setting for labels and UI. |
| Remapping | User-editable keymap (v1). |
| Non-3D fallback | The neighbourhood view lets someone use the whole app as a structured list if 3D isn't helpful to them. |

Testing: manual passes with NVDA (Windows), VoiceOver (macOS) and Orca (Linux), and an automated axe-core check of the HTML UI.

---

## 7. Data model

### 7.1 Concepts

- **Map (document):** one **`.mindmap3d`** file (JSON). Holds metadata, settings (default link type, resources folder), view state (camera, filters), the link-type registry, nodes and links.
- **Collaboration-ready shape (decided):** **nodes, links, link types and waypoints are objects keyed by their id**, not arrays. Where order matters (link-type order, waypoint order), each entry has an explicit **fractional-index `order` key**. Two people can add or reorder items without clashing over array positions, which is what CRDTs such as Yjs and Automerge need later. The id is the key and isn't repeated inside the entry.
- **Node:** Markdown `text`, optional explicit **`title`**, 3D `position`, optional `style` (colour, size, icon variant), optional `pinned`. **No parent.** The map is a free-form web.
- **Link:** `source` and `target` node ids, **`typeId`**, optional Markdown `text`, optional explicit **`title`**, optional **`waypoints`** (an id-keyed object of `{order, position}`; empty or missing means auto-routed), optional `style` (custom bow for auto-routing, label segment).
- **Titles (nodes and links):** the explicit `title` if set; otherwise **derived** from the Markdown (first heading if the text starts with one, else first non-empty line) and **not stored**. A link with no title shows only its type name in 3D.
- **Direction** comes only from the link's type. There is no per-link override; **R** swaps `source` and `target` (and reverses the waypoint order).
- **Link type:** an entry in the map's `linkTypes` object: name, colour, pattern, width, direction, optional icon and description, and an **`order`** key. The order decides the 1–9 keys.
- **Web rules:** any node can link to any other; loops are fine; several links between the same pair are fine; there's no root; disconnected clusters are fine. **Self-links (`source` = `target`) are valid data.** Creating them is a *Later* feature, but files containing them load, render and save unchanged.
- **Node position** is set once by auto-placement and then only changed by the user (Grab) or an explicit Auto-arrange. `pinned: true` excludes a node from Auto-arrange.
- **Ids:** random, unique, sortable string ids (ULIDs or UUIDv7), unique across the whole document. Starter link types use **readable, stable ids** (`relates-to`, `causes`, …), so templates and copy/paste between maps can match them up.
- **Order keys:** short strings that sort lexicographically (e.g. `"a0"`, `"a1"`, `"a0V"`). To move an item between two others, give it a key that sorts between theirs (the *fractional-indexing* library does this). Ties are broken by id.
- **Resources:** `settings.resourcesFolder` is a path relative to the map file (default `<map name>.resources`). Markdown image and file references resolve relative to it (used from v1, reserved from version 1 of the format).
- **Not in the map file:** app preferences (save mode, appearance, the app-level link-type template). They live in the app's config folder.

### 7.2 Sample file

File extension: **`.mindmap3d`** (decided; plain JSON inside).

This sample has a loop (Flooding *depends on* Drainage, and Drainage *mitigates* Flooding, a custom type), **two links between the same pair** (Rain → Flooding), a link with an **explicit title**, a link with a **derived title**, waypoints with **order keys**, and an **image reference** into the resources folder.

```json
{
  "format": "mindmap3d",
  "version": "1.0",
  "id": "01JB2X6Q7Z9K3M4N5P6R7S8T9V",
  "meta": {
    "title": "Urban flooding",
    "createdAt": "2026-10-20T13:35:00Z",
    "modifiedAt": "2026-10-20T14:02:11Z",
    "appVersion": "0.1.0"
  },
  "settings": {
    "defaultLinkTypeId": "relates-to",
    "resourcesFolder": "Urban flooding.resources"
  },
  "view": {
    "camera": {
      "position": { "x": 0, "y": 4, "z": 18 },
      "target":   { "x": 0, "y": 0, "z": 0 },
      "fov": 50
    },
    "linkTypeFilters": { "contradicts": "dimmed" }
  },
  "linkTypes": {
    "relates-to":  { "order": "a0", "name": "relates to", "color": "#999999",
                     "pattern": "solid",  "width": "normal", "direction": "undirected" },
    "causes":      { "order": "a1", "name": "leads to / causes", "color": "#E69F00",
                     "pattern": "solid",  "width": "normal", "direction": "directed", "icon": "→",
                     "description": "A causes or results in B." },
    "part-of":     { "order": "a2", "name": "part of", "color": "#0072B2",
                     "pattern": "solid",  "width": "thick",  "direction": "directed", "icon": "◆" },
    "depends-on":  { "order": "a3", "name": "depends on", "color": "#CC79A7",
                     "pattern": "dashed", "width": "normal", "direction": "directed", "icon": "⚙" },
    "contradicts": { "order": "a4", "name": "contradicts", "color": "#D55E00",
                     "pattern": "dashed", "width": "thick",  "direction": "undirected", "icon": "✕" },
    "example-of":  { "order": "a5", "name": "example of", "color": "#56B4E9",
                     "pattern": "dotted", "width": "normal", "direction": "directed", "icon": "●" },
    "supports":    { "order": "a6", "name": "supports", "color": "#009E73",
                     "pattern": "solid",  "width": "normal", "direction": "directed", "icon": "+" },
    "01JB2X9Z0000000000000000T1": { "order": "a7", "name": "mitigates", "color": "#F0E442",
                     "pattern": "dotted", "width": "thick",  "direction": "directed", "icon": "≈" }
  },
  "nodes": {
    "n-rain": {
      "text": "# Heavy rain",
      "position": { "x": -6, "y": 2, "z": 0 },
      "style": { "color": "#4f8cff", "size": 1.2 },
      "pinned": true
    },
    "n-flood": {
      "title": "Flooding (city centre)",
      "text": "# Flooding\nStreets under water within **hours**.",
      "position": { "x": 0, "y": 0, "z": 0 }
    },
    "n-drainage": {
      "text": "## Drainage system\n- storm drains\n- culverts\n\n![Drain diagram](images/drain-diagram.png)",
      "position": { "x": 4, "y": -3, "z": -2 }
    }
  },
  "links": {
    "l1": { "source": "n-rain", "target": "n-flood", "typeId": "causes",
            "title": "Overwhelms drains", "text": "Above ~30 mm/h the drains back up." },
    "l2": { "source": "n-rain", "target": "n-flood", "typeId": "relates-to",
            "text": "# See the 2024 rainfall report\nSummary of rainfall data." },
    "l3": { "source": "n-flood", "target": "n-drainage", "typeId": "depends-on",
            "text": "",
            "waypoints": {
              "w-01": { "order": "a0", "position": { "x": 1.5, "y": -3.5, "z": 2 } },
              "w-02": { "order": "a1", "position": { "x": 3.5, "y": -4.5, "z": 1 } }
            },
            "style": { "labelSegment": 1 } },
    "l4": { "source": "n-drainage", "target": "n-flood",
            "typeId": "01JB2X9Z0000000000000000T1",
            "text": "", "style": { "bow": 0.4 } }
  },
  "extensions": {}
}
```

*(Short ids like `n-rain`, `l1` and `w-01` keep the sample readable. Real files use ULIDs.)*

Notes:

- **Link labels in 3D:** `l1` shows "Overwhelms drains" over "→ leads to / causes" (explicit title). `l2` shows "See the 2024 rainfall report" over "relates to" (title derived from its heading). `l3` and `l4` have no title, so they show only "⚙ depends on" and "≈ mitigates".
- `l1` and `l2` connect the same pair, so they fan apart. `l3` and `l4` form a loop between Flooding and Drainage, which is valid. `l3` follows its two waypoints in `order` (`a0` then `a1`) and isn't part of any fan.
- Node `n-flood` has an explicit `title`; the others use derived titles ("Heavy rain", "Drainage system").
- `n-drainage`'s image resolves to `Urban flooding.resources/images/drain-diagram.png` (v1). The MVP shows a placeholder.
- **Preferences such as the save mode are not in the map file.** They belong to the app, on this computer (see [8.8](#88-preferences-app-settings)).
- `view` (camera and filters) is saved for convenience but is **not** part of undo history and doesn't count as an unsaved edit.
- Fields the app doesn't know (e.g. in `extensions`, or written by a newer version) are **kept as-is** when saving, never dropped.
- Optional fields (`title`, `style`, `icon`, `description`, `pinned`, `waypoints`) are left out when they hold defaults. This keeps files small and diffs clean.
- **Stable, git-friendly output:** object keys are written in a fixed order: nodes and links sorted by id (ULIDs sort by creation time), link types and waypoints sorted by `order` then id. Fields use a fixed order, with 2-space indentation.

### 7.3 Schema (excerpt, JSON Schema style)

```json
{
  "$id": "https://example.invalid/mindmap3d.v1.schema.json",
  "type": "object",
  "required": ["format", "version", "linkTypes", "nodes", "links"],
  "properties": {
    "format":  { "const": "mindmap3d" },
    "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$",
                 "description": "MAJOR.MINOR. Newer major: refuse to open. Newer minor: open, keep unknown fields." },
    "settings": {
      "type": "object",
      "properties": {
        "defaultLinkTypeId": { "type": "string" },
        "resourcesFolder":   { "type": "string",
                               "description": "Relative to the map file; default '<map name>.resources'." }
      }
    },
    "view": {
      "type": "object",
      "properties": {
        "linkTypeFilters": {
          "type": "object",
          "additionalProperties": { "enum": ["shown", "dimmed", "hidden"] }
        }
      }
    },
    "linkTypes": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": {
        "type": "object",
        "required": ["order", "name", "color", "pattern", "width", "direction"],
        "properties": {
          "order":       { "$ref": "#/$defs/orderKey" },
          "name":        { "type": "string", "minLength": 1 },
          "color":       { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
          "pattern":     { "enum": ["solid", "dashed", "dotted"] },
          "width":       { "enum": ["thin", "normal", "thick"] },
          "direction":   { "enum": ["directed", "bidirectional", "undirected"] },
          "icon":        { "type": "string", "maxLength": 8 },
          "description": { "type": "string" }
        }
      }
    },
    "nodes": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["text", "position"],
        "properties": {
          "title":    { "$ref": "#/$defs/title" },
          "text":     { "type": "string" },
          "position": { "$ref": "#/$defs/vec3" },
          "pinned":   { "type": "boolean", "default": false }
        }
      }
    },
    "links": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["source", "target", "typeId"],
        "description": "source may equal target (self-link): valid data; creating them comes in a later version.",
        "properties": {
          "source": { "type": "string" },
          "target": { "type": "string" },
          "typeId": { "type": "string" },
          "title":  { "$ref": "#/$defs/title" },
          "text":   { "type": "string", "default": "" },
          "waypoints": {
            "type": "object",
            "description": "Keyed by waypoint id; the route visits them sorted by 'order' (then id), from source to target.",
            "additionalProperties": {
              "type": "object",
              "required": ["order", "position"],
              "properties": {
                "order":    { "$ref": "#/$defs/orderKey" },
                "position": { "$ref": "#/$defs/vec3" }
              }
            }
          },
          "style": {
            "type": "object",
            "properties": {
              "bow":          { "type": "number" },
              "labelSegment": { "type": "integer", "minimum": 0 }
            }
          }
        }
      }
    }
  },
  "$defs": {
    "title":    { "type": "string", "maxLength": 200,
                  "description": "Optional explicit title; empty or missing means derive from text." },
    "orderKey": { "type": "string", "minLength": 1,
                  "description": "Fractional-index key; sorts lexicographically." },
    "vec3": {
      "type": "object",
      "required": ["x", "y", "z"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "z": { "type": "number" }
      }
    }
  }
}
```

In code, define the schema once with Valibot or Zod. That gives both runtime validation and TypeScript types, and can generate a JSON Schema file for documentation.

### 7.4 Integrity rules (checked on load and after every command)

- Ids (object keys) are unique across nodes, links and link types. Waypoint ids are unique within their link.
- `title` (on nodes and links) is trimmed and single-line (line breaks become spaces); an empty title is removed.
- Every link's `source` and `target` exist. A link whose node is missing gets dropped, with a warning. **Self-links are valid** and kept.
- **No link types at all** (decided): restore **only** the built-in **"relates to"** type (id `relates-to`) and make it the default. The full starter set is never injected into an existing map.
- Every link's `typeId` exists in `linkTypes`. If not (decided), the link is **reassigned to "relates to"** (restored first if needed), and the load report says how many links were reassigned and from which missing ids, so the user can recreate a type and reassign them.
- `defaultLinkTypeId` points to an existing type. If not, "relates to" becomes the default if present, otherwise the first type by order.
- **New maps** get the full starter set (from v1: the user's app-level template, if set). Repair never does this.
- Link-type names *should* be unique (a warning in the manager, not an error).
- **Order keys:** a missing or invalid `order` gets a fresh key after the last item; duplicates are allowed and sorted by id. "Repair order" rewrites them only if they grow very long.
- Loops and multiple links between the same pair are **valid** and never "repaired".
- Waypoint positions are finite numbers. A bad waypoint is dropped with a warning; the rest of the route is kept. `labelSegment` beyond the last segment falls back to the path midpoint.
- A soft limit (e.g. 64 waypoints per link) protects against hostile or broken files.
- Positions are finite numbers. NaN or Infinity is reset and a warning shown.
- `resourcesFolder` and Markdown resource paths must stay inside the resources folder: no `..` escapes. Absolute folder paths are allowed but flagged. Bad references show as missing; they never fail the load.

### 7.5 Versioning and migrations

- `version` is the **file format version as `"MAJOR.MINOR"`**, separate from the app version. (If Phase 1 already wrote a plain integer `1`, read it as `"1.0"`.)
    - **Minor** bumps are **additive only**: new optional fields with safe defaults. An older app can open the file and keep fields it doesn't understand.
    - **Major** bumps are for changes an older app can't handle safely (renamed or restructured fields, changed meaning).
- On load: **parse → check version → run migrations step by step (1.x→2.0→3.0…) → validate → load**.
- Each migration is a small, pure, tested function: `migrate_1_to_2(doc) → doc`.
- The format is **collaboration-ready from version 1** (id-keyed objects, order keys), so adding collaboration later shouldn't need a structural migration.
- Link-type changes are migrations too. For example, if a future version adds a new link-type property, the migration fills in a default for every existing type.
- **Older file:** migrate in memory. On first save, write the new version and keep a one-time backup of the original (`name.v1.bak`).
- **Newer major version than the app supports** (decided): **refuse to open** with a clear message: "This map was made with a newer version of the app. Please update to open it." The app **never writes** to that file: no save, no autosave, no recovery file, no backup rotation. A read-only viewer for newer majors is *Later*.
- **Same major, newer minor** (decided): open normally. **Unknown fields are preserved** on save, wherever they appear (top level, nodes, links, link types, waypoints), so a round-trip through the older app loses nothing. The file keeps its newer minor number. The status bar notes "Made with a newer version; some features may not show".
- **Corrupt file:** show what's wrong, offer the latest backup or recovery copy, and never overwrite the original automatically.

---

## 8. Architecture

### 8.1 Big picture

```
+--------------------------- Tauri app -----------------------------+
|                                                                   |
|  Rust backend (small, boring, reliable)                           |
|   - file open/save (atomic), backups, recovery files              |
|   - preferences store; no network access                          |
|   - native dialogs, menus, window state, recent files             |
|   - .mindmap3d association, single instance -> new tab            |
|   - resources folder: copy-in, scoped serving, Save As copy       |
|                ^  Tauri commands & events (IPC)                   |
|                v                                                  |
|  WebView frontend (TypeScript)                                    |
|   app/       workspace of tabs (one document store, history,      |
|              selection and save controller per tab)               |
|   core/      document model, link types, commands, undo/redo,     |
|              selection, graph queries (neighbours, follow, paths) |
|   input/     keymap, modes, spatial nav, mouse operators          |
|   scene/     Three.js renderer, nodes, links, labels, camera      |
|   markdown/  render + sanitize, title extraction                  |
|   ui/        Svelte: reader, editor, palette, status bar, help,   |
|              preferences, dialogs                                 |
|              type picker, legend, link-type manager               |
|   io/        serialize, validate, migrate, save modes, recovery,  |
|              IPC bridge                                           |
|   workers/   layout (force-directed), search index                |
+-------------------------------------------------------------------+
```

The main rule: **`core/` is plain TypeScript with no DOM, Three.js or Tauri inside it.** That makes it easy to test, and it can later run in a worker or on a server for collaboration.

### 8.2 Tauri (Rust) backend responsibilities

| Responsibility | Notes |
|---|---|
| **Open/read files** | Read the chosen file and return its text. JSON parsing happens on the frontend, where the schema lives. |
| **Atomic save** | Write to `name.tmp` in the same folder, flush to disk, then rename over the original. A crash mid-save can't corrupt the file. |
| **Backups** | Before overwriting, rotate the previous version into a backup (e.g. keep the last 5, in an app-data folder or next to the file, depending on a setting). |
| **Recovery files** | Written in **both save modes** to the app-data directory (one per open map), never next to the user's file. Cleared after a successful save and on clean close. |
| **Preferences** | Stored with the Tauri store plugin in the app's config folder (save mode, timings, backups, appearance, keymap overrides). |
| **Local only** | No network plugins or HTTP permissions are granted to the WebView in the MVP, and the CSP blocks remote content by default. The v1 *opt-in* update check is the only exception: one HTTPS GET to the GitHub Releases API, permitted for that URL only and inactive unless the user turns it on (see [10.1](#101-licence-distribution-and-updates)). |
| **Resources (v1)** | Commands to copy a file into a map's resources folder (unique names, content-hash reuse), create the folder, list missing/unused files, copy the folder on Save As, and move a temporary folder on first save. The asset protocol is scoped per map to its resources folder, and paths escaping the folder are refused. |
| **Single instance and tabs** | The single-instance plugin sends "open this file" requests from the OS to the running app, which opens a new tab. One window holds all tabs. |
| **Dialogs** | Native open/save dialogs (Tauri dialog plugin). |
| **Menus** | Native app menu with the same shortcuts, so they're discoverable and follow macOS conventions. |
| **Window state** | Remember size and position (window-state plugin). |
| **Recent files and file association** | Register **`.mindmap3d`** through the Tauri bundler's file-association config (Windows registry entries via the installer, macOS document types in Info.plist, Linux MIME type in the `.desktop` file); handle "open with" and double-click, including macOS open-file events. |
| **Close guard** | Intercept window close and app quit. In **manual mode**, if any tab has unsaved changes, show one dialog listing them (*Save all / Review each / Discard all / Cancel*); closing a single tab asks "Save / Don't save / Cancel". In **autosave mode**, flush final saves first and only prompt if one fails. |
| **External change check** | Before each write, compare the file's modification time/size (or hash) with what was last read or written. If something else changed it, don't overwrite: pause autosave and ask. |
| **Security** | Use Tauri v2 *capabilities* so the WebView can only call the commands it needs. File access goes through explicit commands for user-chosen paths, not a broad file-system permission. Strict Content Security Policy. Links in Markdown open in the external browser. |

Keep the backend small. Almost all app logic belongs on the frontend, in TypeScript.

### 8.3 Frontend modules

| Module | Responsibility |
|---|---|
| `app/workspace` | Open tabs: per tab a document store, history, selection, mode, view, Reader state, save controller and recovery file; active tab; tab order; reopen-closed list; quit coordination |
| `core/model` | Types for Map, Node, Link, LinkType, Waypoint (id-keyed records with order keys); built-in starter set; app-level template loading; pure helpers (links of, neighbours of, derive title for nodes **and links**, sorted views by order key) |
| `core/graph` | Indexes rebuilt incrementally: links by node, links by type, links by unordered node pair (for fanning), plus queries: follow by type and direction, N-hop neighbourhood (focus mode), path search (v1) |
| `core/commands` | Every change is a named command (`AddNode` (with computed placement), `EditText`, `MoveNodes{moveInternalWaypoints}`, `AutoArrange{nodeIds, resetWaypoints}`, `AddWaypoint{linkId, order, position}`, `MoveSelection{nodeIds, waypointIds}` (also moves internal and selected waypoints), `DeleteWaypoint`, `ReorderWaypoint{id, newOrder}`, `SetTitle`, `InsertResourceRef`, `ClearWaypoints`, `AddLink`, `SetLinkType`, `ReverseLink`, `AddLinkType`, `UpdateLinkType`, `ReorderLinkTypes`, `DeleteLinkType{reassignTo}`, `Delete`, …) applied through one `dispatch()` |
| `core/history` | Undo/redo stacks of patches; grouping of steps |
| `core/selection` | Current item, multi-selection set, active link type, navigation history (back/forward) |
| `input/keymap` | Keymap table (mode + key → command id); platform Mod key; user overrides (v1); optional Vim keymap (Later) |
| `input/operators` | The modal operator framework for **G / L / V / S**: start from pointer position, mouse + keyboard input, axis constraints, precision/snap, live preview with a ghost, confirm (click/Enter) and cancel (Esc/right-click) restoring exact state, one command on confirm |
| `input/modes` | A small state machine (per tab): Navigate, Reader, Edit, Link, Type picker, Grab, View, Scale, Waypoint, Palette, Legend, Manager, Help |
| `input/spatial` | The spatial navigation algorithm (pure function: positions + camera → next node) |
| `scene/renderer` | Three.js setup; one shared renderer for all tabs (only the active tab's scene renders); render-on-demand loop, resize, pixel ratio; releasing GPU resources of inactive tabs |
| `scene/nodes` | **Instanced billboarded doc-icon sprites** (icon atlas, per-instance colour, size, variant, highlight); map node id ↔ instance index; click on icon → open |
| `scene/links` | One batched `Line2` geometry and material **per link type** (pattern, width, colour); route builder (auto Bézier, or centripetal Catmull–Rom through waypoints, adaptive sampling, arc-length table for dashes and label position); instanced cone arrowheads per type, oriented on the final tangent; pair-fanning offsets (auto-routed links only); dim/hide per type by changing one material's opacity or visibility; optional flow-animation shader (v1) |
| `scene/labels` | SDF titles anchored above icons; two-line link labels (title + smaller type name, or type name only); level-of-detail and overlap logic |
| `scene/camera` | Orbit controller (keyboard + mouse), animated transitions, auto-follow |
| `scene/handles` | Waypoint handles (instanced, numbered) and depth drop lines for the selected link; handle picking and selection (moved by the Grab operator) |
| `core/placement` | Auto-placement for new and pasted nodes: candidate sphere, overlap/visibility scoring, local nudge on a spatial grid (pure function, unit-testable) |
| `scene/picking` | Mouse picking (raycasts on instanced meshes; BVH acceleration later if needed) |
| `markdown` | markdown-it setup, sanitizing, remote-image blocking, resolving image/file references against the resources folder (v1; placeholder in MVP), title derivation (explicit title → first heading → first line) for nodes and links, render cache |
| `io/resources` (v1) | Insert/copy/paste/drop flows, missing-file placeholders, Check resources, relink offer, Save As copying (calls Rust commands) |
| `ui/*` | Svelte components: TabStrip, ReaderPanel (rendered Markdown), Editor (title field + CodeMirror + preview), Preferences, SaveIndicator, OperatorHud, QuitDialog, Palette, TypePicker, Legend, LinkTypeManager, StatusBar, HelpSheet, Dialogs, NeighbourhoodView (v1) |
| `io` | Serialize (stable key order), validate, migrate, **save controller** (manual / autosave-to-file), recovery-file scheduler, dirty state, Tauri IPC wrappers |
| `workers` | Force layout (d3-force-3d, per-type springs) and the search index, so heavy work never freezes the UI |

### 8.4 State management

- **One document store per tab** holds that tab's map as a plain, immutable-style object. The `app/workspace` store holds the list of tabs and which one is active.
- **Commands are the only way to change it.** The UI, keyboard and mouse all call `dispatch(command)`. That gives one place for undo, validation, dirty tracking and autosave triggers.
- **The scene subscribes to changes**, not to the whole document. Each command emits a small change list (nodes added/removed/changed, links added/removed/changed). The scene updates only those objects and never rebuilds everything.
- **Dirty state** is a document revision counter compared with the "last saved revision". Undoing back to the saved state makes the map clean again.
- **UI-only state** (mode, Reader open/pinned, palette query, camera, **link-type filters**, active type) is kept apart from the document. It never goes in undo history and never marks the file as unsaved. (Camera and filters *are* saved in the file's `view` section as a convenience, but changing them isn't an "edit".)
- **Link types are document state.** Creating, editing, reordering or deleting a type is a command with undo, like any other edit. Changing a type's colour or style re-styles one material in the scene, with no per-link work.
- Svelte 5's runes (`$state`, `$derived`) are fine for UI state. The document store can be a small custom store that Svelte components subscribe to.

### 8.5 Undo/redo

- Use **Immer's `produceWithPatches`**. Every command produces *forward* and *inverse* patches. Undo applies the inverse; redo applies the forward. These are exact and small, with no snapshots of the whole map needed.
- Each history entry also stores the **selection before and after**, so undo puts the cursor back where the change happened.
- **Grouping:** typing in one edit session merges into one entry, split after about 1–2 seconds of no typing or on leaving Edit mode. A whole Grab (G) operation is one entry. Multi-delete is one entry. A run of **Shift+T** type cycling on the same link is one entry. Deleting a link type together with reassigning its links is one entry. Creating a node *including* its auto-placed position is one entry.
- **Waypoints:** adding, deleting, reordering and clearing are one entry each. Reordering changes one `order` key. A run of arrow-key moves on one waypoint is one entry, closed when another waypoint is selected, after a short pause, or on leaving the mode. A confirmed **G** grab is one entry. Undo also restores Waypoint mode's selected waypoint where possible.
- **Auto-arrange** (all node moves, plus any waypoint reset) is **one entry**, so a disappointing arrangement is a single Mod+Z away.
- **Inside the editor**, CodeMirror's own undo handles character-level undo while editing. When you leave Edit mode, the whole session becomes one app-level entry.
- **History is per tab.** Each tab has its own undo/redo stack; undo never reaches into another tab.
- **Operators** (G, V, S, and L with the mouse) record **one entry on confirm** and nothing on cancel. A grab of nodes plus waypoints is one entry.
- History depth is limited (e.g. 500 entries per tab) to cap memory. History is not saved to the file.

### 8.6 File I/O, saving and recovery

**Save modes** (chosen in Preferences; **one app-wide setting**, decided; a per-map override may come later). Each **tab** tracks its own unsaved state, recovery file and save timing:

| | **Manual save** (default) | **Autosave to file** (optional) |
|---|---|---|
| When the user's file is written | Only on **Mod+S** / Save As | Automatically: about **2 s after editing pauses**, at most **every 30 s** during continuous editing, plus when the window loses focus and on close. **Mod+S** still saves immediately. |
| Unsaved indicator | "●" in the title and "Unsaved changes" in the status bar until saved | "Autosaving…" then "Saved 14:32"; "●" only if a save failed or is paused |
| Closing with changes | Prompt: **Save / Don't save / Cancel** | Final save happens automatically; prompt only if it fails |
| New, never-saved map | "Not saved yet"; close prompts to save | Same, because there's no file to autosave to yet. The first Mod+S picks a location, then autosave takes over. |
| Crash-recovery file | **Yes** | **Yes** |
| Atomic writes and backups | **Yes** | **Yes** (backups rotated per session or every few minutes, not on every autosave, to avoid churn) |

**Events:**

| Event | What happens |
|---|---|
| **New** (Mod+N / Mod+T) | New tab with an empty map: one node, selected, in Edit mode. Status: "Not saved yet". |
| **Open** | Native dialog (or OS double-click / "open with") → if already open, switch to its tab → otherwise Rust reads text → frontend parses, migrates, validates → loads in a new tab. If a recovery file newer than the map exists, offer to restore it. |
| **Save** | Serialize with stable key order → Rust checks for external changes → atomic write (temp file + rename) + backup rotation → mark clean at this revision → delete the recovery file. |
| **Save As** | Same, with a dialog (default extension `.mindmap3d`); **copies the resources folder** to `<new name>.resources/` (v1); updates the tab title and recent files. |
| **Recovery file** (both modes) | After any change, a debounced timer (about 3 s idle, at most every 30 s while busy) writes the current map to a recovery file in app data. This protects unsaved work in manual mode, and covers the gap between autosaves. |
| **Crash recovery** | On start-up, leftover recovery files mean the app didn't close cleanly. Offer **Restore / Discard** for each, showing the time and the original file name. |
| **Close tab / quit** | Manual mode: prompt if unsaved (one combined dialog on quit if several tabs are unsaved). Autosave mode: flush, then close. Each tab's recovery file is removed on clean close. |
| **Switching mode** | Turning autosave on doesn't silently save pending changes; the next edit or Mod+S does. Turning it off leaves the file as last saved. |
| **Save failure** (disk full, permissions, file locked) | Keep the in-memory map and the recovery file, show a clear error with **Retry / Save As…**, and in autosave mode pause autosave until it succeeds. |
| **External change** | If the file changed on disk (sync tools, git): don't overwrite; offer **Reload / Keep mine (Save As) / Compare** (Compare in v1). In v1 a file watcher detects this as soon as it happens. |
| **Undo after save** | Undo history survives saving. In autosave mode, Mod+Z followed by the next autosave writes the undone state. Backups add a second safety net. |

### 8.7 Placement and auto-arrange (v1 for the command)

**The rule:** positions are auto-placed once (see [5.4](#54-editing-flow)), then owned by the user. Nothing re-lays-out the map on its own. Auto-arrange is a command the user runs on purpose.

- **Commands:** *Auto-arrange selection* (**Shift+A**: selected nodes plus, optionally, their immediate neighbours) and *Auto-arrange all* (**Mod+Shift+A**). Both are in the palette, both are **one undo step**, and the status bar says "Arranged 42 nodes. Undo with Mod+Z".
- **Force-directed suits a web.** It needs no root, handles loops and multiple links without special cases, and places clusters of closely linked ideas near each other. Use **d3-force-3d** in a Web Worker: links act as springs, nodes repel each other, and a weak pull toward the centre keeps disconnected clusters from drifting away.
- **Only the target nodes move.** For *Arrange selection*, every other node is a fixed obstacle. **Pinned nodes** (**Shift+P**) are never moved by either command.
- **Per-type springs:** each link type gets layout settings (strength and rest length). Defaults: "part of" short and strong, "relates to" long and weak, "contradicts" medium length so opposing ideas sit visibly apart. Advanced users can change these in the manager.
- **Multiple links between a pair** count as one spring (the strongest), so a pair with three links isn't pulled together three times as hard. Links with waypoints still act as springs between their end nodes; the waypoints themselves don't take part.
- **Hidden types** can optionally be ignored ("arrange by causes only"), which is a powerful way to see one kind of structure.
- **Waypoints** on links between arranged nodes shift by the average movement of the link's two end nodes, unless the user ticks *Reset waypoints on links between arranged nodes*.
- **Starts from current positions,** so an arrange tidies rather than scrambles. It runs a few hundred ticks with cooling and animates to the result (or cuts, with reduced motion). A *Preview → Apply / Cancel* step is a possible refinement.
- *Later:* optional layered arrangement along one directed type (e.g. "causes" flowing left to right, or "part of" stacking vertically).

### 8.8 Preferences (app settings)

Stored locally in the app's config folder, not in map files. Opened with **Mod+,** (and the native menu). Fully keyboard-operable.

| Group | Setting | Default |
|---|---|---|
| **Saving** | Save mode: *Manual* / *Autosave to file* | **Manual** |
| | Autosave delay after editing pauses | 2 s |
| | Autosave maximum interval while editing | 30 s |
| | Backups to keep per map; location (app data / next to file) | 5; app data |
| | Recovery-file interval | 3 s idle / 30 s max |
| **Appearance** | Theme (light / dark / high-contrast in v1); label and reading text size | System; 100% |
| | Title plates behind labels (v1) | Off |
| | Label renderer: *SDF* / *CSS2D* (dev toggle, kept until tested on real GPUs) | SDF |
| | Open nodes in: *Docked Reader panel* / *Pop-over card* | Docked panel |
| **Motion** | Reduce motion (follows the OS by default) | System |
| | Animated link flow (v1): off / selection / all | Off |
| **Linking** | Skip the link-type picker (use last-used type) | Off |
| | Default link types for new maps: *Built-in starter set* / *My template* (v1) | Built-in |
| **Tabs** | Reopen last session's tabs on start-up (v1) | Off |
| **Resources** (v1) | Default resources folder name pattern | `<map name>.resources` |
| | When saving as: copy whole folder / only referenced files | Whole folder |
| **Privacy** | Load remote images in Markdown | Off |
| | Check for updates automatically (v1, opt-in; notification only) | **Off** |
| **Keyboard** | Keymap overrides (v1); Vim-style keymap (Later) | None |

---

## 9. Performance

### 9.1 Suggested targets

These are goals to test against, not measured facts.

| Map size | Target |
|---|---|
| Up to ~1,000 nodes | Smooth (about 60 fps) on an ordinary laptop with integrated graphics |
| ~5,000 nodes | Comfortably usable; labels thinned out by level-of-detail |
| ~10,000+ nodes | Still opens, navigates and saves; heavy features (layout) may be slower |
| Open/save | Under a second for a 5,000-node file |
| Idle | Close to zero CPU/GPU use when nothing is moving (laptop battery) |

### 9.2 Techniques

| Technique | Why |
|---|---|
| **Render on demand** | Only render a frame when something changed (camera, edit, animation). This is the biggest win for battery and heat in a desktop app. |
| **Instanced doc-icon sprites** | All node icons in one instanced draw call (billboarded quads from a small icon atlas). Per-instance colour, size, variant and highlight. |
| **Batched link geometry per type** | One geometry per link type (curves sampled into segments), updated in place when nodes move. Draw calls grow with the number of *types* (usually under ~20), not links. Hiding or dimming a type is a single material change. |
| **Instanced arrowheads** | One instanced cone mesh per directed or bidirectional type. |
| **Route rebuilding only where needed** | When a node moves, rebuild only its links' routes. Waypoint links only rebuild their first and last spans, since waypoints are fixed. Adaptive spline sampling keeps segment counts low on gentle paths. |
| **Tabs** | One shared WebGL renderer; only the active tab renders; inactive tabs keep their document but release GPU buffers after a while and rebuild on switch. |
| **Operators** | Grab/View update positions or camera in place each frame while active (render-on-demand switches to continuous only during the operator). The command is created once, on confirm. |
| **Placement cost** | Auto-placement uses a uniform spatial grid to find nearby nodes, so it stays fast in large maps. |
| **Flow animation budget** | Animated flow (v1) forces continuous rendering. Cap the frame rate, limit flow to the selection's links on big maps, pause when the window is in the background, and disable it with reduced motion. |
| **Graph indexes** | Links-by-node, links-by-type and links-by-pair maps keep link cycling, follow navigation, fanning and filters at constant time per step, not a scan of every link. |
| **Label level-of-detail** | Full title near, short title mid-range, no label far away. Cap the number of visible labels (e.g. about 200–300) chosen by priority. Rich Markdown is only rendered when a node is opened, in the Reader panel. |
| **SDF text batching** | troika-three-text can batch many labels; generate glyphs once per font. |
| **Frustum culling** | Skip labels and link labels that are off-screen. |
| **Cached Markdown** | Cache rendered HTML and derived titles per node, keyed by text, and only re-render when text changes. |
| **Workers** | Force layout and search indexing run in Web Workers. Layout streams positions back a few times a second. |
| **Incremental scene updates** | Apply change lists from commands, never full rebuilds. |
| **Picking** | Raycasting against instanced meshes is fine for thousands. Add three-mesh-bvh only if profiling shows a need. Keyboard navigation uses screen projection, a simple loop that's cheap even for 10k nodes. |
| **Serialization** | One JSON stringify/parse; avoid deep cloning on every keypress (Immer's structural sharing helps). |

### 9.3 Platform caveat

Tauri uses each OS's own WebView: **WebView2** (Chromium-based) on Windows, **WKWebView** (WebKit) on macOS, and **WebKitGTK** on Linux. WebGL performance and quirks differ between them, and Linux/WebKitGTK is often the weakest. Plan to test performance on all three from Phase 0. Stick to **WebGL 2** rather than WebGPU, which isn't reliably available in all three WebViews.

---

## 10. Tech stack

| Layer | Choice | Reasoning | Alternatives considered |
|---|---|---|---|
| App shell | **Tauri v2** | Small installers, low memory, Rust backend for safe file handling; already decided | Electron (heavier, but one consistent Chromium everywhere) |
| Language | **TypeScript** (strict) | The data model and commands benefit a lot from types | Plain JS |
| Build | **Vite** | Fast dev server; standard with Tauri templates | — |
| UI framework | **Svelte 5** | Tiny runtime, little boilerplate, easy for one person to keep in their head; good fit for panels and overlays. The 3D scene is driven directly with Three.js, outside the framework, so the framework only handles the 2D UI. | **SolidJS** (similar strengths); **React** (largest ecosystem and react-three-fiber, but more runtime and re-render care; a good pick if helpers already know React) |
| 3D | **Three.js** | Mature, huge community, has CSS2D renderer, instancing, fat lines; already decided | Babylon.js |
| 3D text | **troika-three-text** (SDF) + HTML overlay | See [5.6](#56-rendering-text-legibly-in-3d) | CSS2D only; canvas sprites |
| Lines | Three.js `Line2` / `LineMaterial` | Consistent thick, dashed and dotted lines across platforms; one material per link type | Mesh tubes (heavier) |
| Markdown | **markdown-it** | Fast, synchronous (good for live preview), CommonMark-compliant, lots of plugins (task lists, footnotes); raw HTML easy to turn off | **remark/unified** (powerful AST tooling, but async and heavier; better if you'll do lots of Markdown transformations) |
| Sanitizing | **DOMPurify** | Defence in depth even with raw HTML disabled | — |
| Editor | **CodeMirror 6** | Excellent keyboard model, accessible, modular and small, good Markdown mode, easy custom keymaps | Monaco (heavy, IDE-oriented), ProseMirror/Tiptap (WYSIWYG; less transparent for "Markdown as source") |
| Undo | **Immer** (patches) | Exact inverse patches; structural sharing | Hand-written inverse commands; snapshots |
| Validation | **Valibot** or **Zod** | Runtime validation + TS types from one definition | Ajv + JSON Schema |
| Fuzzy search | **uFuzzy** or **fuzzysort** | Small, fast, good ranking for palettes | Fuse.js (slower on large lists) |
| Layout (v1) | **d3-force-3d** in a Web Worker | Proven force-directed simulation in 3D; fits a free-form web with loops; per-link spring strength/length maps neatly onto link types | ngraph.forcelayout |
| Ids | **ULID** or **UUIDv7** | Unique, sortable, collision-safe | nanoid |
| Testing | **Vitest**, **fast-check**, **Playwright**, **WebdriverIO + tauri-driver**, Rust `cargo test` | See [Section 13](#13-testing-strategy) | Jest |
| Ordering | **fractional-indexing** | Order keys for link types and waypoints that never need renumbering; CRDT-friendly | Integer positions (clash in collaboration) |
| Single instance | Tauri **single-instance** plugin | OS "open file" requests become new tabs in the running app | — |
| Packaging | Tauri bundler + **GitHub Actions** (official `tauri-action`) | Builds installers for all three OSes and uploads them to GitHub Releases | — |

### 10.1 Licence, distribution and updates

**Licence: recommended *MIT OR Apache-2.0* (dual).** The creator can change this; it's a recommendation, not legal advice.

| Option | What it means | Fit |
|---|---|---|
| **MIT OR Apache-2.0** *(recommended)* | Anyone can use, modify and redistribute, including in closed products; Apache-2.0 adds an explicit patent grant | Same as Tauri and much of the Rust ecosystem; compatible with the planned dependencies (Three.js, Svelte, CodeMirror, markdown-it, troika-three-text, Immer and d3-force-3d are MIT; DOMPurify is MPL-2.0/Apache-2.0); lowest friction for contributors and for other tools reading or writing `.mindmap3d` |
| **GPL-3.0-or-later** | Anyone distributing modified versions must publish their source under the GPL | Pick this if it matters that forks stay open source. Still compatible with MIT/Apache-2.0 dependencies |
| **MPL-2.0** | Copyleft per file: changed files must stay open, but it can be combined with other code | A middle ground |

Practical points: add `LICENSE-MIT` and `LICENSE-APACHE`; ship third-party licence notices in the app's About box (generated in CI); use a **DCO sign-off** for contributions rather than a CLA; publish the `.mindmap3d` JSON schema under the same licence (or CC0), so anyone can build compatible tools.

**Distribution: GitHub Releases.**

- CI (GitHub Actions with `tauri-action`) builds on Windows, macOS and Linux runners on each tagged version. It produces `.msi`/NSIS `.exe` for Windows, `.dmg` for macOS (Apple Silicon and Intel, or universal), and `.AppImage`, `.deb` and `.rpm` for Linux, and uploads them to a GitHub Release with release notes.
- Publish a **SHA-256 checksums** file, and use GitHub's **artifact attestations** (build provenance), so users can check a download came from the project's CI.
- Later: winget, Homebrew, Flathub and AUR listings.

**Code signing for an open-source project**

| Platform | If unsigned | Options |
|---|---|---|
| **Windows** | SmartScreen shows "Windows protected your PC"; users click *More info → Run anyway*. Warnings fade as a download gains reputation. | **SignPath Foundation** offers free code signing to qualifying open-source projects. Microsoft's cloud signing service (Azure Trusted Signing) is low-cost but has eligibility limits; check current terms. Classic certificates are paid and need hardware-backed keys. |
| **macOS** | Gatekeeper blocks un-notarized apps; users have to allow them in *System Settings → Privacy & Security* ("Open Anyway"). Recent macOS versions removed the old right-click → Open shortcut, so this is a real barrier. Apple Silicon needs at least an ad-hoc signature, which the build can add. | Notarization needs a paid **Apple Developer Program** membership (about US$99/year at the time of writing). There's no general free tier for open-source individuals. |
| **Linux** | No OS-level signing; packages install normally | Publish checksums; optionally GPG-sign them. Flathub builds are signed by Flathub. |

*Recommendation:* sign Windows builds through SignPath if the project qualifies. For macOS, budget for the Apple membership if Mac users matter; otherwise ship unsigned builds with clear install instructions in the README and release notes. Release notes should always say which builds are signed.

**Updates: recommendation**

- **MVP: no in-app network use at all.** *Help → Check for updates…* opens the project's GitHub Releases page in the user's browser, and the app shows its own version in About. This matches the local-only decision exactly.
- **v1: opt-in automatic check, off by default.** When turned on, at most once a day the app makes one HTTPS request to the GitHub Releases "latest" endpoint and compares versions. If there's a newer one, it shows a notification with a link. It never downloads or installs anything, and sends nothing beyond the request itself. The Tauri permission is limited to that single URL.
- **Later, only if users ask:** in-app download and install with the Tauri updater plugin. That needs its own update-signing key (separate from OS code signing), kept in CI secrets.

---

## 11. Roadmap and milestones

No dates. Effort is relative: **S** ≈ 1 unit, **M** ≈ 2–3 units, **L** ≈ 4–6 units. A unit is whatever a comfortable chunk of work turns out to be for whoever builds it. After Phase 0, use the real speed of the first phases to estimate the rest.

### Phase 0 — Spike and foundations (S–M) — *done*

- Tauri + Vite + Svelte + TypeScript skeleton; builds run on Windows, macOS and Linux.
- Three.js scene with a few thousand dummy nodes and links.
- **Label experiment:** CSS2D vs troika SDF, measured on each OS (see [5.6](#56-rendering-text-legibly-in-3d)).
- Quick keyboard test: arrow-key spatial navigation on dummy data. Does it *feel* right?
- **Exit:** decisions on label technique and node placement, confirmed by trying them.
- **Outcome:** troika SDF chosen for titles (CSS2D kept behind a toggle until tested on real GPUs). Windows and macOS builds are **not yet verified** (see Risks).

### Phase 1 — Core document and commands (M) — *done*

- Data model in its final, collaboration-ready shape: **id-keyed objects**, **fractional-index order keys** (link types, waypoints), optional `title` on nodes and links, self-links valid, `resourcesFolder` reserved; **link-type registry** and starter set; schema, validation, integrity checks.
- Graph indexes (links by node, by type, by pair) and queries (neighbours, follow).
- Command dispatcher, Immer patches, undo/redo with grouping.
- Serialization with stable key order; migration framework (with a dummy v0→v1 to prove it).
- Thorough unit and property tests.
- **Exit:** a complete headless "map engine", fully tested.

### Phase 2 — Scene and navigation (L)

- **First: set up the GitHub Actions build matrix** (Windows, macOS, Linux; build + unit tests on every push), moved forward from Phase 7 because Windows/macOS are still unverified. Phase 7 keeps only the release/publishing parts.
- Apply the Phase 0/1 decisions: **MAJOR.MINOR version checks** (refuse newer major, round-trip newer minor), narrowed **link-type repair**, **weighted spatial-navigation scoring** with its config and fixture tests, SDF titles with outline plus the CSS2D toggle.

- Instanced doc-icon sprites with SDF titles above them, batched curved links (per type: colour, pattern, width), arrowheads, pair fanning, SDF titles, link labels, selection highlight.
- Orbit camera (keyboard + mouse), focus, frame all, auto-follow, reduced motion; **operator framework** with the **V** view operator; mouse selection (click title, icon, label, line).
- Two-line link labels (title + type name); self-link loop rendering for files that contain one.
- Spatial navigation, depth navigation, link cycling, back/forward history.
- Render-on-demand loop.
- **Exit:** you can fly around and navigate a loaded sample map by keyboard alone.

### Phase 3 — Editing (M)

- **Reader panel** (Enter/click icon opens rendered Markdown; Esc closes; pin reader), then **Edit** (E/Enter) with title field, CodeMirror 6 and live markdown-it preview, sanitized.
- Enter/Esc edit flow (nodes and links, with title fields); Tab creation (last-used type); **auto-placement** (candidate scoring + local nudge, existing nodes never move); delete; **G grab operator** (mouse + keys, axis constraints, depth, precision, snap, confirm/cancel); positions persist.
- **Exit:** you can build a map from scratch with the keyboard.

### Phase 4 — Links and link types (M)

- Link mode with rubber band, spatial targeting, **mouse targeting** (pointer highlight, click to choose, right-click cancels), palette targeting, N for new target.
- **Type picker** (1–9, fuzzy search, create new type), pre-picking in Link mode, Shift+Tab flow.
- Change type of selected links (1–9, T, Shift+T), reverse direction (R); link text editing.
- **Link-type manager (basic)** with safe delete/reassign.
- **Legend overlay** with show/dim/hide/solo; Alt+1…9 quick toggles; status-bar filter reminder.
- Type navigation: Alt+[/], follow with . and ,.
- **Exit:** all MVP node, link and link-type operations work by keyboard.

### Phase 5 — Files, tabs and safety (M–L)

- Rust commands: atomic save, external-change check, backups, recovery files, dialogs, close guard, preferences store.
- **Save controller with both modes:** manual (default) with unsaved indicator and close prompt; autosave-to-file (debounce + max interval + on blur/close); recovery file in both; crash-recovery flow; open/new/save/save as; save-failure handling.
- Preferences window (Mod+,) with the saving, appearance and linking settings.
- **Tabs:** workspace store, per-tab history/selection/view/save state/recovery file, tab strip, Mod+T/W/O, Ctrl+Tab, Mod+1…9, reopen closed tab, combined quit dialog.
- **`.mindmap3d` file association** in the bundler config; single-instance plugin (OS open → new tab).
- Check that the app makes no network requests (local-only).
- **Exit:** "pull the power cord" test passes; no data lost beyond the last few seconds.

### Phase 6 — Keyboard polish and accessibility baseline (M)

- Command palette (commands + nodes), help sheet, status bar hints.
- ARIA tree mirror and live announcements; F6 region cycling; focus return after dialogs.
- Non-US layout checks; OS shortcut conflict checks.
- **Exit:** the full MVP is usable with no mouse and with a screen reader at a basic level.

### Phase 7 — MVP hardening and release (M)

- Performance pass against the targets in [Section 9](#9-performance).
- **Release pipeline** (the CI build matrix already exists from Phase 2): `tauri-action` building signed/unsigned installers for all three platforms; GitHub Releases with notes, SHA-256 checksums and artifact attestations; Linux AppImage/deb/rpm.
- **Signing** per [10.1](#101-licence-distribution-and-updates): Windows via SignPath (if accepted) or unsigned with instructions; macOS notarized if the Apple membership is taken, otherwise unsigned with instructions.
- **Open-source housekeeping:** licence files (MIT OR Apache-2.0 recommended), third-party notices in About, CONTRIBUTING with DCO, published JSON schema.
- *Help → Check for updates…* opens the Releases page (no in-app network use).
- Error logging to a **local** log file only (local-only decision); users can choose to attach it to a bug report themselves.
- **Exit:** MVP release.

### v1 phases (after MVP)

| Phase | Content | Effort |
|---|---|---|
| v1-A | Neighbourhood view (also the accessibility path), focus mode (N hops, optionally by type) | M |
| v1-B | Auto-arrange selection / all (force-directed in a worker), per-type springs, arrange by visible types, pinning, one-step undo | M–L |
| v1-W | Link waypoints: data already in format; Catmull–Rom routing, label/arrow placement, Waypoint mode, handle selection + G grab, waypoints moving with the selection, undo grouping | M |
| v1-R | Images and attachments: resources folder, insert (Mod+Shift+I) / drop / paste with copy-in, scoped serving, missing-file placeholders, Check resources, Save As copy, relink offer | M |
| v1-B2 | Link-type extras: animated flow, icons/descriptions polish, templates incl. **app-level default starter set**, merge types, saved filter presets, path between nodes by type | M |
| v1-C | Multi-select (nodes and waypoints, Shift+click), group grab carrying internal and selected waypoints, **S** scale operator, styling, themes incl. high contrast | M |
| v1-D | Search highlighting/filter, camera bookmarks (Mod+Alt+1…9), remappable keymap, numeric input for operators | M |
| v1-E | Export (PNG, Markdown outline), import (Markdown outline), recent files, session restore, external-change watcher, **opt-in update check** | M |

### Rough shape of the total

MVP is about **15–25 units** across Phases 0–7 (typed links add roughly 1–2 units to Phase 4; tabs, the operator framework and the release pipeline add roughly 2–3 more), and v1 adds about **16–23 more** (waypoints ≈ 2–3 units, images ≈ 2–3 units). The 3D scene/navigation work (Phase 2) and release work (Phase 7, especially code signing and cross-platform testing) are the most likely to run over.

---

## 12. Risks and open questions

### 12.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Text hard to read in 3D** | High: core experience | Medium | Only short SDF titles in 3D, clamped size, outlines (plates optional in v1), LOD; full text always in the Reader; Phase 0 confirmed SDF over CSS2D at scale |
| **Users get lost in 3D** | High | Medium | Orbit-around-selection camera, no roll, frame-all, auto-follow, neighbourhood view, focus mode, camera bookmarks |
| **Spatial arrow navigation feels random** | High for keyboard-first | Medium | One weighted scoring function (angle, screen distance, strong depth penalty, link bonus) with tunable config and fixture tests, cone limit, "go back" memory, graph-based and type-based navigation (follow, back) as a reliable fallback; user testing early |
| **WebView differences** (esp. WebKitGTK on Linux) | Medium | Medium–High | Test all three OSes from Phase 0; WebGL 2 only; avoid cutting-edge web APIs |
| **Windows and macOS unverified so far** (after Phase 0/1, only the builder's platform has been exercised) | High | Medium | **Move the GitHub Actions build matrix (Windows, macOS, Linux) to the start of Phase 2**, building and running unit tests on every push; smoke-test the app by hand on a real Windows PC and Mac as soon as possible; include real-GPU checks of the SDF vs CSS2D label decision |
| **SDF label decision based on limited hardware** | Medium | Medium | CSS2D toggle kept until tested on real GPUs (integrated and discrete, all three OSes) |
| **Keyboard conflicts** (OS shortcuts, non-US layouts, IME) | Medium | High | Mod-key abstraction, alternatives for symbol keys, remappable keymap, per-OS testing |
| **DOM label performance** | Medium | Medium (if CSS2D) | SDF labels, label cap, culling |
| **Data loss** | High | Low with mitigations | Atomic writes, backups, recovery file in both save modes, never overwrite newer-version or externally changed files |
| **Forgetting to save in manual mode** | Medium | Medium | Clear text indicator, close/quit prompt, recovery file, crash-recovery prompt |
| **Autosave writes unwanted changes into the real file** | Medium | Low–Medium | Off by default; undo survives saves; rotated backups; no silent save when switching modes |
| **Autosave fights sync tools or git** (file changed elsewhere) | Medium | Medium | External-change check before every write; pause autosave and ask; never overwrite silently |
| **Reader/edit step feels slower than direct editing** | Low–Medium | Medium | **E** edits directly; Tab-created nodes open straight in Edit; Esc goes back to where you came from |
| **Doc icons all look the same** in big maps | Medium | Medium | Node colour tint, size, text/blank variants, titles always shown near; more icon variants in v1 |
| **Unsafe Markdown (script injection)** | High | Low with mitigations | markdown-it with raw HTML off, DOMPurify, strict CSP, Tauri capabilities, external links open in browser |
| **3D canvas inaccessible to screen readers** | Medium–High | Certain without work | ARIA tree mirror, live region, neighbourhood view |
| **Unsigned builds scare users** (SmartScreen, Gatekeeper) | Medium | High (unless signed) | SignPath for Windows if accepted; budget for Apple notarization or document "Open Anyway" clearly; checksums and attestations; say in release notes which builds are signed |
| **Mouse operators unfamiliar** to people who don't use Blender | Medium | Medium | Status-bar hints and an on-screen operator HUD; identical keyboard paths; cancel always restores exactly; short first-run tips; help sheet section |
| **Tabs multiply memory and GPU use** | Medium | Medium | One shared renderer; only the active tab renders; release inactive tabs' GPU resources; documents are small compared with GPU buffers |
| **Broken image references** after moving/renaming maps outside the app | Medium | Medium | Resources folder next to the map; relink offer; missing-file placeholders with Locate/Remove; Check resources |
| **Resources folder as an attack surface** (path tricks, malicious SVGs) | Medium | Low with mitigations | Scoped asset protocol, `..` refused, SVG shown as images only, executables blocked from "open" |
| **Order-key growth** (very long keys after many reorders) | Low | Low | "Repair order" rewrites keys when they get long; ties sorted by id |
| **Code signing / notarization friction** | Medium | High | Plan for it in Phase 7; see [10.1](#101-licence-distribution-and-updates) |
| **Visual clutter from many link types and dense webs** | High | High | Colour-blind-friendly palette plus pattern/width/icon; per-type dim/hide/solo; "dim nodes with no visible links"; focus mode (v1); legend always one key away; label level-of-detail hides type names at a distance; layout by chosen types (v1) |
| **Too many types** (users create dozens of near-duplicates) | Medium | Medium | Usage counts in the manager, warning on duplicate names, merge types (v1), only the first nine get number keys, so a short list is encouraged |
| **Link types hard to tell apart** (similar colours, colour blindness, distance) | Medium | Medium | Redundant encoding (pattern + width + icon + type name under each link label); arrowheads clamped to a minimum size; type name in the Reader header and status bar; high-contrast theme |
| **Two-line link labels add clutter** | Medium | Medium | Smaller, lighter type line; level-of-detail (type line hidden at mid-range, all labels hidden far away); overlap priority; dim/hide types |
| **Hidden filters confuse users** ("where did my links go?") | Medium | Medium | Status-bar reminder when filters are active; Alt+0 shows all; filters listed in the legend |
| **Animated flow is distracting or drains battery** | Low–Medium | Medium | Off by default, capped frame rate, selection-only option, off with reduced motion |
| **Auto-placement puts nodes in awkward spots** in dense areas | Medium | Medium | Overlap and visibility scoring, wider retries, local nudge; Grab (G) one key away; Auto-arrange selection (v1) |
| **Users expect the map to keep tidying itself** | Low–Medium | Medium | Auto-arrange commands discoverable in the palette and help sheet; status-bar hint after many manual moves |
| **Stale waypoint routes** after nodes move (fixed waypoints now in odd places) | Medium | Medium | Group moves carry internal waypoints; Shift+Delete clears a route; Auto-arrange option to reset; handles visible on selection so problems are easy to spot |
| **Moving points in 3D is hard to judge** (depth ambiguity) | Medium | High | Move in the screen plane plus explicit depth keys; drop lines to the ground grid; camera eases to keep the point in view; orbit to check |
| **Small handles are hard to hit with the mouse** | Low–Medium | Medium | Keyboard Waypoint mode is primary; handles clamped to a minimum size; generous pick radius |
| **Spline routes look wrong** (overshoot, loops, sharp kinks near nodes) | Low–Medium | Low | Centripetal Catmull–Rom; end tangents aimed at node surfaces; adaptive sampling; label segment option |
| **Scope creep** (layout, collaboration, themes before MVP) | High | High | Strict MVP list; "Later" list as a parking lot |

### 12.2 Open questions for the creator

**All earlier open questions have been answered and moved to [Decisions](#decisions).** Only a few small practical points remain, none of them blocking Phase 0 or Phase 1:

1. **App name:** "3D Mind Map" is a working title. A final name affects the repository, bundle identifier, file-association description and installers (decide before Phase 7).
2. **macOS signing budget:** pay for the Apple Developer Program to ship notarized Mac builds, or ship unsigned Mac builds with instructions at first (see [10.1](#101-licence-distribution-and-updates))? Decide before the first public release.
3. **Licence confirmation:** this plan recommends **MIT OR Apache-2.0**. Confirm it, or choose GPL-3.0-or-later / MPL-2.0, before the repository goes public.

## 13. Testing strategy

| Level | What | Tools |
|---|---|---|
| **Unit** | Model helpers, commands, integrity checks, title extraction, keymap resolution, mode machine, spatial navigation scoring (single weighted function from one config; fixture layouts with fixed camera/positions); **link types**: delete-with-reassign, reorder → number keys, missing typeId reassigned to "relates to" (only that type restored when none exist), follow by direction, pair fanning offsets (2, 3, many links; both directions), filter effects on cycling/follow; **title derivation** for nodes **and links** (explicit title, heading, first line, formatting removed, empty title) and **link label content** (title + type line, type line only when untitled); **order keys** (insert between, reorder one item, ties by id, repair); **serialization** (id-keyed objects written in stable order, unchanged round-trip, self-links preserved); **operators** (G constraints, depth, precision, snap, cancel restores exact state, one command on confirm; L mouse targeting; V restore); **save controller** (dirty tracking incl. undo back to saved, debounce and max-interval timing, mode switching, failure pause); **placement**: no overlap with existing nodes, existing nodes untouched, crowded-area fallback; **waypoints**: spline passes through every waypoint in order, label at arc-length midpoint or chosen segment, arrowhead along final tangent, reverse link reverses order, insert-by-clicked-segment keeps order, a single-node move leaves unselected waypoints in place, group grab carries internal waypoints, selected waypoints move with the selection, auto-arrange shifts internal waypoints by the average end movement; **resources** (path resolution, `..` refused, name-clash suffixes, hash reuse) | Vitest |
| **Property-based** | For random sequences of commands (including link-type create/edit/delete/reassign/reorder, waypoint add/move/reorder/delete/clear, grabs of mixed node/waypoint selections, auto-arrange, on random webs with loops, self-links and parallel links): undo-all returns the original map; redo-all returns the final map; save→load round-trip is lossless; integrity rules always hold; graph indexes always match a from-scratch rebuild | fast-check |
| **Migrations** | A folder of sample files for every past version; each must load, migrate and validate. Add a file every time the format changes. | Vitest fixtures |
| **Robustness** | Load corrupt, truncated, huge and hostile files (bad ids, cycles, NaN, script tags in text). The app must never crash or run injected code. | Vitest + fuzzed inputs |
| **Versioning** | Newer major → refused with the message and **no write of any kind** (file bytes and modification time unchanged; no recovery file); same major + newer minor → opens, and unknown fields at every level survive save unchanged; integer `1` reads as `1.0` | Vitest fixtures + Rust test |
| **Link-type repair** | File with no link types → only "relates to" restored; missing `typeId`s reassigned to it with a report; new map → full starter set | Vitest fixtures |
| **Spatial navigation fixtures** | Hand-built layouts with a fixed camera and expected targets for every arrow and Mod+↑/↓ press, all driven by the single weights config | Vitest |
| **Component** | Reader for nodes **and links** (open, scroll, Tab through links, E to edit, Esc focus return), tab strip, operator HUD, editor (title field, Alt+T, Esc returns to origin), palette, status bar/save indicator, Preferences, help sheet | Vitest + Svelte Testing Library |
| **End-to-end (web build)** | Main user flows in a browser build with the Tauri bridge mocked: create map by keyboard, link, edit, undo, save | Playwright |
| **End-to-end (real app)** | Smoke tests of the packaged app, including real file save/open. tauri-driver supports Windows and Linux; macOS needs manual or other checks. | WebdriverIO + tauri-driver |
| **Rust** | Atomic save, backup rotation, recovery-file handling, external-change detection, path validation, resources copy/hash reuse/Save As folder copy, scoped serving refusing escapes | `cargo test` |
| **Tabs** | Per-tab undo isolation, per-tab unsaved state and recovery files, opening an already-open file switches tabs, OS open → new tab (single instance), combined quit dialog, reopen closed tab | Vitest + WebdriverIO |
| **Packaging** | `.mindmap3d` association works after install on each OS; release artifacts have matching checksums and attestations | Manual per release + CI checks |
| **Update check (v1)** | Off by default makes no requests; on makes exactly one request to the allowed URL, at most daily | CI network sandbox |
| **Saving end-to-end** | Both modes: unsaved indicator, close prompt (manual), flush-on-close (autosave), kill the app mid-edit → recovery offered, file changed externally → no overwrite, read-only folder → clear error | WebdriverIO + tauri-driver, manual on macOS |
| **Local-only check** | Run the main flows with network monitoring and confirm no outgoing requests | Manual / CI network sandbox |
| **Visual regression** | Screenshots of the scene with a fixed camera and sample map, including every starter link type, arrowheads, parallel links and dimmed/hidden types, to catch rendering breakage | Playwright screenshots |
| **Performance** | Generated maps of 1k / 5k / 10k nodes: frame time while orbiting, time to load/save, memory; tracked over time | Custom benchmark script + browser performance tools |
| **Accessibility** | Automated checks of the HTML UI; manual screen-reader passes; "unplug the mouse" full-workflow test before every release | axe-core; NVDA, VoiceOver, Orca |
| **Cross-platform** | CI builds and tests on Windows, macOS and Linux for every change, **from the start of Phase 2** | GitHub Actions |
| **Usability** | Early sessions where a few people try keyboard navigation, editing and typed linking (Phase 0, after Phase 3, after Phase 4). Check that people can tell the starter types apart and find the picker and legend without help. | Watching + notes |

**Definition of done for MVP:** all MVP features work by keyboard alone on all three OSes; undo/redo and save/load round-trip property tests pass; no data lost in kill-the-app tests; performance targets for 1,000 nodes met; basic screen-reader flow works.

---

## 14. Summary

- Build a **keyboard-first 3D mind-mapping desktop app** on **Tauri + Three.js**, with **TypeScript + Svelte 5** for the UI, **CodeMirror 6** for editing, and **markdown-it + DOMPurify** for Markdown.
- Maps are a **free-form web** of nodes joined by **typed links**. Each map has a user-editable link-type registry (colour, pattern, width, direction, icon) with a seven-type starter set. MVP includes the type picker, basic manager, legend and show/dim/hide filters; v1 adds animated flow, templates, saved filters and per-type layout springs.
- **Layout is auto-place once, then manual:** new nodes are placed near their linked node without overlaps, then keep the user's positions. Re-layout only happens via explicit, undoable *Auto-arrange selection/all* (v1). Links auto-route, but users can pin ordered **waypoints** (smooth Catmull–Rom route, keyboard Waypoint mode and G grab, moving with the selection; v1, with the data field in the format from day one).
- Make **readable 3D text** and **predictable spatial navigation** the top priorities, and prove both in a short Phase 0 spike before building on them.
- Keep the **document core pure and command-based**, with Immer patches for undo/redo. Keep the **Rust side small** and focused on safe file handling.
- Nodes appear as **doc icons with floating titles** (explicit title or first heading/line). **Enter or a click opens** the rendered Markdown in a docked **Reader panel**; **E** edits; **Esc** steps back.
- Store maps as **versioned, git-friendly JSON**, **locally only**. **Manual save is the default**, with optional autosave-to-file in Preferences, and atomic writes, backups and a crash-recovery file in both modes.
- Design **accessibility in from the start** (ARIA mirror, neighbourhood view, reduced motion, keyboard paths for every mouse operator, remappable keys).
- **Latest decisions:** `.mindmap3d` files with an id-keyed, order-keyed, **collaboration-ready format**; **tabs** with per-tab undo and save state; **Blender-style mouse operators** (G grab, L link, V view; S scale in v1); **link labels** showing title plus type name; **waypoints move with the selection**; images in a **resources folder** (v1); self-links allowed (creating them comes later); Vim keys later; open source under **MIT OR Apache-2.0** (recommended), shipped on **GitHub Releases**, with **no in-app network use in MVP** and an **opt-in update check** in v1.
- All earlier open questions are answered. Only the app name, the macOS signing budget and licence confirmation remain ([12.2](#122-open-questions-for-the-creator)).
