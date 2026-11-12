# Center and radius detection: reuse and validation

Job: locate the geometric center and outer radius of tissue microarray cores when a neural mask misses tissue or contains holes. Reference products: the existing published TMA-Grid pipeline, QuPath's TMA dearrayer and PRISM.

Required capabilities: automatic centers; individual radii; tolerance of holes/fragments; separation of nearby cores; brightfield H&E/IHC input; the existing static browser runtime; bounded processing time. The current model, source formats, manual edits and export coordinate system must be retained.

Skills: systematic-debugging and root-cause-tracing, test-driven-development, verification-before-completion, webapp-testing, scientific-critical-thinking, paper-lookup and humanizer. This is a Level 2 method change. Engineering image/geometry checks are distinct from clinical validation; individual cores within one image do not establish independent replication.

## Search and sources

Code phrases included `tissue microarray core detection center radius`, `QuPath open source alternative dearrayer`, `Hough circle gradient detection`, `GitHub histology dearraying`, and `robust circle fitting segmentation`. Installed skills and the project's existing OpenCV/TensorFlow runtimes were inspected first. PyPI metadata for OpenCV, scikit-image, scipy and dearrayer, npm/OpenCV.js documentation, direct author repositories, GitHub topics/directory searches and firsthand QuPath discussions were checked. General OpenAlternative/opensourcealternative/LibHunt results did not establish a more suitable browser geometry component; F-Droid does not apply.

Three qualified GitHub API searches used `in:name,description,readme`, `stars:>100`, `pushed:>2025-11-12`, domain topics, Python/C++, MIT/Apache licensing and `archived:false`, with stars and updated-date sorting. A broader `dearraying` query was also attempted. All four returned HTTP 403 rate-limit errors, not empty results. Direct repository metadata and source clones remained accessible. Exact queries/responses are retained in the task scratch folder's `code-search.json`.

The literature lookup used Europe PMC's bounded paginator: `TITLE:"tissue microarray" AND (de-arraying OR dearraying OR "core detection")`, plus targeted searches for center/radius detection, geometric restoration, Hough methods, authors' implementations and preprints. Relevant primary sources:

- [TMA-Grid, BMC Bioinformatics, 2026](https://doi.org/10.1186/s12859-026-06638-2), with this repository as the author's implementation. This is the complete working baseline; the 2024 arXiv version is superseded by the journal article.
- [Azar et al., geometric restoration, Analytical Cellular Pathology, 2012](https://doi.org/10.3233/ACP-2012-0067), with a [2013 correction](https://pmc.ncbi.nlm.nih.gov/articles/PMC4605670/). Relevant morphology/circular-envelope approach; an accessible licensed author implementation was not established, so it is not represented as directly reused code.
- [ATMAD, BMC Bioinformatics, 2018](https://doi.org/10.1186/s12859-018-2111-8), a state-of-the-art review within a primary methods paper, using detection followed by ellipse-based localization. Its reported dearraying results are not radius-error validation for this browser app; its desktop/source constraints prevent direct adoption here.
- [PRISM, NAR Genomics and Bioinformatics, 2025](https://doi.org/10.1093/nargab/lqaf114), with [MIT-licensed author source](https://github.com/clinicalomx/napari-prism). It is aimed at multiplex fluorescence; its difference-of-Gaussian center detector is an executable comparator, not evidence of brightfield accuracy.
- The preprint search also found STiLE's spatial-transcriptomics work and unrelated whole-slide segmentation methods. STiLE has a journal version (10.1093/bioinformatics/btag572), but operates on cell coordinates rather than the image pixels available here. It is excluded by input shape.
- [OpenCV 4.9 Hough-circle implementation and tutorial](https://docs.opencv.org/4.9.0/d4/d70/tutorial_hough_circle.html): the existing native image-processing engine directly supplies gradient-based center/radius fitting. The algorithm is reused through its public API; no Hough transform is reimplemented.

## Candidate audit

Repository metadata checked November 12, 2026. Counts indicate activity, not methodological validation.

| Candidate | Fit / constraints | Stars; last push | License | Execution / decision |
|---|---|---|---|---|
| Existing TMA-Grid | Complete current workflow and model; binary-mask boundary limitation | Existing local author source at `fc1abcaf2d8f54e55679cd280affa46068b2831c` | MIT | Run unchanged first; preserve as the scientific baseline and host. |
| OpenCV | Native circle fitting, existing browser runtime; requires association with existing detections and fallback | 91,545; 2026-11-11 | Apache-2.0 | Adopt existing pinned 4.9.0 browser engine, with a small host adapter. No new production runtime. |
| PRISM | Brightfield adaptation and browser host missing; source is suitable for a comparison | 15; 2026-11-09 | MIT | Clone pinned `84a9ad5cedd2b871ee1abcd1aaf82bef5a3ace3a`; run unchanged author `estimate_rotation` / `detect_blobs` methods in a minimal image context. Full napari/SpatialData application not run. |
| bozeklab/dearrayer | Hough-based TMA processing; Python and GPL are incompatible with direct inclusion in this MIT browser application | 4; 2025-08-08 | GPL-3.0 (license file; API reports NOASSERTION) | Source inspected; no GPL code copied. Full app not run. |
| QuPath | Mature dearraying, supplied diameter; Java desktop stack and GPL | 1,477; 2026-11-11 | GPL-3.0 | Task-flow/method reference only; no code copied or desktop integration claimed. |

Raw API metadata and unchanged clones are in `C:/Users/Aaron Ge/.codex/scratch/tma-grid-core-geometry-20261112`. The candidate comparison adds no credentials, service, model training or external data transmission. Existing repository labels have uncertain annotation provenance and will not be treated as independent ground truth.

## Baseline and hypothesis

The unchanged application detects 190 cores on the public Hamamatsu TIFF and 60 on the repository's other TMA PNG. The baseline records include the original preview, rendered circles, model probabilities/mask, geometry and diagnostics. The model uses a padded 1024-pixel training canvas resized to 512 pixels; the current minimum enclosing circles are fitted to that model mask, then scaled back to the image. Original-image Otsu evidence currently only rescues missing detections.

Hypothesis: mask omissions and the coarse mask boundary bias the fitted center and radius. A fitting step using original preview pixels can improve geometry while retaining existing core identities and falling back when image evidence is inadequate.

Smoke comparisons on the public sample: unchanged PRISM methods found 188 blobs (zero estimated rotation); OpenCV's native whole-image gradient Hough method found 188 circles with one tested setting, with 185 matching existing core neighborhoods. This is a smoke test, not a detection-accuracy result. The native result's median radius was 17.4 preview pixels, versus larger circles from the neural mask. Visual comparison supports further testing.

## Adopted implementation and adaptations

The complete existing TMA-Grid pipeline remains the host. Its pre-change `core_detection.js` is byte-identical between the unchanged baseline checkout at `f7ed551645f52f51dbe0c11e9e97d3c88ed90035` and release `fc1abcaf2d8f54e55679cd280affa46068b2831c` (Git blob `a16b5b5f1f3bfc4c8a16db6b0171c829c4ee1ece`). Original-image refinement runs after its final tissue filtering, in preview-image coordinates.

Native source reused through the existing `@techstark/opencv-js@4.9.0-release.2` runtime:

- `cv.HoughCircles(..., cv.HOUGH_GRADIENT, ...)`, authored in OpenCV's [modules/imgproc/src/hough.cpp](https://github.com/opencv/opencv/blob/4.9.0/modules/imgproc/src/hough.cpp).
- `cv.minEnclosingCircle`, authored in [modules/imgproc/src/shapedescr.cpp](https://github.com/opencv/opencv/blob/4.9.0/modules/imgproc/src/shapedescr.cpp), with the native threshold, contour, color and blur APIs. [Shape API documentation](https://docs.opencv.org/4.9.0/d3/dc0/group__imgproc__shape.html).
- Runtime URL remains `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.2/dist/opencv.min.js`. No upstream implementation was modified. The original Apache-2.0 license is retained at `vendor/opencv/LICENSE`.

The uncovered integration work is `javascript/core_geometry.js`: original-preview conversion, candidate association with the existing core identities, acceptance bounds, memory disposal and fallback diagnostics. It combines original-image saturation/gray Otsu contours with whole-image gradient Hough circles. Qualified contour envelopes are preferred; Hough supplies an alternative for fragmented contours. Each candidate belongs to exactly one nearest existing core. A component containing multiple existing centers is excluded, and shifts/radii are bounded against the seed and image-derived typical radius. Intact contour fits preserve individual sizes. A half-pixel radius allowance accounts for the raster boundary.

A local-crop Hough prototype passed simple synthetic tests but fitted fictitious large circles between real neighboring cores. It was rejected by the actual sample regression. Whole-image Hough alone retained some biased estimates; the qualified original-image contour envelopes cover that gap. These are documented host adaptations to the native geometric methods, not a reproduction of the whole Azar or PRISM pipeline. The contour/size/association thresholds are engineering settings verified on the fixtures below, with no clinical calibration claimed.

The model probabilities and binary mask are untouched. No cores are added or removed by this refinement step. An ambiguous fit, blank image or native processing failure retains the prior geometry. The PRISM comparator was executed unchanged in isolation and was not integrated because it lacks this brightfield/browser geometry flow. The full author application was not run. GPL dearrayers were not copied.

## Verification and limits

Known-geometry tests were written before implementation and failed against the unchanged application. They exercise controlled incomplete probability masks through the real browser postprocessing pipeline, then measure center/radius error against exact synthetic geometry. Tests cover shifted masks, variable radii, holes, missing tissue, split fragments, nearby cores, pale tissue and blank-image fallback. An additional real-sample test uses eight approximate visual references, explicitly labeled with about two pixels of annotation uncertainty.

All eight geometry tests and three existing segmentation/grid/edit/export journeys pass. Same-pixel before/after evidence and scoped metrics are in [VALIDATION.md](VALIDATION.md), [comparison.html](comparison.html), and the accompanying JSON records. Three real slide checks support engineering review, not independent clinical validation or general detection sensitivity. The count of accepted fits is not an accuracy score.
