# Original-image center and radius refinement

Date: November 12, 2026. Baseline release: `fc1abcaf2d8f54e55679cd280affa46068b2831c`. Browser: headless Microsoft Edge on Windows, driven by Playwright 1.65.1. The application uses its existing OpenCV 4.9.0 and TensorFlow.js 4.14.0 runtimes and unchanged neural model.

## Change

The previous final circle fit used the thresholded 512-pixel neural mask, scaled back to a padded 1024-pixel training canvas. A coarse or incomplete mask could bias both center and radius even when the underlying tissue boundary was visible.

The new step fits native OpenCV contour envelopes and gradient Hough circles to the original preview pixels. Qualified contour fits take priority, with Hough candidates for fragmented boundaries. Association and size bounds keep neighboring detections distinct. Fits with insufficient evidence retain the previous geometry. This step preserves detection count, model probabilities, thresholded mask, manual editing and export coordinates. It does not recover every missing core or retrain the segmentation model.

Implementation: `javascript/core_geometry.js`, called after final tissue filtering in `javascript/core_detection.js`. [Method selection and source provenance](REUSE-AUDIT.md).

## Known-geometry measurements

Six synthetic images contain 25 specified cores. Their original images are drawn at 1024 × 512; controlled probability masks are drawn at 512 × 512 with a shifted center and reduced radius, matching the application's training-coordinate mapping. The actual browser postprocessing pipeline processes those tensors. These fixtures isolate geometry fitting; they do not measure the neural model's detection accuracy.

Cases: shifted/incomplete masks; radii 16–28 pixels; missing quarter and internal hole; split fragments; pale tissue; nearby cores. Each must retain the specified number of distinct detections and stay within two preview pixels of the exact center and radius. A separate blank-image check requires unchanged geometry. The six geometry checks failed against the unchanged application before implementation.

| Error on 25 synthetic cores | Before | After |
|---|---:|---:|
| Mean center distance | 5.831 px | 0.707 px |
| Maximum center distance | 5.831 px | 0.707 px |
| Mean absolute radius error | 4.554 px | 0.405 px |
| Maximum absolute radius error | 6.651 px | 0.490 px |

Exact fixtures, outputs and per-core errors: [synthetic-results.json](synthetic-results.json). These dependent, deliberately constructed fixtures support a regression claim only. They are not an estimate of real-slide or clinical performance.

## Actual slide checks

The unchanged application and final implementation loaded each source through the actual sample, local-file or URL interaction path and ran the real neural model. Preview pixel bytes match exactly between each before/after pair. Matching images, settings, coordinates, preview SHA-256 hashes and diagnostics are retained in [slide-results.json](slide-results.json). The [comparison page](comparison.html) applies one SVG drawing style to both sets of application coordinates, excluding the neural mask so the circle boundaries are visible.

| Preview | Detections before / after | Accepted image fits | Retained estimates | Added fitting time |
|---|---:|---:|---:|---:|
| Public Hamamatsu H&E, 1024 × 734 | 190 / 190 | 185 | 5 | 67 ms |
| Repository H&E, 1024 × 923 | 60 / 60 | 59 | 1 | 58 ms |
| Public PTEN IHC, 1024 × 764 | 143 / 143 | 80 | 63 | 56 ms |

Times are individual local observations for the added geometry step, not an end-to-end benchmark or performance guarantee. Accepted-fit counts describe behavior and do not establish accuracy. Visual inspection found tighter and better centered circles on the H&E examples; the IHC example retained more estimates where original-image boundaries were weak or fragmented.

Eight approximate center/radius references on the public H&E preview guard against fictitious oversized circles between neighboring cores. They have about two pixels of visual annotation uncertainty, so the regression allows four pixels: two for reference uncertainty and two for fitting error. They are engineering references, not clinical ground truth. The synthetic tests retain their stricter two-pixel bound.

The user's attached screenshot informed the failure investigation but is not included in this public evidence. No identity between that attachment and a public source is assumed.

## Browser regression result

Command, with a local HTTP server on port 8000 and Playwright available:

```powershell
python -m unittest discover -s tests -v
```

Result: **11 tests passed in 73.232 seconds**. This includes eight geometry tests and the three existing workspace journeys. The workspace journeys exercise real sample segmentation, grid generation, native viewer controls, core editing, annotation persistence, metadata JSON/CSV export and source removal. The run opened 208 real core previews. No test fixtures stand in for the real sample model in those workspace journeys.

Optional evidence output for the geometry fixtures:

```powershell
$env:TMA_GEOMETRY_EVIDENCE = 'C:\path\to\evidence'
python -m unittest discover -s tests -p test_core_geometry.py -v
```

`TMA_BASE_URL` selects another served checkout; `TMA_BROWSER_CHANNEL` selects an installed Playwright Chromium channel. The test requires CDN access for the application's existing dependencies. The isolated analysis environment's Python OpenCV 5.0 was used only for exploratory comparisons; all passing browser tests run native OpenCV 4.9.0.

## Remaining limits

The outer boundary of an incomplete tissue fragment does not uniquely identify the original punch center. Severely missing tissue, folds, printed slide markings, overlapping cores and unusually mixed core diameters remain ambiguous. Existing mask detections, including their false positives or omissions, are retained by this step. A circle remains a geometric approximation to irregular tissue.

These three images are convenience engineering checks. Their relationship to model training data is not established, and there is no blinded independent manual annotation set. Sensitivity, precision, clinical accuracy and cross-scanner generalization have not been measured. Authenticated Box, optional metadata-import providers and core-image directory export were not newly tested in this change.
