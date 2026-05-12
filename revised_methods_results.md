# Revised Methods and Results Sections

## Methods

Similar to previous literature, we split the de-arraying problem into two major computational stages: (1) tissue segmentation and core detection, in which tissue cores are separated from the slide background and non-core artifacts are removed, and (2) grid estimation, in which detected cores are assigned to their expected row and column positions while accounting for missing, damaged, misaligned, or off-grid cores. TMA-Grid implements these stages as a client-side web workflow. The application runs in a modern browser, uses TensorFlow.js for neural network inference, OpenCV.js for image processing, OpenSeadragon for interactive image viewing, and ImageBox3 for on-demand traversal and export of whole slide image (WSI) regions.

### Dataset Generation

For model development, we selected 119 TMA whole slide images from the Polish Breast Cancer Study (PBCS) (Garcia-Closas et al., 2007) and 2 prostate cancer TMA whole slide images from Harvard Dataverse (Zhong et al., 2017). These images included multiple staining conditions, including BCL2, CD163, CK56, EGFR, H&E, and HER2. Each WSI was downsampled to 512 x 512 pixels for segmentation-model training. This resolution preserved the global spatial arrangement of the array while enabling fast in-browser inference.

We manually annotated the approximate centroid of each tissue core in image coordinates and used a uniform radius to generate circular binary masks. This annotation strategy was intentionally designed to train the model to predict the intended location of tissue cores rather than the exact irregular tissue boundary. This is important for damaged, fragmented, or partially missing cores, which should generally remain associated with a single array position rather than be interpreted as multiple independent samples.

To improve generalization, we used the Albumentations library (Buslaev et al., 2020) to generate 20 augmented versions of each original image. Augmentations included random flipping, rotation up to +/- 45 degrees, affine transformation, Gaussian blur, and simulated fog. This produced 2,420 augmented PNG images and corresponding 512 x 512 binary masks. The original 121 images were reserved for testing and validation to provide an unbiased evaluation of model performance.

### Training the Segmentation Model

We used TensorFlow.js to implement a U-Net-style convolutional neural network for pixel-wise tissue segmentation (Figure 1). The model follows the standard contracting and expansive U-Net structure (Ronneberger et al., 2015), but replaces regular convolutional blocks with separable convolutional blocks to reduce model size and improve browser performance. Batch normalization and dropout were added to improve training stability and regularization. The model uses ReLU activations in the contracting and expansive paths, max pooling for downsampling, upsampling and concatenation in the expansive path, and a final convolutional layer to generate a 512 x 512 probability mask.

**Figure 1.** Segmentation model architecture. The U-Net model uses a contracting path composed of separable convolutional blocks with increasing filter sizes, batch normalization, ReLU activation, max-pooling, and dropout. The expansive path applies upsampling and skip concatenation with corresponding contracting-path layers, followed by a final single-filter convolution that produces the segmentation output.

Because the training masks are sparse relative to the background, the model was trained with weighted binary cross-entropy loss. The trained model was evaluated on a held-out test set of 12 TMA whole slide images. Performance metrics included loss, area under the receiver operating characteristic curve (AUC), accuracy, precision, and recall (Table 1). The segmentation model is distributed with the TMA-Grid source code and is loaded directly by the web application at runtime.

| Loss | AUC | Accuracy | Precision | Recall |
| --- | --- | --- | --- | --- |
| 0.224 | 0.981 | 0.919 | 0.818 | 0.947 |

**Table 1.** Segmentation model performance on a held-out test set. The model demonstrated strong discrimination between tissue and background, with an AUC of 0.981.

### Browser-Based Image Input and WSI Handling

At runtime, the workflow begins with browser-based image loading. Standard image files are loaded directly and downsampled when needed so that the working image fits within a 1024-pixel maximum dimension. For WSI, GeoTIFF-style, and NDPI inputs, TMA-Grid uses ImageBox3 to read image metadata and render a downsampled thumbnail for segmentation. The resulting scaling factor is retained so that coordinates estimated on the working image can be mapped back to the source image for gridding, review, and export.

When the user proceeds from segmentation to grid review, the application initializes an OpenSeadragon viewer. Standard images are displayed as regular image sources. For full-resolution WSI interaction, TMA-Grid creates a custom ImageBox3-backed tile source that requests 512-pixel tile regions on demand. Tile coordinates are clamped to valid image bounds, and failed tile requests are replaced with blank fallback tiles so that transient region errors do not interrupt the workflow. This design avoids loading the entire slide into memory while preserving full-resolution navigation and downstream core export when the source image supports it.

### Core Detection

After image loading, the working image is cropped or padded as needed, resized to 512 x 512 pixels, and passed through the TensorFlow.js segmentation model. Figure 2 shows an example of the model output, with the original WSI-derived image paired with the predicted segmentation mask. TMA-Grid then converts the predicted probability mask into candidate core detections through a sequence of image-processing and geometry-based post-processing steps. Users control the probability cutoff through a sensitivity parameter. The thresholded mask is converted to an OpenCV.js matrix and processed with morphology, distance transform, connected-component analysis, and watershed segmentation.

First, the binary mask is cleaned with morphological opening and dilation. Small gaps and holes within predicted tissue regions are identified by comparing the opened and dilated masks. Candidate holes are labeled and measured, and small holes are filled to prevent a damaged or torn core from being interpreted as multiple distinct objects. A distance transform is then computed from the cleaned binary mask, and high-confidence foreground markers are extracted using a user-adjustable distance-transform multiplier. These markers are passed to a watershed procedure to separate neighboring tissue regions.

Connected components are then measured and converted into candidate core properties, including centroid, area, and approximate radius. Candidates outside user-specified minimum and maximum area thresholds are removed. This area filtering remains adjustable because TMA core size, scan magnification, and downsampled image dimensions can vary between studies.

TMA-Grid adds several post-processing safeguards to improve robustness beyond simple watershed-based detection. The detector estimates a typical core radius and core spacing from the candidate set, then uses these estimates to remove likely non-core artifacts and to recover plausible missed cores. Artifact filtering removes isolated or bridge-like detections that are inconsistent with the expected TMA geometry and applies an adaptive tissue-appearance check to reduce detections dominated by background, digital annotations, text, debris, or small mask fragments. Because this filtering is learned from the appearance distribution of the slide being processed rather than fixed stain-specific thresholds, it can be applied across H&E, immunohistochemical, and other staining conditions.

To improve sensitivity, TMA-Grid also applies rescue steps for weak, damaged, fragmented, or partially missing cores. Components in the segmentation mask that are compatible with expected core size and spacing, but were not retained by the primary watershed pass, can be added back as rescued detections. A relaxed distance-transform pass is used to recover lower-confidence cores when the primary distance-transform threshold is too conservative. Conversely, crowded bridge filtering prevents small artifacts between adjacent cores from creating extra detections. For large merged components, TMA-Grid can infer multiple expected core positions only when the component geometry and local spacing strongly support splitting. This reduces the risk of over-splitting cores that are torn, connected, or poorly separated.

Finally, asymmetric or damaged detections can be recentered using nearby mask geometry. The application reports detection diagnostics to the user, including the number of detected cores, rescued cores, removed artifacts, and recentered detections. Users can choose segmentation presets for common scenarios, including default, dense, sparse, damaged, and noisy arrays, and can manually add, remove, undo, redo, or inspect detections before proceeding to grid estimation.

**Figure 2.** Segmentation result. The original whole slide image representation is shown alongside the mask predicted by the segmentation model, illustrating the intermediate output that is converted into core centroids for downstream grid estimation.

### Gridding Algorithm

Once the user accepts or edits the detected core centroids, TMA-Grid estimates the TMA row and column grid on the interactive viewer. The gridding algorithm combines Delaunay triangulation, a traveling row-building procedure, image-rotation estimation, and post-processing steps for missing, misaligned, and marker cores.

#### Delaunay Triangulation-Based Segment Generation

To impose a two-dimensional grid on the detected centroids, TMA-Grid first estimates local row-wise connections. We modified the Delaunay triangulation-based approach described by Wang et al. (2011). Candidate edges are generated by triangulating the detected centroids (Figure 3A), then filtered by length and angle. Unlike the original interquartile range (IQR)-based filter, which removes both unusually long and unusually short edges, TMA-Grid primarily removes overly long edges (Figure 3B). We found that filtering out short edges can incorrectly remove valid row connections when cores are tightly packed.

Angle filtering is performed relative to the estimated image rotation (Figure 3C). Instead of using k-means clustering to assign edges into canonical angular groups, TMA-Grid applies a direct threshold around the row direction. This simpler criterion performed better for distorted or imperfectly aligned arrays and is easier for users to understand and adjust. After length and angle filtering, an edge-cleaning step ensures that each point is connected to at most two neighbors in a row, selecting the nearest valid neighbor on each side when more than two edges are present (Figure 3D). The output of this stage is a set of row-like segments and isolated points.

**Figure 3.** Results of Delaunay triangulation-based segment generation. Starting with Delaunay triangulation to generate edges (A), TMA-Grid filters edges by length (B) and angle (C), distilling them into row-like connections. Finally, each point is constrained to at most two connections by selecting the closest neighbor in the left and right directions (D). The resulting segments define rows and include isolated points with no segment connecting them to another point.

#### Traveling Row-Building Algorithm

The traveling algorithm iteratively builds complete rows from the segmented points. Each point is assigned a start point and an endpoint. For a point on a segment, the endpoint is the immediate neighbor to its right in the same segment; for an isolated point, the start point and endpoint are the point itself. Coordinates are adjusted for image rotation before row assignment so that the apparent slide orientation does not distort row and column inference.

At each iteration, the algorithm selects the remaining point with the smallest rotated horizontal coordinate as the beginning of a new row. It then searches for a point whose start point matches the endpoint of the current point. If such a point exists, it is added to the row. If no directly connected point is found, the algorithm searches within a circular region centered on the expected endpoint. The search radius is defined by a user-adjustable multiplier applied to the median inter-core distance. When multiple candidates are found, the closest candidate is selected.

If no appropriate real core is found, the algorithm inserts an imaginary core to preserve row continuity. Imaginary cores represent expected but missing array positions. The expected location of an imaginary core is computed from the last row endpoint and the estimated image rotation. This process continues until a real core is found or the row reaches the expected image boundary, as defined by image width and a user-adjustable stopping-distance parameter. The completed rows are sorted by their rotated vertical coordinates, and missing positions at row beginnings can be imputed backward to improve column alignment.

#### Marker Cores, Off-Grid Cores, and Lattice Refinement

Many TMAs include marker cores or guide cores that intentionally do not belong to the main sample lattice. Row and column assignment can fail when these marker cores are interpreted as the first row or column, shifting the entire main grid. TMA-Grid explicitly separates marker-core handling from main-lattice estimation.

After an initial row and column assignment, TMA-Grid identifies potentially misaligned cores and marker cores by comparing each core's position to the median position of nearby rows and columns. Marker candidates that are spatially off-grid are retained visually but excluded from the dominant row/column lattice. This prevents off-grid marker cores from forcing the main array to begin at an incorrect column or row. When surrounding row and column evidence is sufficient, marker cores can be automatically assigned to the nearest plausible grid location. When the evidence is insufficient, the marker is kept separate and reported to the user for review rather than disrupting the main grid.

TMA-Grid also applies an affine lattice refinement step to check row and column consistency for the main array. The lattice model is fit using non-marker, non-imaginary cores, and proposed assignments are accepted only when the residual error is small relative to the core radius and when the assignment does not create duplicate row/column positions. This refinement is intentionally conservative: it validates the dominant lattice, removes imaginary placeholders that duplicate real assigned cells, and supports marker-core placement without broadly renumbering ordinary cores or forcing off-grid markers into the main lattice.

#### Post-Processing and Review

After row generation and marker handling, TMA-Grid refines the output through several post-processing steps. Cores are reassigned to the closest column using a weighted distance to column medians, with a penalty for sparsely populated columns. This makes it less likely that a single misaligned core or artifact creates a new column. Imaginary cores in columns dominated by imaginary positions are removed when they are likely to represent gaps between sectors rather than true sample positions. Row indices are then compacted, and column indices are reassigned consecutively within each row.

The application then flags cores that may require user attention. These include unresolved marker cores, off-grid markers, and cores that remain misaligned after automatic assignment. Flagged issues are displayed in a compact review queue. Users can focus on an issue, inspect the corresponding core, make manual adjustments, and resolve the item. Importantly, imaginary cores are not automatically treated as errors, because empty array positions are common in TMA design and can be valid features of the TMA map.

### Virtual Grid, Metadata Editing, and Export

After gridding, TMA-Grid generates an idealized virtual grid. For WSI and GeoTIFF inputs, each preview cell is generated by requesting the corresponding core region from ImageBox3 on demand. Region requests are clamped to image bounds, and failed preview requests are represented by placeholder cells rather than preventing the grid from rendering. This allows users to continue metadata validation even if a small number of WSI region requests fail transiently.

The virtual grid supports core-level metadata review and editing. Users can load or create metadata fields, edit attributes for individual cores, and export the final de-arraying table as JSON or CSV. For compatible WSI and GeoTIFF inputs, users can also export full-resolution core images individually or in bulk. The export process retrieves the original-resolution image region for each core locally in the browser, preserving image fidelity while avoiding server-side patch extraction.

## Results

TMA-Grid provides an end-to-end web workflow for de-arraying TMA whole slide images. The application supports image input, neural-network-based tissue segmentation, interactive core correction, row/column grid estimation, marker-core review, virtual-grid generation, metadata editing, and full-resolution core export.

### Application Workflow

Figure 4 shows the TMA-Grid workflow from image selection through final export. In Figure 4A, the application begins with an image input panel where users can load a local image, provide a remote image URL, connect to a Box account, or load a built-in sample image for demonstration. Once an image is loaded, TMA-Grid displays image metadata, export support status, and a preview. The application then guides the user through segmentation, gridding, and final virtual-grid review.

In the segmentation view shown in Figure 4B, users can choose presets for common TMA scenarios, adjust sensitivity and size thresholds, toggle the segmentation mask, and manually add, remove, or inspect detected cores. The application displays detection diagnostics, including detected cores, rescued cores, removed artifacts, and recentered detections. These diagnostics provide immediate feedback when parameters are changed.

In the gridding view shown in Figure 4C, users can inspect the overlaid row/column assignments on an interactive WSI viewer. The toolbar includes controls for adding cores, zooming, fitting the image, toggling labels, toggling grid lines, and opening gridding parameters. Marker-core placement status and review issues are shown in compact panels. Flagged issues can be focused and resolved without requiring the user to manually scan the entire array.

The final view shown in Figure 4D displays an idealized virtual grid of de-arrayed cores. Users can select a core, edit metadata, add custom fields, export the metadata table, and download core images. For WSI and GeoTIFF-style inputs, the core previews and exports are generated from on-demand full-resolution image regions. If a preview request fails, the corresponding cell is shown with a placeholder rather than causing the entire final grid to fail.

**Figure 4.** TMA-Grid web application. (A) Data input panel supporting WSI from a local device, remote URL, Box, or built-in sample image, with ImageBox3 used to retrieve image regions on demand. (B) Core segmentation view showing the segmentation result, adjustable parameters such as sensitivity, and manual add/remove tools for detected cores. (C) Grid estimation view with an interactive whole slide viewer, overlaid grid, adjustable gridding parameters, and tools for editing core position, size, and row/column indices. (D) Virtual grid view showing the de-arrayed cores in an idealized layout, with core-level metadata editing, custom fields or annotations, JSON/CSV metadata export, and full-resolution core export when supported by the input format.

### Data Input and WSI Traversal

TMA-Grid can operate on standard image files as well as WSI and GeoTIFF-style images. For large WSI files, the application avoids loading the entire slide into memory. Instead, ImageBox3 is used to retrieve downsampled previews, interactive viewer tiles, and full-resolution regions as needed. This enables TMA-Grid to process multi-gigabyte images in a browser while preserving the zero-footprint architecture.

TMA-Grid includes a custom ImageBox3-backed OpenSeadragon tile source for full-resolution WSI interaction. This avoids dependence on a separate tile server and keeps WSI traversal inside the browser session. Tile requests are bounded to valid image coordinates and handled gracefully if a request fails, improving the stability of interactive viewing and export.

### Core Segmentation and Detection

The segmentation model performed well on the held-out test set, with an AUC of 0.981 and recall of 0.947 (Table 1). Qualitatively, the example in Figure 2 shows that the model output captures the intended core locations rather than requiring exact recovery of each irregular tissue boundary. In the application, this predicted mask is combined with post-processing to convert model output into core centroids and radii. Rescue and artifact-removal logic improve robustness in damaged, noisy, or weakly segmented arrays.

The detector can retain damaged cores that are torn, weakly stained, or partially missing. It also reduces false positives from non-core objects by using geometry-based filtering rather than stain-specific color thresholds. When multiple detected candidates are suspiciously close, the algorithm uses spacing and radius estimates to avoid adding extra cores between adjacent cores that are touching or bridged by tissue. The application exposes these operations through summary statistics so users can see how many cores were detected, rescued, removed as artifacts, or recentered.

### Grid Estimation and Marker-Core Handling

The grid estimation algorithm automatically assigns detected cores to row and column positions while preserving user control. The Delaunay triangulation and traveling algorithm identify the dominant grid structure, insert imaginary cores where expected positions are missing, and remove imaginary-heavy columns that are likely to represent sector gaps rather than true sample positions.

TMA-Grid handles marker cores by separating them from the dominant sample lattice. Off-grid marker cores are not allowed to define the first row or first column of the main array. Instead, they are recognized as separate from the main lattice, retained visually, and either automatically assigned when the surrounding lattice provides sufficient evidence or flagged for review when the assignment is ambiguous. This prevents common failure modes in which marker cores shift all main-array columns and cause the sample grid to start at the wrong index.

TMA-Grid also includes conservative lattice refinement. The refinement step uses the dominant main-array structure to validate row/column consistency, remove duplicate imaginary placeholders, and support marker placement only when the proposed assignment has low residual error and does not duplicate an occupied grid position. This allows TMA-Grid to improve consistency without overfitting to irregular marker positions or overriding the user's intended edits.

### Review Queue and Manual Correction

Because TMA slides can contain manufacturing artifacts, missing samples, off-grid markers, and severe distortions, fully automatic de-arraying cannot be expected to resolve every case. TMA-Grid therefore provides a compact review queue for flagged cases. The review queue lists unresolved marker or row/column issues, allows users to focus the viewer on a flagged core, and lets users resolve issues once they have been inspected or corrected. Imaginary cores are not treated as issues by default, because empty positions may represent valid TMA design.

This review workflow reduces the burden of manual inspection. Rather than requiring users to search the entire array for possible failures, the application directs attention to the subset of cores most likely to need human judgment.

### Browser-Based Use Across Devices

TMA-Grid runs in modern browsers on desktop and mobile devices. On smaller screens, toolbars are collapsed behind a "Show tools" control so that the image canvas remains the dominant workspace. Parameter panels open as compact overlays, review controls are condensed, and workflow navigation is horizontally scrollable. This preserves the zero-footprint nature of the tool while making it practical on phones and tablets.

### Virtual Grid, Metadata Editing, and Export

The virtual grid provides an idealized view of the de-arrayed TMA. Cores are arranged by their inferred row and column positions, and users can select individual cores to inspect or edit metadata. The metadata table can be exported as JSON or CSV. For compatible WSI and GeoTIFF inputs, TMA-Grid can also export full-resolution core images individually or in bulk.

Preview generation is failure-tolerant. If a WSI region request fails for an individual core, a placeholder cell is rendered and the rest of the grid continues to populate. This is important for large remote images, where transient tile or region errors can otherwise interrupt the entire export workflow.

### Comparison With Existing Tools

Figure 5 compares default de-arraying results from QuPath and TMA-Grid on the same TMA whole slide image. In the QuPath result, core diameter and row/column dimensions had to be specified manually before grid generation. In contrast, the TMA-Grid result illustrates the combined effect of automatic segmentation, grid estimation, marker-core handling, and interactive correction tools. TMA-Grid's browser-based design also avoids installation and allows operation on remote or cloud-hosted images without requiring server-side patch extraction.

**Figure 5.** Comparison of default de-arraying results using (A) QuPath and (B) TMA-Grid on the same TMA whole slide image. QuPath required manual specification of core diameter and row/column dimensions, whereas TMA-Grid estimated these parameters automatically and provided interactive tools for reviewing and correcting segmentation, marker-core, and gridding results.

