# Repository rules

- This repository owns only the static reusable Library Window, Resource Library controller, Lightbox and their presentation assets.
- Do not add PHP, upload storage, content libraries, account logic or WebGPU providers here.
- Preserve the public globals `BZNNewUILibraryWindow`, `BZNResourceLibrary` and `BZNLightbox` unless every external consumer is migrated and verified.
- `NewUI/windows/library_window.json` is the editable configuration source. Regenerate `library_window.data.js` with `node NewUI/tools/build-library-window-config.mjs`.
- Keep URLs environment-driven through `BZNLibraryRuntimeConfig`; do not duplicate deployment origins inside controllers.
- Update `FUNCTION_CALL_GRAPH.md` and the focused tests when changing a public function or dependency.
- Do not commit, push or deploy without an explicit user command.
