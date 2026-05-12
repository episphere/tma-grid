# Revised Methods and Results Sections

## Methods

Similar to previous literature, we split the de-arraying problem into two major computational stages: (1) tissue segmentation and core detection, in which tissue cores are separated from the slide background and non-core artifacts are removed, and (2) grid estimation, in which detected cores are assigned to their expected row and column positions while accounting for missing, damaged, misaligned, or off-grid cores. TMA-Grid implements these stages as a client-side web workflow. The application runs in a modern browser, uses TensorFlow.js for neural network inference, OpenCV.js for image processing, OpenSeadragon for interactive image viewing, and ImageBox3 for on-demand traversal and export of whole slide image (WSI) regions.

### Dataset Generation

For model development, we selected 119 TMA whole slide images from the Polish Breast Cancer Study (PBCS) (Garcia-Closas et al., 2007) and 2 prostate cancer TMA whole slide images from Harvard Dataverse (Zhong et al., 2017). These images included multiple staining conditions, including BCL2, CD163, CK56, EGFR, H&E, and HER2. Each WSI was downsampled to 512 x 512 pixels for segmentation-model training. This resolution preserved the global spatial arrangement of the array while enabling fast in-browser inference.

We manually annotated the approximate centroid of each tissue core in image coordinates and used a uniform radius to generate circular binary masks. This annotation strategy was intentionally designed to train the model to predict the intended location of tissue cores rather than the exact irregular tissue boundary. This is important for damaged, fragmented, or partially missing cores, which should generally remain associated with a single array position rather than be interpreted as multiple independent samples.

To improve generalization, we used the Albumentations library (Buslaev et al., 2020) to generate 20 augmented versions of each original image. Augmentations included random flipping, rotation up to +/- 45 degrees, affine transformation, Gaussian blur, and simulated fog. This produced 2,420 augmented PNG images and corresponding 512 x 512 binary masks. The original 121 images were reserved for testing and validation to provide an unbiased evaluation of model performance.

### Training the Segmentation Model

We used TensorFlow.js to implement a U-Net-style convolutional neural network for pixel-wise tissue segmentation. The model follows the standard contracting and expansive U-Net structure (Ronneberger et al., 2015), but replaces regular convolutional blocks with separable convolutional blocks to reduce model size and improve browser performance. Batch normalization and dropout were added to improve training stability and regularization. The model uses ReLU activations in the contracting and expansive paths, max pooling for downsampling, upsampling and concatenation in the expansive path, and a final convolutional layer to generate a 512 x 512 probability mask.

Because the training masks are sparse relative to the background, the model was trained with weighted binary cross-entropy loss. The trained model was evaluated on a held-out test set of 12 TMA whole slide images. Performance metrics included loss, area under the receiver operating characteristic curve (AUC), accuracy, precision, and recall (Table 1). The segmentation model is distributed with the TMA-Grid source code and is loaded directly by the web application at runtime.

| Loss | AUC | Accuracy | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.224 | 0.981 | 0.919 | 0.818 | 0.947 |

**Table 1.** Segmentation model performance on a held-out test set. The model demonstrated strong discrimination between tissue and background, with an AUC of 0.981.

### Core Detection

After neural network inference, TMA-Grid converts the predicted probability mask into candidate core detections through a sequence of image-processing and geometry-based post-processing steps. Users control the probability cutoff through a sensitivity parameter. The thresholded mask is converted to an OpenCV.js matrix and processed with morphology, distance transform, connected-component analysis, and watershed segmentation.

First, the binary mask is cleaned with morphological opening and dilation. Small gaps and holes within predicted tissue regions are identified by comparing the opened and dilated masks. Candidate holes are labeled and measured, and small holes are filled to prevent a damaged or torn core from being interpreted as multiple distinct objects. A distance transform is then computed from the cleaned binary mask, and high-confidence foreground markers are extracted using a user-adjustable distance-transform multiplier. These markers are passed to a watershed procedure to separate neighboring tissue regions.

Connected components are then measured and converted into candidate core properties, including centroid, area, and approximate radius. Candidates outside user-specified minimum and maximum area thresholds are removed. This area filtering remains adjustable through the interface because TMA core size, scan magnification, and downsampled image dimensions can vary between studies.

The current version of TMA-Grid adds several post-processing safeguards to improve robustness beyond simple watershed-based detection. The detector estimates a typical core radius and core spacing from the current candidate set, then uses these estimates to remove likely non-core artifacts and to recover plausible missed cores. Artifact filtering removes isolated or bridge-like detections that are inconsistent with the expected TMA geometry. This reduces false positives from non-tissue objects, scale-bar markings, text, debris, and small mask fragments without relying on stain-specific color rules. This design helps maintain stain robustness across H&E, immunohistochemical, and other staining conditions.

To improve sensitivity, TMA-Grid also applies rescue steps for weak, damaged, fragmented, or partially missing cores. Components in the segmentation mask that are compatible with expected core size and spacing, but were not retained by the primary watershed pass, can be added back as rescued detections. A relaxed distance-transform pass is used to recover lower-confidence cores when the primary distance-transform threshold is too conservative. Conversely, crowded bridge filtering prevents small artifacts between adjacent cores from creating extra detections. For large merged components, TMA-Grid can infer multiple expected core positions only when the component geometry and local spacing strongly support splitting. This reduces the risk of over-splitting cores that are torn, connected, or poorly separated.

Finally, asymmetric or damaged detections can be recentered using nearby mask geometry. The interface reports detection diagnostics to the user, including the number of detected cores, rescued cores, removed artifacts, and recentered detections. Users can choose segmentation presets for common scenarios, including default, dense, sparse, damaged, and noisy arrays, and can manually add, remove, or inspect detections before proceeding to grid estimation.

### WSI Handling and Browser-Based Execution

TMA-Grid is designed as a zero-footprint application: the user accesses the tool through a browser, and the computation runs client-side without requiring software installation. For regular image files, the browser can load and process the image directly. For WSI and GeoTIFF-style images, TMA-Grid uses ImageBox3 to retrieve only the image regions needed for visualization, segmentation, gridding, and export. The segmentation step operates on a downsampled representation of the slide, whereas the gridding and export steps can request full-resolution regions corresponding to each core.

Interactive WSI viewing is provided through an ImageBox3-backed OpenSeadragon tile source. Rather than relying on a separate server-side tile service, the application requests tile regions directly from ImageBox3 in the browser. Tile coordinates are clamped to valid image bounds, and failed tile requests are handled gracefully so that transient tile errors do not interrupt the workflow. This design preserves full-resolution interaction and export while maintaining the zero-footprint deployment model.

### Gridding Algorithm

Once the user accepts or edits the detected core centroids, TMA-Grid estimates the TMA row and column grid. The gridding algorithm combines Delaunay triangulation, a traveling row-building procedure, image-rotation estimation, and post-processing steps for missing, misaligned, and marker cores.

#### Delaunay Triangulation-Based Segment Generation

To impose a two-dimensional grid on the detected centroids, TMA-Grid first estimates local row-wise connections. We modified the Delaunay triangulation-based approach described by Wang et al. (2011). Candidate edges are generated by triangulating the detected centroids, then filtered by length and angle. Unlike the original interquartile range (IQR)-based filter, which removes both unusually long and unusually short edges, TMA-Grid primarily removes overly long edges. We found that filtering out short edges can incorrectly remove valid row connections when cores are tightly packed.

Angle filtering is performed relative to the estimated image rotation. Instead of using k-means clustering to assign edges into canonical angular groups, TMA-Grid applies a direct threshold around the row direction. This simpler criterion performed better for distorted or imperfectly aligned arrays and is easier for users to understand and adjust. After length and angle filtering, an edge-cleaning step ensures that each point is connected to at most two neighbors in a row, selecting the nearest valid neighbor on each side when more than two edges are present. The output of this stage is a set of row-like segments and isolated points.

#### Traveling Row-Building Algorithm

The traveling algorithm iteratively builds complete rows from the segmented points. Each point is assigned a start point and an endpoint. For a point on a segment, the endpoint is the immediate neighbor to its right in the same segment; for an isolated point, the start point and endpoint are the point itself. Coordinates are adjusted for image rotation before row assignment so that the apparent slide orientation does not distort row and column inference.

At each iteration, the algorithm selects the remaining point with the smallest rotated horizontal coordinate as the beginning of a new row. It then searches for a point whose start point matches the endpoint of the current point. If such a point exists, it is added to the row. If no directly connected point is found, the algorithm searches within a circular region centered on the expected endpoint. The search radius is defined by a user-adjustable multiplier applied to the median inter-core distance. When multiple candidates are found, the closest candidate is selected.

If no appropriate real core is found, the algorithm inserts an imaginary core to preserve row continuity. Imaginary cores represent expected but missing array positions. The expected location of an imaginary core is computed from the last row endpoint and the estimated image rotation. This process continues until a real core is found or the row reaches the expected image boundary, as defined by image width and a user-adjustable stopping-distance parameter. The completed rows are sorted by their rotated vertical coordinates, and missing positions at row beginnings can be imputed backward to improve column alignment.

#### Marker Cores, Off-Grid Cores, and Lattice Refinement

Many TMAs include marker cores or guide cores that intentionally do not belong to the main sample lattice. Earlier approaches to row and column assignment can fail when these marker cores are interpreted as the first row or column, shifting the entire main grid. The current TMA-Grid implementation explicitly separates marker-core handling from main-lattice estimation.

After an initial row and column assignment, TMA-Grid identifies potentially misaligned cores and marker cores by comparing each core's position to the median position of nearby rows and columns. Marker candidates that are spatially off-grid are retained visually but excluded from the dominant row/column lattice. This prevents off-grid marker cores from forcing the main array to begin at an incorrect column or row. When surrounding row and column evidence is sufficient, marker cores can be automatically assigned to the nearest plausible grid location. When the evidence is insufficient, the marker is kept separate and reported to the user for review rather than disrupting the main grid.

TMA-Grid also applies an affine lattice refinement step to improve row and column consistency for the main array. The lattice model is fit using non-marker, non-imaginary cores, and proposed assignments are accepted only when the residual error is small relative to the core radius and when the assignment does not create duplicate row/column positions. This refinement is intentionally conservative: its purpose is to correct small row/column inconsistencies without overriding the user's manual edits or forcing off-grid markers into the main lattice.

#### Post-Processing and Review

After row generation and marker handling, TMA-Grid refines the output through several post-processing steps. Cores are reassigned to the closest column using a weighted distance to column medians, with a penalty for sparsely populated columns. This makes it less likely that a single misaligned core or artifact creates a new column. Columns and rows predominantly composed of imaginary cores are removed when they are likely to represent gaps between sectors rather than true sample positions. Row and column indices are then reassigned to be consecutive and unique.

The application then flags cores that may require user attention. These include unresolved marker cores, off-grid markers, and cores that remain misaligned after automatic assignment. Flagged issues are displayed in a compact review queue. Users can focus on an issue, inspect the corresponding core, make manual adjustments, and resolve the item. Importantly, imaginary cores are not automatically treated as errors, because empty array positions are common in TMA design and can be valid features of the TMA map.

### Virtual Grid, Metadata Editing, and Export

After gridding, TMA-Grid generates an idealized virtual grid. For WSI and GeoTIFF inputs, each preview cell is generated by requesting the corresponding core region from ImageBox3 on demand. Region requests are clamped to image bounds, and failed preview requests are represented by placeholder cells rather than preventing the grid from rendering. This allows users to continue metadata validation even if a small number of WSI region requests fail transiently.

The virtual grid supports core-level metadata review and editing. Users can load or create metadata fields, edit attributes for individual cores, and export the final de-arraying table as JSON or CSV. For compatible WSI and GeoTIFF inputs, users can also export full-resolution core images individually or in bulk. The export process retrieves the original-resolution image region for each core locally in the browser, preserving image fidelity while avoiding server-side patch extraction.

## Results

TMA-Grid provides an end-to-end web workflow for de-arraying TMA whole slide images. The application supports image input, neural-network-based tissue segmentation, interactive core correction, row/column grid estimation, marker-core review, virtual-grid generation, metadata editing, and full-resolution core export. The current interface was redesigned to make these steps clearer and more usable across desktop and mobile devices.

### Application Interface and Workflow

Figure 3 shows the updated TMA-Grid workflow. The application begins with an image input panel where users can load a local image, provide a remote image URL, connect to a Box account, or load a built-in sample image for demonstration. Once an image is loaded, TMA-Grid displays image metadata, export support status, and a preview. The application then guides the user through segmentation, gridding, and final virtual-grid review.

In the segmentation view, users can choose presets for common TMA scenarios, adjust sensitivity and size thresholds, toggle the segmentation mask, and manually add, remove, or inspect detected cores. The interface displays detection diagnostics, including detected cores, rescued cores, removed artifacts, and recentered detections. These diagnostics provide immediate feedback when parameters are changed.

In the gridding view, users can inspect the overlaid row/column assignments on an interactive WSI viewer. The toolbar includes controls for adding cores, zooming, fitting the image, toggling labels, toggling grid lines, and opening gridding parameters. Marker-core placement status and review issues are shown in compact panels. Flagged issues can be focused and resolved without requiring the user to manually scan the entire array.

The final view displays an idealized virtual grid of de-arrayed cores. Users can select a core, edit metadata, add custom fields, export the metadata table, and download core images. For WSI and GeoTIFF-style inputs, the core previews and exports are generated from on-demand full-resolution image regions. If a preview request fails, the corresponding cell is shown with a placeholder rather than causing the entire final grid to fail.

**Figure 3.** Updated TMA-Grid web application. (A) Image input panel with support for local files, remote URLs, Box, and a built-in sample image. (B) Core segmentation view with adjustable parameters, segmentation presets, mask visualization, manual editing, and detection diagnostics. (C) Grid estimation view with an interactive WSI viewer, row/column overlays, marker-core handling, compact review queue, and gridding controls. (D) Virtual grid and metadata view, where de-arrayed cores can be reviewed, annotated, exported as JSON/CSV, and downloaded as full-resolution core images when supported by the input format.

### Data Input and WSI Traversal

TMA-Grid can operate on standard image files as well as WSI and GeoTIFF-style images. For large WSI files, the application avoids loading the entire slide into memory. Instead, ImageBox3 is used to retrieve downsampled previews, interactive viewer tiles, and full-resolution regions as needed. This enables TMA-Grid to process multi-gigabyte images in a browser while preserving the zero-footprint architecture.

The current version includes a custom ImageBox3-backed OpenSeadragon tile source for full-resolution WSI interaction. This avoids dependence on a separate tile server and keeps WSI traversal inside the browser session. Tile requests are bounded to valid image coordinates and handled gracefully if a request fails, improving the stability of interactive viewing and export.

### Core Segmentation and Detection

The segmentation model performed well on the held-out test set, with an AUC of 0.981 and recall of 0.947 (Table 1). In the application, the model output is combined with post-processing to convert the predicted mask into core centroids and radii. Compared with earlier versions, the current detection workflow improves practical robustness by adding rescue and artifact-removal logic.

The updated detector is better able to retain damaged cores that are torn, weakly stained, or partially missing. It also reduces false positives from non-core objects by using geometry-based filtering rather than stain-specific color thresholds. When multiple detected candidates are suspiciously close, the algorithm uses spacing and radius estimates to avoid adding extra cores between adjacent cores that are touching or bridged by tissue. The interface exposes these operations through summary statistics so users can see how many cores were detected, rescued, removed as artifacts, or recentered.

### Grid Estimation and Marker-Core Handling

The grid estimation algorithm automatically assigns detected cores to row and column positions while preserving user control. The Delaunay triangulation and traveling algorithm identify the dominant grid structure, insert imaginary cores where expected positions are missing, and remove rows or columns that are likely to represent sector gaps rather than true sample positions.

A major improvement in the current implementation is the handling of marker cores. Off-grid marker cores are no longer allowed to define the first row or first column of the main array. Instead, they are recognized as separate from the main lattice, retained visually, and either automatically assigned when the surrounding lattice provides sufficient evidence or flagged for review when the assignment is ambiguous. This prevents common failure modes in which marker cores shift all main-array columns and cause the sample grid to start at the wrong index.

TMA-Grid also includes conservative lattice refinement. The refinement step uses the dominant main-array structure to correct small row/column inconsistencies, but it excludes off-grid marker cores and rejects assignments that would create duplicate grid positions. This allows TMA-Grid to improve consistency without overfitting to irregular marker positions or overriding the user's intended edits.

### Review Queue and Manual Correction

Because TMA slides can contain manufacturing artifacts, missing samples, off-grid markers, and severe distortions, fully automatic de-arraying cannot be expected to resolve every case. TMA-Grid therefore provides a compact review queue for flagged cases. The review queue lists unresolved marker or row/column issues, allows users to focus the viewer on a flagged core, and lets users resolve issues once they have been inspected or corrected. Imaginary cores are not treated as issues by default, because empty positions may represent valid TMA design.

This review workflow reduces the burden of manual inspection. Rather than requiring users to search the entire array for possible failures, the interface directs attention to the subset of cores most likely to need human judgment.

### Mobile and Responsive Use

The web interface was redesigned to improve usability across desktop and mobile platforms. On smaller screens, toolbars are collapsed behind a "Show tools" control so that the image canvas remains the dominant workspace. Parameter panels open as compact overlays, review controls are condensed, and workflow navigation is horizontally scrollable rather than fixed to the bottom of the screen. These changes preserve the zero-footprint nature of the tool while making the application more practical on phones and tablets.

### Virtual Grid, Metadata Editing, and Export

The virtual grid provides an idealized view of the de-arrayed TMA. Cores are arranged by their inferred row and column positions, and users can select individual cores to inspect or edit metadata. The metadata table can be exported as JSON or CSV. For compatible WSI and GeoTIFF inputs, TMA-Grid can also export full-resolution core images individually or in bulk.

The current implementation improves the reliability of the final grid by making preview generation failure-tolerant. If a WSI region request fails for an individual core, a placeholder cell is rendered and the rest of the grid continues to populate. This is important for large remote images, where transient tile or region errors can otherwise interrupt the entire export workflow.

### Comparison With Existing Tools

Figure 4 compares default de-arraying results from QuPath and TMA-Grid on the same TMA whole slide image. QuPath required manual entry of core diameter and row/column dimensions before grid generation, whereas TMA-Grid automatically estimated segmentation and grid parameters and provided interactive correction tools for remaining edge cases. TMA-Grid's browser-based design also avoids installation and allows operation on remote or cloud-hosted images without requiring server-side patch extraction.

**Figure 4.** Comparison of default de-arraying results using (A) QuPath and (B) TMA-Grid on the same TMA whole slide image. QuPath required manual specification of core diameter and row/column dimensions, whereas TMA-Grid estimated these parameters automatically and provided interactive tools for reviewing and correcting segmentation, marker-core, and gridding results.

