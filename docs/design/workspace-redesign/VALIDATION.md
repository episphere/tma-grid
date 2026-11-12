# Workspace validation, November 11, 2026

The final browser run passed all 3 tests in 44.244 seconds. The tests use the running application and real browser events, with the public Hamamatsu TIFF and the repository's tracked local TMA PNG. No provider, image-loading, segmentation or download response was mocked.

Run the app with `python -m http.server 8000`, install `requirements-dev.txt`, then run:

```powershell
$env:TMA_EVIDENCE_DIR = Join-Path (Get-Location) 'docs\design\workspace-redesign\evidence'
python -m unittest discover -s tests -v
```

The default browser is Microsoft Edge. `TMA_BASE_URL` and `TMA_BROWSER_CHANNEL` can override the local URL and installed Chromium channel.

## Screen comparison

The [comparison page](comparison.html) pairs all eight generated targets with actual working screens. Both sides are 1568 × 1003. `screen-manifest.json` records the files and viewport; `PROMPT-RECORD.json` records the generation specification. The initial concept remains in `concept.png`.

| Screen | Generated target | Working screenshot |
|---|---|---|
| Local image input | `targets/01-open-local.png` | `evidence/integrated-open-1568.png` |
| Image URL input | `targets/02-open-url.png` | `evidence/integrated-open-url-1568.png` |
| Box before connection | `targets/03-open-box.png` | `evidence/integrated-open-box-1568.png` |
| Segmentation | `targets/04-segmentation.png` | `evidence/integrated-segment-1568.png` |
| Grid review | `targets/05-grid-review.png` | `evidence/integrated-grid-1568.png` |
| Core editor | `targets/06-core-editor.png` | `evidence/integrated-core-editor-1568.png` |
| Export | `targets/07-export.png` | `evidence/integrated-export-1568.png` |
| Selected-core metadata | `targets/08-export-selected.png` | `evidence/integrated-export-selected-1568.png` |

The rendered screens were reviewed against the targets for header and workflow geometry, image/source/inspector proportions, typography, field arrangement, action visibility, borders, colors and empty states. Adjustments included the full-width chevrons, larger type, wider inspectors, paired range readouts, inline area fields, a fully visible core editor, and grouped metadata. The gridding Apply action and metadata Update action have explicit viewport checks.

The application keeps actual tissue pixels, the true slide aspect ratio, precise numeric values and native control states. Generated tissue drawings, the initial illustration's 84-core count, and illustrative enabled/checked states are not substituted into the application. This is a layout and interaction comparison, not a claim of identical raster pixels.

## Browser journeys

- Open Help, dismiss instructions, switch image-source tabs with arrows/Home, verify tab selection, open the mobile menu and close it with Escape.
- Load the real Hamamatsu TIFF; retain its filename across stages; detect 190 cores in this run; add a core, Undo, Redo and Undo; confirm the preprocessing input changes with history; toggle the mask; revisit segmentation from gridding.
- Build 211 grid positions; use native OpenSeadragon zoom, Fit slide and full screen; return to the ordinary viewer; open a core editor, verify it stays within the image panel, save an annotation, reopen it, restore it and close the editor.
- Load all 208 real core previews; select a core; expand and close Source geometry and Core flags; keep Update Metadata visible; add and save a custom metadata field; download and read JSON and CSV. Verify geometry and core flags are preserved and internal `isSelected` state is absent.
- Choose the tracked local TMA PNG through the real file input, remove it, and verify the loaded source, summary, next-step availability and filename context reset together.

The main screens were checked at widths 375, 390, 768, 1024, 1440, 1568 and 1920 pixels, plus 844 × 390 phone landscape. No horizontal page overflow occurred. At desktop widths, the default main workflows and bottom actions fit within the viewport. Smaller screens use normal page scrolling and collapsible parameter panels. Main-journey JavaScript page errors: zero.

Detection and grid counts are regression observations, not an accuracy benchmark. The WSI client emitted transient low-resolution tile warnings in some runs; the final viewer and all 208 core previews loaded. This pass retains the existing imagebox decoder.

## Nielsen and accessibility follow-up

The [Nielsen audit](NIELSEN-AUDIT.md) maps all ten heuristics to the implemented behavior and records ten findings and their repairs. Browser checks now additionally cover:

- Escape and focus return for Help and the core editor, with protection for unsaved core edits.
- Disabled empty-history actions, text-editing Backspace safety, canceled core removal, a blank-radius error and Enter-to-save without a discard prompt.
- Keyboard selection of core previews; canceled metadata discard when changing cores or navigating back; blocking a download that would omit unsaved changes; visible save confirmation and successful reopening.
- Inline recovery from a blank numeric field and an existing custom-field name, with original geometry and flags retained in downloaded JSON.
- Review-item focus/resolve behavior, including keyboard focus on the next issue.
- Opening a core editor from full screen, restoring the workspace before accessing the editor controls.
- Invalid URL input retaining an already loaded local image.

The browser-only axe-core 4.14.0 scan reported zero violations in all eight states for the selected WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags. Results and checks requiring manual review are retained in `nielsen-evidence/accessibility.json`. This is automated evidence alongside interaction/visual checks, not full accessibility certification. The testing engine is not loaded by the application.

## Source and static checks

- `node --check` passed for `app.js`, `workspace.js`, `main2.js`, `drawCanvas.js` and `UI.js`.
- `git diff --check` passed.
- All original workflow IDs remain; only the obsolete decorative `footerYear` ID was removed. No duplicate static IDs or missing local image/script/style references were found.
- The vendored TissUUmaps DOM factory matches the pinned upstream file byte for byte: SHA-256 `c03099c05af0142046538b1892365debe0628bf0c0a07bdd9b8c960874334dc3`.
- This is a static application; there is no production bundler/build command. The existing scientific dependencies and model files are retained.

## Limits

Box was checked in its disconnected UI state; authenticated Box access was not exercised. Actual core-image file export, browser directory permissions, optional metadata-file import formats, physical touch devices and a second browser engine were not exercised in this pass. JSON/CSV downloads and the real core preview requests were exercised.
