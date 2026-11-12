# Scientific workspace redesign, November 11, 2026

Job: open a tissue microarray image, segment tissue cores, review their grid positions, edit metadata, and export the results in a browser. Reference products: TMA-Grid, TissUUmaps, and OpenSeadragon's scientific image viewer.

Must-haves: local and URL image input; real model segmentation and manual correction; interactive whole-slide gridding; review and metadata editing; existing export formats; keyboard and smaller-screen access. Constraints: static HTML/JavaScript, GitHub Pages, browser-side image processing, existing imagebox/OpenCV/TensorFlow dependencies, no new service or account.

Skills: clone-website (primary-baseline and inspection references), frontend-design, Uncodixfy, imagegen, ai-material-realism, humanizer, webapp-testing, test-driven-development, verification-before-completion. Level 2 applies because the interface across the complete daily workflow is changing. The scientific method and model are outside this redesign; no new clinical, scientific, or teaching method is proposed.

## Search and audit

Installed skills were searched for interface cloning/reverse engineering, professional frontend design, image mockups, and browser workflow testing. Queries included `open source scientific image viewer web application OpenSeadragon TissUUmaps Vitessce UI`, `tma-grid GitHub tissue microarray dearraying interface`, `OpenSeadragon annotorious image annotation javascript toolbar GitHub license`, and the qualified scientific-image/tissue-viewer searches in `search-results.json`. GitHub API queries used `in:name,description,readme stars:>100 pushed:>2025-11-11`, domain topics microscopy/openseadragon/bioimage, JavaScript, MIT/BSD-3-Clause, and `archived:false`. These three constrained searches returned no results; a broader OpenSeadragon search returned 606 repositories and was sorted by both stars and updated date.

Sources checked: existing project dependencies; npm's OpenSeadragon, Annotorious, and TissUUmaps metadata; GitHub repositories and openseadragon/bioimage topics; the awesome-selfhosted directory; OpenAlternative; opensourcealternative.to; AlternativeTo; LibHunt; and microscopy/viewer discussions returned by web search. The general product directories did not establish a better static TMA editor. F-Droid is inapplicable to a browser application. A whole-slide annotation library does not replace the TMA-specific workflow.

Live repository facts checked November 11, 2026:

| Candidate | Fit | Stars / forks | Last push | Latest release | License | Setup / verdict |
|---|---|---|---|---|---|---|
| [TMA-Grid](https://github.com/episphere/tma-grid) | 6/6 | 4 / 0 | 2026-10-15 | No tagged release | MIT | Static server; chosen primary, exact task and existing data/controllers |
| [TissUUmaps 3](https://github.com/TissUUmaps/TissUUmaps3) | 3/6 | 73 / 13 | 2026-10-12 | 3.2.1.11, 2024-10-24 | MIT | Python/static application; reuse its complete DOM control factory, preserve its license |
| [OpenSeadragon](https://github.com/openseadragon/openseadragon) | 3/6 | 3,537 / 705 | 2026-11-10 | 6.1.1, 2026-09-09 | BSD-3-Clause | Already loaded at 4.1.0; use its native toolbar/button controller at that version |
| [TissUUmaps 4](https://github.com/TissUUmaps/TissUUmaps) | 3/6 | 15 / 3 | 2026-11-05 | 4.0.0-beta.3, 2026-10-11 | MIT | Inspected live app/source; replacing this app with its React/monorepo would discard TMA functions |
| [Annotorious](https://github.com/recogito/annotorious) | 2/6 | 874 / 134 | 2026-10-20 | npm 3.9.5, 2026-10-20 | BSD-3-Clause | Annotation rather than TMA gridding; would duplicate working edit controls |

TMA-Grid has 3 contributors, 0 open issues, and no closed issues returned since August 13. TissUUmaps 3 has 11 contributors, 30 open issues, and 4 closed issues updated in that window. OpenSeadragon has at least 100 contributors, 458 open issues, and 50 closed issues updated in that window; the contributor result is capped at 100, and issue results include PRs. Activity counts do not prove individual issue responsiveness. TissUUmaps 3's old release is a risk for adopting its whole application; its small dependency-free DOM factory is suitable for bounded reuse. Sources, licenses, tests and maintainer activity were inspected directly, rather than treating directory rankings as evidence.

## Primary baseline and secondary contributions

The full unchanged TMA-Grid checkout is pinned at `f7ed551645f52f51dbe0c11e9e97d3c88ed90035` in `C:/Users/Aaron Ge/.codex/scratch/tma-grid-ui-20261111/tma-grid-baseline`. It includes all controllers, styles, assets, model files and existing dependencies. Run `python -m http.server 8001 --directory <that folder>`. Original source files remain inspectable through that checkout and Git history.

The baseline was run unchanged at 1440 x 1000. Real Hamamatsu TIFF loading, model inference (190 detected cores in this run), and grid construction (211 entries including inferred positions) succeeded without JavaScript page errors. Screenshots are in `evidence/`. TissUUmaps' working project-opening flow and OpenSeadragon's working toolbar example were also inspected at that viewport. Their source and dependencies were examined before selecting contributions.

1. Preserve TMA-Grid's complete workflow and state controllers. Tailor its markup and visual layer around the existing IDs, events, image APIs and algorithms.
2. Copy TissUUmaps 3's entire `tissuumaps/static/js/utils/HTMLElementUtils.js` unchanged, pinned to `d541bbcba7e218851c1e838bc1610e8b1ec753a9`. Use its real `createElement`/`createButton` functions for the viewer toolbar, with host-specific IDs and labels supplied by a separate adapter. No runtime dependencies are added. Original: https://github.com/TissUUmaps/TissUUmaps3/blob/d541bbcba7e218851c1e838bc1610e8b1ec753a9/tissuumaps/static/js/utils/HTMLElementUtils.js
3. Use OpenSeadragon 4.1.0's existing native toolbar, zoom, home and full-page button controllers directly through its documented custom-button options. Do not rewrite zoom/full-page interaction. Reference: https://openseadragon.github.io/examples/ui-toolbar/ and https://openseadragon.github.io/examples/ui-custom-buttons/. Preserve the existing 4.1.0 runtime rather than mixing a library upgrade into this UI task.

The remaining custom work is host integration: moving existing controls beside their images, the stage headings and file context, shared visual tokens, responsive layout and browser checks. No candidate supplies those TMA-specific integrations. Keeping the existing baseline costs less and preserves more working functionality than replacing it with a different microscopy application.

## Direction and adaptations

The built-in image generator first produced `concept.png`, using the prompt in `image-prompt.txt`. Aaron then requested a separate generated target for every screen and direct comparison with the real UI. Eight further targets are retained in `targets/`: local-file input, URL input, Box input, segmentation, grid review, core editing, export, and selected-core metadata. The generation specification is in `PROMPT-RECORD.json`. `comparison.html` pairs every target with an actual application capture at the same 1568 × 1003 viewport.

The final tokens are white `#ffffff`, workspace gray `#f5f7f9`, border `#cbd5dc`, charcoal `#233139`, secondary text `#5d6c74`, and teal `#006b6a`. The existing Inter family is retained. Body text is 16px, ordinary labels/controls are 14–16px, the wordmark is 28px, and page headings are 24–26px. Four connected chevron steps span the workspace. The inspector uses about 24% of the desktop width, with a 12px viewer gap. Controls have 4px corners. The microscopy canvas and meaningful controls occupy the main frame.

The old `style2.css` is preserved for comparison but is no longer loaded. `workspace.css` owns the active theme. Existing form controls and IDs were rearranged; the scientific detection and grid algorithms remain the primary implementation. The old JavaScript image-height synchronization was replaced by CSS grid/flex sizing. Native details elements organize the source geometry and core flags; custom metadata fields stay in the main editor. The complete TissUUmaps factory builds both native viewer controls and metadata layout wrappers. Two unchanged Lucide 0.468.0 SVGs supply the header icons, with their ISC/Feather MIT license retained under `vendor/lucide`.

Workflow repairs found through real browser journeys: image controls wait until their handlers are ready; removing a source clears loaded state; a processed segmentation stage can be revisited; tabs keep keyboard focus and ARIA state in sync; Undo/Redo also refresh the original preprocessing input; SVG overlays allow pointer events to reach core controls; the core editor stays within its viewer; Apply and metadata update actions fit their panels; internal `isSelected` state is excluded through the existing metadata filter. The Undo/Redo repair calls the existing author's `preprocessCores` function and introduces no new gridding method.

Differences from the generated drawings are deliberate: retain actual tissue pixels, true image aspect ratio, real values and native enabled/disabled/checkbox states. The 84-core count in the initial illustration is not application data. The public demo produces its actual detections and previews. Secondary detection diagnostics and marker-placement details remain available under Advanced controls. Geometry values keep their full precision when metadata is edited. No generated raster is substituted for a working control, slide image or core preview.

Final verification and precise unverified paths are recorded in `VALIDATION.md` after browser review.

## Nielsen follow-up

The usability pass reused the existing history, core-edit and metadata controllers. Host adaptations add action availability, discard protection, native form submission and keyboard-operable preview buttons, inline validation/status, and accessibility labels. Internal detection methods and export keys remain unchanged; the interface calls inferred detections “Inferred core” and placeholders “Missing cores”. The detailed ten-heuristic mapping, findings, evidence and pinned browser-only axe-core 4.14.0 check are in `NIELSEN-AUDIT.md`.

Native full-screen editing handoff uses the pinned OpenSeadragon 4.1.0 `setFullScreen`, `setFullPage` and `full-screen` event behavior from the author’s `src/viewer.js`. The existing editor nodes retain their references while the native viewer detaches surrounding DOM, then editing returns to the workspace. Core-preview images use `object-fit: contain` so fitted table cells do not stretch tissue morphology. These are host integration fixes, not replacements for the native viewer controller or image data.
