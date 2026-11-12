# Nielsen usability review

Reviewed November 11, 2026 against [Jakob Nielsen's ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/). This is an expert review and browser verification, not a user study or a claim that every possible usability problem has been eliminated.

The scope is the complete existing workflow: local/URL/Box entry, segmentation, grid review, core editing, metadata editing and export. The [eight generated targets and working screenshots](comparison.html) remain the visual reference. Changes preserve the original scientific processing and native OpenSeadragon controller.

Skills used: dogfood for exploration/evidence; webapp-testing for real browser journeys; ui-ux-pro-max and web-design-guidelines for interaction/accessibility review; systematic-debugging, test-driven-development and verification-before-completion for repairs; humanizer for interface copy. The dogfood skill's `agent-browser` binary was unavailable, so Playwright supplied browser interactions, screenshots and recordings. These repairs use the existing application controllers; no replacement editor or scientific method was introduced.

## Review of all ten heuristics

| # | Review focus | Implemented behavior and evidence |
|---|---|---|
| 1 | Feedback | Current workflow step and source remain visible. Processing has live status panels. Metadata shows unsaved/saved/error messages; saved means browser-session data, with a reminder to download a copy. |
| 2 | Domain language | Controls use Open image, Segment cores, Review grid, Row, Column, Annotations and Missing core. Internal field keys retain export compatibility while their labels use readable terms. |
| 3 | Exit and recovery | Back navigation, Fit slide, Undo/Redo, explicit close controls and Escape provide exits. Unsaved core/metadata changes require a deliberate discard. Source removal clears downstream state. |
| 4 | Consistency | One typography/color/spacing system covers all eight screens. Native buttons, tabs, details, form submission and viewer controls retain browser conventions. |
| 5 | Prevent mistakes | Unavailable steps/history actions are disabled. Removal requires confirmation. Text editing cannot invoke viewer deletion. URL validation runs before resetting a working image. Blank geometry and duplicate field names are rejected before mutation. |
| 6 | Visible choices | Labeled image sources, editing tools, issue counts, current-core coordinates and the metadata selection context avoid requiring remembered commands. Advanced fields remain available through labeled disclosures. |
| 7 | Efficient controls | Source tabs support arrows/Home/End. Core previews are native keyboard-operable buttons. Enter saves core forms; review resolution focuses the next item. Native viewer zoom, Fit and full screen are retained. |
| 8 | Focused layout | The tissue image occupies the main workspace. Parameters sit beside their image; geometry/flags and less common controls use progressive disclosure. Primary actions remain visible at desktop sizes. |
| 9 | Actionable errors | URL and metadata failures identify what to fix. Invalid metadata fields receive focus. A dirty-form download explains how to include pending edits. Error text supplements color. |
| 10 | Contextual help | Help opens instructions for the active stage; Tutorial remains in the header. Help can be dismissed with Escape and returns focus to its trigger. Tooltips are available on hover/focus. |

## Findings and repairs

Severity labels describe the observed impact: high for potential loss/corruption of work, medium for a substantial interaction obstacle, low for minor friction. Every item below was addressed; they are not open issues.

| Finding | Severity | Repair / verification |
|---|---|---|
| Selecting another core silently discarded metadata text; downloads could omit uncommitted edits. | High | Dirty state protects selection/navigation/reload and blocks JSON/CSV until Update Metadata. Browser checks decline a discard, preserve text, save, reopen and read the downloaded files. |
| Update Metadata gave no success feedback. | Medium | Live inline saved/unsaved/error feedback and an explicit download reminder. Saved custom fields become canonical inputs for subsequent edits. |
| Grid removal was immediate, and viewer deletion shortcuts were not scoped away from text controls. | High | Removal confirmation and an editable-target shortcut guard. Tests cancel removal and use Backspace inside annotations without changing the core count. |
| Empty geometry values and colliding custom-field names could enter saved data. | High | Validate before modifying state; focus the error; retain full numeric precision. Tests reject a blank radius/row and a new field named `x`, then recover and export correctly. |
| Undo/Redo appeared available with no applicable history; detection refresh did not reset the private history cursor. | Low | Controls derive from the existing history cursor, and successful re-detection resets both history and cursor together. Tests cover add/undo/redo/undo and grid preprocessing counts. |
| Escape did not close Help or a core editor opened by double-click. | Medium | Explicit Escape handlers, visible close controls, and focus restoration. Unsaved core edits remain protected on close. |
| Core previews required a pointer; Enter in the core form did not provide a reliable save action. | Medium | Native preview buttons with selection state; a native submit button and the existing save controller. Tests select with Enter and save from a numeric input with Enter. |
| Invalid URL input reset an already loaded image before validation. | High | Check the URL first, report a nearby error and retain the working image. The local-file journey checks this recovery path. |
| Automated accessibility review found a brand-label mismatch, 208 preview images without alternatives, a 3.48:1 selection-context text contrast, and low contrast during the active-step background transition. | Medium | Use the visible brand name, descriptive preview alternatives and the darker shared text token. Stage colors switch together without a contrast flash. The final eight-state scan reports zero violations for the selected WCAG A/AA rule tags. |
| Opening a core editor from the native full-page viewer failed because surrounding form controls were temporarily detached. | High | Restore the workspace through the native viewer controller before opening the existing editor, retaining references to detached editor nodes and aligning native browser fullscreen state. A failing browser regression reproduced the problem; the repaired journey enters full screen, opens a core, returns to the workspace and closes the editor. |

## Evidence and reproduction

`tests/test_workspace.py` exercises the repaired interactions with a real Hamamatsu TIFF, actual segmentation/grid state, 208 real previews and real JSON/CSV downloads. It also checks local image removal and invalid-URL recovery. `tests/audit_workspace.py` captures the manual audit sequence and runs a pinned axe-core 4.14.0 engine in the test browser only.

The [evidence folder](nielsen-evidence/) retains before/after screenshots, `nielsen-before.webm` / `nielsen-after.webm` recordings, captured discard messages and machine-readable accessibility results. To reproduce the original observed metadata loss: load the sample, continue through segmentation and grid review, select the first preview, type an annotation without Update Metadata, select a second preview and return. The original form was empty; the repaired interface offers a discard decision and retains the text when Cancel is chosen. `metadata-edit-before.png` / `metadata-before.png` and `metadata-edit-after.png` / `metadata-after.png` capture those states. Help and history have corresponding before/after captures.

The initial accessibility results are in `accessibility-before-fixes.json`; final results are in `accessibility.json`. axe-core was selected through its npm metadata and [author's repository](https://github.com/dequelabs/axe-core): version 4.14.0, MPL-2.0, injected from a pinned CDN URL. No axe runtime is shipped in the application. This supplements keyboard, viewport and visual checks; it does not establish complete accessibility conformance. The engine also records checks requiring manual review.

Responsive checks cover 375, 390, 768, 1024, 1440, 1568 and 1920 pixels, plus 844 × 390 phone landscape. Precise run results and remaining integration limits are in [VALIDATION.md](VALIDATION.md). Authenticated Box access, optional metadata-file formats, core-image directory export, physical touch and another browser engine remain unverified.
