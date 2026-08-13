import {
  updateSliderUIText,
  updateStatusMessage,
  resetApplication,
  makeElementDraggable,
  getHyperparametersFromUI,
  updateImagePreview,
} from "./UI.js";

import {
  saveUpdatedCores,
  preprocessForTravelingAlgorithm,
  loadDataAndDetermineParams,
} from "./data_processing.js";

import { preprocessCores } from "./delaunay_triangulation.js";

import {
  applyAndVisualizeTravelingAlgorithm,
  updateVirtualGridSpacing,
  redrawCoresForTravelingAlgorithm,
  obtainHyperparametersAndDrawVirtualGrid,
  undo,
  redo,
} from "./drawCanvas.js";

import {
  loadModel,
  runSegmentationAndObtainCoreProperties,
  visualizeSegmentationResults,
} from "./core_detection.js";

import { getWSIInfo, getPNGFromWSI, getRegionFromWSI, createImageboxTileSource } from "./wsi.js";

const MAX_DIMENSION_FOR_DOWNSAMPLING = 1024;
const SAMPLE_IMAGE_URL =
  "https://storage.googleapis.com/imagebox_test/TMAs/HE_Hamamatsu.tiff";
const SIMPLE_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const WSI_IMAGE_EXTENSIONS = [".svs", ".ndpi", ".tif", ".tiff"];
const EXPORT_EMPTY_FOLDER_MESSAGE =
  "Export Grid requires an empty folder. Choose or create an empty folder before continuing.";
const EXPORT_NON_EMPTY_FOLDER_MESSAGE =
  "The selected folder is not empty. Export Grid can only export to an empty folder.";
const SEGMENTATION_PRESETS = {
  default: {
    threshold: 0.05,
    minArea: 20,
    maxArea: 3000,
    distance: 0.5,
    maskAlpha: 0.2,
  },
  dense: {
    threshold: 0.055,
    minArea: 15,
    maxArea: 2600,
    distance: 0.5,
    maskAlpha: 0.18,
  },
  sparse: {
    threshold: 0.045,
    minArea: 30,
    maxArea: 4200,
    distance: 0.5,
    maskAlpha: 0.2,
  },
  damaged: {
    threshold: 0.065,
    minArea: 12,
    maxArea: 4200,
    distance: 0.5,
    maskAlpha: 0.24,
  },
  noisy: {
    threshold: 0.035,
    minArea: 35,
    maxArea: 2600,
    distance: 0.5,
    maskAlpha: 0.16,
  },
};
let currentReviewIssueIndex = -1;
let currentReviewIssues = [];
let resolvedReviewIssueKeys = new Set();

// Initialize image elements
const originalImageContainer = document.getElementById("originalImage");
const processedImageCanvasID = "segmentationResultsCanvas";

// Load dependencies and return updated state
const loadDependencies = async () => ({
  model: await loadModel("https://episphere.github.io/tma-grid/PBCS_models/model/model.json"),
  // openCVLoaded: await loadOpenCV(),
});

// Pure function to get input values
const getInputValue = (inputId) => document.getElementById(inputId).value;

const getElement = (id) => document.getElementById(id);

function createTextElement(tagName, textContent, className = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = textContent;
  return element;
}

function getMedianNumber(values) {
  const sortedValues = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!sortedValues.length) {
    return null;
  }

  const middleIndex = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middleIndex]
    : (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

const getLowercasePath = (path = "") => {
  try {
    return new URL(path, window.location.href).pathname.toLowerCase();
  } catch {
    return String(path).split(/[?#]/)[0].toLowerCase();
  }
};

const hasAnyExtension = (path, extensions) =>
  extensions.some((extension) => getLowercasePath(path).endsWith(extension));

const normalizeImageType = (imageType = "") => {
  const type = String(imageType).toLowerCase();
  if (type === "jpg") {
    return "jpeg";
  }
  if (type === "tif") {
    return "tiff";
  }
  return type;
};

const getImageTypeFromUrl = (url = "") => {
  const path = getLowercasePath(url);
  const fileName = path.split("/").pop() || "";
  if (!fileName.includes(".")) {
    return "";
  }
  const extension = fileName.split(".").pop();

  return normalizeImageType(extension || "");
};

const getImageTypeFromName = (name = "") => {
  const normalizedName = String(name);
  if (!normalizedName.includes(".")) {
    return "";
  }
  return normalizeImageType(normalizedName.split(".").pop() || "");
};

const isSimpleImageType = (imageType = "") =>
  ["png", "jpeg", "webp"].includes(normalizeImageType(imageType));

const isWsiImageUrl = (url = "") => hasAnyExtension(url, WSI_IMAGE_EXTENSIONS);

const coerceImageResponseToBlob = async (imageResponse) => {
  if (imageResponse instanceof Blob) {
    return imageResponse;
  }

  if (typeof imageResponse?.blob === "function") {
    return await imageResponse.blob();
  }

  throw new Error("Image response did not contain a readable image blob.");
};

let openSeadragonDecodeShimInstalled = false;
function installOpenSeadragonDecodeShim() {
  if (openSeadragonDecodeShimInstalled) {
    return;
  }

  const decode = function () {
    return Promise.resolve(this);
  };

  [
    window.HTMLImageElement,
    window.HTMLCanvasElement,
    window.OffscreenCanvas,
    window.ImageBitmap,
  ].forEach((constructor) => {
    try {
      if (
        constructor?.prototype &&
        typeof constructor.prototype.decode !== "function"
      ) {
        Object.defineProperty(constructor.prototype, "decode", {
          value: decode,
          configurable: true,
        });
      }
    } catch {
      // Some browser-provided prototypes are not extensible. OpenSeadragon can
      // still use the native image path in those browsers.
    }
  });

  openSeadragonDecodeShimInstalled = true;
}

// function createImageboxTileSource(imageUrl, imageInfo) {

//   // const tileSize = 512;
//   // const width = Math.max(1, Math.round(imageInfo.width));
//   // const height = Math.max(1, Math.round(imageInfo.height));
//   // const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
//   // const tileSource = new OpenSeadragon.TileSource({
//   //   width,
//   //   height,
//   //   tileSize,
//   //   tileOverlap: 0,
//   //   minLevel: 0,
//   //   maxLevel,
//   // });

//   // tileSource.getTileUrl = function (level, x, y) {
//   //   return `${level}/${x}_${y}`;
//   // };

//   // tileSource.hasTransparency = function () {
//   //   return false;
//   // };

//   // const finishBlankTile = (context, request, blankWidth = tileSize, blankHeight = tileSize) => {
//   //   const canvas = document.createElement("canvas");
//   //   canvas.width = Math.max(1, Math.round(blankWidth));
//   //   canvas.height = Math.max(1, Math.round(blankHeight));
//   //   const image = new Image();
//   //   image.onload = () => context.finish(image, request);
//   //   image.onerror = () =>
//   //     context.finish(null, request, "Imagebox3 fallback tile failed to load.");
//   //   image.src = canvas.toDataURL("image/png");
//   // };

//   // tileSource.downloadTileStart = function (context) {
//   //   const tile = context.tile;
//   //   const levelScale = this.getLevelScale(tile.level);
//   //   const scaledWidth = this.dimensions.x * levelScale;
//   //   const scaledHeight = this.dimensions.y * levelScale;
//   //   const scaledTileX = tile.x * tileSize;
//   //   const scaledTileY = tile.y * tileSize;
//   //   const scaledTileWidth = Math.min(tileSize, scaledWidth - scaledTileX);
//   //   const scaledTileHeight = Math.min(tileSize, scaledHeight - scaledTileY);
//   //   const request = context.src;

//   //   if (scaledTileWidth <= 0 || scaledTileHeight <= 0) {
//   //     finishBlankTile(context, request);
//   //     return;
//   //   }

//   //   const tileLeft = Math.max(0, Math.floor(scaledTileX / levelScale));
//   //   const tileTop = Math.max(0, Math.floor(scaledTileY / levelScale));
//   //   const tileRight = Math.min(
//   //     width,
//   //     Math.ceil((scaledTileX + scaledTileWidth) / levelScale)
//   //   );
//   //   const tileBottom = Math.min(
//   //     height,
//   //     Math.ceil((scaledTileY + scaledTileHeight) / levelScale)
//   //   );

//   //   if (tileRight <= tileLeft || tileBottom <= tileTop) {
//   //     finishBlankTile(context, request, scaledTileWidth, scaledTileHeight);
//   //     return;
//   //   }

//   //   const tileParams = {
//   //     tileX: tileLeft,
//   //     tileY: tileTop,
//   //     tileWidth: tileRight - tileLeft,
//   //     tileHeight: tileBottom - tileTop,
//   //     tileSize: Math.max(
//   //       1,
//   //       Math.ceil(Math.max(scaledTileWidth, scaledTileHeight))
//   //     ),
//   //   };
//   //   context.userData = context.userData || {};
//   //   context.userData.abortRequested = false;

//   //   getRegionFromWSI(imageUrl, tileParams)
//   //     .then((imageResponse) => coerceImageResponseToBlob(imageResponse))
//   //     .then((blob) => {
//   //       if (context.userData.abortRequested) {
//   //         context.finish(null, request, "Tile load aborted.");
//   //         return;
//   //       }

//   //       const objectUrl = URL.createObjectURL(blob);
//   //       const image = new Image();
//   //       image.onload = () => {
//   //         URL.revokeObjectURL(objectUrl);
//   //         context.finish(image, request);
//   //       };
//   //       image.onerror = image.onabort = () => {
//   //         URL.revokeObjectURL(objectUrl);
//   //         context.finish(null, request, "Imagebox3 tile image failed to load.");
//   //       };
//   //       image.src = objectUrl;
//   //     })
//   //     .catch((error) => {
//   //       console.warn(
//   //         `Imagebox3 tile request failed for ${request}; using a blank tile.`,
//   //         error
//   //       );
//   //       finishBlankTile(context, request, scaledTileWidth, scaledTileHeight);
//   //     });
//   // };

//   // tileSource.downloadTileAbort = function (context) {
//   //   if (context.userData) {
//   //     context.userData.abortRequested = true;
//   //   }
//   // };

//   // return tileSource;
// }

const bindOnce = (element, eventName, handler, bindingName = eventName) => {
  if (!element) {
    return;
  }

  const bindingKey = `bound${bindingName}`;
  if (element.dataset[bindingKey] === "true") {
    return;
  }

  element.dataset[bindingKey] = "true";
  element.addEventListener(eventName, handler);
};

function setApplyStatus(message, tone = "neutral") {
  const status = getElement("segmentationApplyStatus");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.dataset.tone = tone;
}

function markSegmentationParametersDirty() {
  setApplyStatus("Parameters changed. Apply to update detection.", "warning");
}

function applySegmentationPreset(presetName) {
  const preset = SEGMENTATION_PRESETS[presetName] || SEGMENTATION_PRESETS.default;
  getElement("thresholdSlider").value = preset.threshold;
  getElement("maskAlphaSlider").value = preset.maskAlpha;
  getElement("minAreaInput").value = preset.minArea;
  getElement("maxAreaInput").value = preset.maxArea;
  getElement("disTransformMultiplierInput").value = preset.distance;
  updateSliderUIText(window.state || {});
  markSegmentationParametersDirty();
}

function selectUploadMethod(targetId) {
  const tab = document.querySelector(`.upload-option-tab[data-target="${targetId}"]`);
  if (tab) {
    tab.click();
  }
}

function getUploadedFileName() {
  const fileInput = getElement("fileInput");
  if (fileInput?.files?.[0]) {
    return fileInput.files[0].name;
  }

  if (window.boxFileInfo?.name) {
    return window.boxFileInfo.name;
  }

  const url = getInputValue("imageUrlInput");
  if (url) {
    return url.split("/").pop() || "Image URL";
  }

  return getElement("file-name")?.textContent || "Loaded image";
}

function updateUploadSummary(fileType = window.uploadedImageFileType) {
  const image = originalImageContainer;
  const nameEl = getElement("uploadSummaryName");
  const dimensionsEl = getElement("uploadSummaryDimensions");
  const capabilityEl = getElement("uploadSummaryCapability");

  if (!nameEl || !dimensionsEl || !capabilityEl) {
    return;
  }

  if (!image?.src || image.src.endsWith("#")) {
    nameEl.textContent = "None selected";
    dimensionsEl.textContent = "--";
    capabilityEl.textContent = "Load an image to check support";
    return;
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Number.isFinite(window.scalingFactor) ? window.scalingFactor : 1;
  const nativeWidth = width && scale ? Math.round(width / scale) : width;
  const nativeHeight = height && scale ? Math.round(height / scale) : height;
  const simpleImageTypes = ["png", "jpeg", "jpg"];

  nameEl.textContent = getUploadedFileName();
  dimensionsEl.textContent =
    nativeWidth && nativeHeight
      ? `${nativeWidth} × ${nativeHeight}px`
      : "Dimensions unavailable";
  capabilityEl.textContent = simpleImageTypes.includes(fileType)
    ? "Metadata export available; full-resolution core export unavailable"
    : "Metadata and grid export available when source tiles are readable";
}

function showExportGridWarning(message = EXPORT_EMPTY_FOLDER_MESSAGE) {
  const warning = document.getElementById("exportGridWarning");

  if (!warning) {
    return;
  }

  warning.textContent = message;
  warning.classList.remove("hidden");
}

async function directoryHasEntries(directoryHandle) {
  for await (const entry of directoryHandle.values()) {
    if (entry) {
      return true;
    }
  }

  return false;
}

function getRemovedArtifactCount(stats = {}) {
  return (
    (stats.nonTissueRemoved || 0) +
    (stats.bridgeRemoved || 0) +
    (stats.isolatedRemoved || 0)
  );
}

function updateSegmentationStats() {
  const statsEl = getElement("segmentationStats");
  if (!statsEl) {
    return;
  }

  const diagnostics = window.coreDetectionDiagnostics || {};
  const rescueStats = diagnostics.rescueStats || {};
  statsEl.replaceChildren(
    createTextElement("span", `Detected: ${diagnostics.total ?? "--"}`),
    createTextElement("span", `Rescued: ${diagnostics.rescued ?? "--"}`),
    createTextElement(
      "span",
      `Otsu/grid: ${rescueStats.otsuGridRescued || 0}`
    ),
    createTextElement(
      "span",
      `Removed artifacts: ${getRemovedArtifactCount(rescueStats)}`
    ),
    createTextElement("span", `Recentered: ${rescueStats.recentered || 0}`),
    createTextElement("span", `Circle fit: ${rescueStats.circleAdjusted || 0}`)
  );
}

function collectReviewIssues() {
  const issues = [];
  const rescueStats = window.coreDetectionDiagnostics?.rescueStats || {};

  if (getRemovedArtifactCount(rescueStats) > 0) {
    issues.push({
      type: "summary",
      title: `${getRemovedArtifactCount(rescueStats)} non-core artifact candidates removed`,
      detail: "Review nearby scale bars, labels, and merged tissue if counts look surprising.",
    });
  }

  const gridCores = window.sortedCoresData || [];
  const matchedReviewCoreIndexes = new Set();

  if (gridCores.length > 0) {
    const scale = Number.isFinite(window.scalingFactor) && window.scalingFactor > 0
      ? window.scalingFactor
      : 1;
    const rescueProperties = (window.properties || []).filter(
      (property) =>
        property.needsReview ||
        property.detectionMethod === "otsu-grid-rescue"
    );

    rescueProperties.forEach((property) => {
      const targetX = property.x / scale;
      const targetY = property.y / scale;
      let closestIndex = -1;
      let closestDistance = Infinity;

      gridCores.forEach((core, index) => {
        if (core.isImaginary || core.isMarker) {
          return;
        }

        const distance = Math.hypot(core.x - targetX, core.y - targetY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      const maximumMatchDistance = Math.max(
        10,
        ((property.radius || 10) * 2.5) / scale
      );
      if (closestIndex < 0 || closestDistance > maximumMatchDistance) {
        return;
      }

      const core = gridCores[closestIndex];
      matchedReviewCoreIndexes.add(closestIndex);
      issues.push({
        type: "core",
        title: `Otsu/grid candidate ${core.row + 1 || "?"},${core.col + 1 || "?"}`,
        detail: "Inferred from tissue evidence at a missing grid position. Select to inspect it.",
        core,
        property,
        index: closestIndex,
      });
    });
  }

  gridCores.forEach((core, index) => {
    if (
      !matchedReviewCoreIndexes.has(index) &&
      (core.needsReview || core.offGridMarker)
    ) {
      const isOtsuGridRescue = core.detectionMethod === "otsu-grid-rescue";
      issues.push({
        type: "core",
        title: isOtsuGridRescue
          ? `Otsu/grid candidate ${core.row + 1 || "?"},${core.col + 1 || "?"}`
          : core.offGridMarker
            ? `Off-grid marker ${core.row + 1 || "?"},${core.col + 1 || "?"}`
            : `Review core ${core.row + 1 || "?"},${core.col + 1 || "?"}`,
        detail: isOtsuGridRescue
          ? "Inferred from tissue evidence at a missing grid position. Select to inspect it."
          : core.offGridMarker
            ? "Off-grid marker kept separate from the main row/column lattice."
            : "Needs review after automatic row/column assignment.",
        core,
        index,
      });
    }
  });

  if (gridCores.length === 0) {
    (window.properties || []).forEach((property, index) => {
      if (
        property.needsReview ||
        property.detectionMethod === "otsu-grid-rescue"
      ) {
        issues.push({
          type: "property",
          title: `Otsu/grid candidate ${issues.length + 1}`,
          detail: `Inferred near image position (${Math.round(property.x)}, ${Math.round(property.y)}). Select to inspect it.`,
          property,
          index,
        });
      }
    });
  }

  return issues
    .map((issue) => ({
      ...issue,
      key: getReviewIssueKey(issue),
    }))
    .filter((issue) => !resolvedReviewIssueKeys.has(issue.key))
    .slice(0, 50);
}

function getReviewIssueKey(issue) {
  if (issue.type === "summary") {
    return `summary:${issue.title}`;
  }

  if (issue.type === "core") {
    const core = issue.core || {};
    return [
      "core",
      issue.index,
      core.row,
      core.col,
      core.needsReview ? "review" : "",
      core.offGridMarker ? "offgrid" : "",
    ].join(":");
  }

  if (issue.type === "property") {
    const property = issue.property || {};
    return [
      "property",
      property.detectionMethod || "review",
      Math.round(property.x || 0),
      Math.round(property.y || 0),
    ].join(":");
  }

  return `${issue.type}:${issue.index}:${issue.title}`;
}

function setReviewControlsState() {
  // Per-item controls are rendered with their corresponding review issues.
}

function renderReviewPanel() {
  const list = getElement("reviewIssueList");
  const summary = getElement("reviewSummary");
  const count = getElement("reviewIssueCount");
  if (!list || !summary || !count) {
    return;
  }

  currentReviewIssues = collectReviewIssues();
  currentReviewIssueIndex = currentReviewIssues.length ? 0 : -1;
  count.textContent = currentReviewIssues.length;
  summary.textContent = currentReviewIssues.length
    ? `${currentReviewIssues.length} flagged item${currentReviewIssues.length === 1 ? "" : "s"} ready for triage.`
    : "No flagged marker or row/column issues.";
  list.replaceChildren();

  currentReviewIssues.forEach((issue, index) => {
    const item = document.createElement("li");
    item.className = "review-issue-item";
    const focusButton = document.createElement("button");
    const issueText = document.createElement("span");
    const resolveButton = document.createElement("button");

    focusButton.type = "button";
    focusButton.className = "review-issue-focus";
    focusButton.dataset.reviewIndex = `${index}`;
    issueText.append(
      createTextElement("strong", issue.title),
      createTextElement("small", issue.detail)
    );
    focusButton.appendChild(issueText);

    resolveButton.type = "button";
    resolveButton.className = "review-issue-resolve";
    resolveButton.dataset.resolveIndex = `${index}`;
    resolveButton.textContent = "✅";
    resolveButton.setAttribute("aria-label", `Resolve ${issue.title}`);
    resolveButton.title = `Resolve ${issue.title}`;

    item.append(focusButton, resolveButton);
    list.appendChild(item);
  });
  setReviewControlsState();
}

function focusReviewIssue(index) {
  if (!currentReviewIssues.length) {
    return;
  }

  currentReviewIssueIndex =
    (index + currentReviewIssues.length) % currentReviewIssues.length;
  const issue = currentReviewIssues[currentReviewIssueIndex];

  document.querySelectorAll(".review-issue-item").forEach((item, itemIndex) => {
    item.classList.toggle("active", itemIndex === currentReviewIssueIndex);
  });

  document
    .querySelectorAll(".core-overlay-for-gridding.review-focus-target")
    .forEach((overlay) => overlay.classList.remove("review-focus-target"));

  const viewerIsReady =
    issue.core &&
    window.viewer &&
    window.viewer.world?.getItemCount?.() > 0;

  if (viewerIsReady) {
    window.focusedGridReviewCore = issue.core;
    const point = new OpenSeadragon.Point(issue.core.x, issue.core.y);
    window.viewer.viewport.panTo(
      window.viewer.viewport.imageToViewportCoordinates(point),
      false
    );
    window.viewer.viewport.zoomTo(
      Math.max(window.viewer.viewport.getZoom(), 2.5),
      null,
      false
    );

    const overlay = document.querySelector(
      `[data-core-index="${issue.index}"]`
    );
    overlay?.classList.add("review-focus-target");
  } else if (issue.property) {
    window.focusedSegmentationReviewProperty = issue.property;
    redrawSegmentationPreviewOnly();
    getElement("segmentationResultsCanvas")?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }
}

function clearCoreReviewFlag(issue) {
  if (issue?.type === "property" && issue.property) {
    issue.property.needsReview = false;
    if (window.focusedSegmentationReviewProperty === issue.property) {
      window.focusedSegmentationReviewProperty = null;
      redrawSegmentationPreviewOnly();
    }
    return;
  }

  if (issue?.type !== "core" || !issue.core) {
    return;
  }

  if (issue.core.needsReview) {
    issue.core.needsReview = false;
  }
  if (issue.property?.needsReview) {
    issue.property.needsReview = false;
  }
  if (window.focusedGridReviewCore === issue.core) {
    window.focusedGridReviewCore = null;
  }

  const overlay = document.querySelector(
    `[data-core-index="${issue.index}"]`
  );
  overlay?.classList.remove("needs-review", "review-focus-target");
}

function resolveReviewIssue(index = currentReviewIssueIndex) {
  const issue = currentReviewIssues[index];
  if (!issue) {
    return;
  }

  resolvedReviewIssueKeys.add(issue.key || getReviewIssueKey(issue));
  clearCoreReviewFlag(issue);
  renderReviewPanel();
  focusReviewIssue(Math.min(index, currentReviewIssues.length - 1));
}

function resolveAllReviewIssues() {
  currentReviewIssues.forEach((issue) => {
    resolvedReviewIssueKeys.add(issue.key || getReviewIssueKey(issue));
    clearCoreReviewFlag(issue);
  });
  renderReviewPanel();
}

function toggleReviewPanel(forceOpen = null) {
  const panel = getElement("reviewPanel");
  const button = getElement("minimizeReviewPanelButton");

  if (!panel || !button) {
    return;
  }

  const shouldOpen =
    forceOpen === null
      ? panel.classList.contains("review-sidebar-minimized")
      : forceOpen;
  panel.classList.toggle("review-sidebar-minimized", !shouldOpen);
  button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  button.setAttribute(
    "aria-label",
    shouldOpen ? "Minimize review panel" : "Restore review panel"
  );
  button.title = shouldOpen ? "Minimize review panel" : "Restore review panel";
  button.textContent = shouldOpen ? "−" : "‹";
}

// Helper functions to abstract operations
const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const createImageElement = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = reject;
  });

const scaleImageIfNeeded = (img) => {
  const scalingFactor =
    img.width > MAX_DIMENSION_FOR_DOWNSAMPLING ||
      img.height > MAX_DIMENSION_FOR_DOWNSAMPLING
      ? Math.min(
        MAX_DIMENSION_FOR_DOWNSAMPLING / img.width,
        MAX_DIMENSION_FOR_DOWNSAMPLING / img.height
      )
      : 1;

  window.scalingFactor = scalingFactor;

  const canvas = document.createElement("canvas");
  canvas.width = img.width * scalingFactor;
  canvas.height = img.height * scalingFactor;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { downsampledSrc: canvas.toDataURL(), scalingFactor };
};

const updateUIForScaledImage = (src, scalingFactor, imgDimensions) => {
  originalImageContainer.src = src;
  const osdCanvasParent = document.getElementById("osdViewer");
  osdCanvasParent.style.width = `${imgDimensions.width * scalingFactor}px`;
  osdCanvasParent.style.height = `${imgDimensions.height * scalingFactor}px`;
  document.getElementById("loadingSpinner").style.display = "none";
};

const handleSVSFile = async (file, processCallback) => {
  const imageInfo = await getWSIInfo(file);
  window.loadedWSIInfo = imageInfo;
  const scalingFactor = Math.min(
    MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.width,
    MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.height
  );
  window.scalingFactor = scalingFactor;
  const wsiThumbnail = await getPNGFromWSI(
    file,
    MAX_DIMENSION_FOR_DOWNSAMPLING
  );
  let objectURL = URL.createObjectURL(
    await coerceImageResponseToBlob(wsiThumbnail)
  );

  originalImageContainer.crossOrigin = "anonymous";
  originalImageContainer.src = objectURL;

  originalImageContainer.onload = () => {
    const osdCanvasParent = document.getElementById("osdViewer");
    osdCanvasParent.style.width = `${Math.ceil(
      imageInfo.width * scalingFactor
    )}px`;
    osdCanvasParent.style.height = `${Math.ceil(
      imageInfo.height * scalingFactor
    )}px`;

    updateStatusMessage(
      "imageLoadStatus",
      "Image loaded successfully.",
      "success-message"
    );

    updateImagePreview(
      originalImageContainer.src,
      imageInfo.width * scalingFactor,
      imageInfo.height * scalingFactor
    );
    processCallback();

    window.loadedImg = originalImageContainer;
    updateUploadSummary(getImageTypeFromName(file.name));
    document.getElementById("loadingSpinner").style.display = "none";
  };
};

// Updated handleImageLoad function to support .svs files
const handleImageLoad = (file, processCallback) => {
  document.getElementById("imageUrlInput").value = null;
  document.getElementById("loadingSpinner").style.display = "block";
  const fileName = file?.name || "";
  const fileType =
    getImageTypeFromName(fileName) ||
    normalizeImageType(file?.type?.split("/")?.[1] || "");

  if (file && fileName && isWsiImageUrl(fileName)) {
    updateImagePreview(
      originalImageContainer.src,
      originalImageContainer.width,
      originalImageContainer.height
    );

    handleSVSFile(file, processCallback);
    window.uploadedImageFileType = fileType;
  } else if (
    file &&
    file.type.startsWith("image/") &&
    isSimpleImageType(fileType)
  ) {
    loadImage(file)
      .then(createImageElement)
      .then((img) => {
        const { downsampledSrc, scalingFactor } = scaleImageIfNeeded(img);
        originalImageContainer.onload = () => {
          updateStatusMessage(
            "imageLoadStatus",
            "Image loaded successfully.",
            "success-message"
          );
          updateImagePreview(
            originalImageContainer.src,
            img.width * scalingFactor,
            img.height * scalingFactor
          );
          processCallback();
          window.loadedImg = originalImageContainer;
          updateUploadSummary(file.type.split("/")[1]);
          document.getElementById("loadingSpinner").style.display = "none";
        };
        originalImageContainer.onerror = () => {
          updateStatusMessage(
            "imageLoadStatus",
            "Image failed to load.",
            "error-message"
          );
          console.error("Image failed to load.");
        };
        updateUIForScaledImage(downsampledSrc, scalingFactor, {
          width: img.width,
          height: img.height,
        });
      })
      .catch(() => {
        updateStatusMessage(
          "imageLoadStatus",
          "Image failed to load.",
          "error-message"
        );
        console.error("Image failed to load.");
      });

    window.uploadedImageFileType = fileType;
  } else {
    updateStatusMessage(
      "imageLoadStatus",
      "File loaded is not in a supported image format. Supported formats include .svs, .ndpi, .tif, .tiff, .jpg, .jpeg, .webp, and .png.",
      "error-message"
    );
    console.error("File loaded is not an image.");
  }
};
// Main event handler, refactored to use functional programming
const handleImageInputChange = async (e, processCallback) => {
  resetApplication();
  resolvedReviewIssueKeys = new Set();
  document.getElementById("imageUrlInput").value = null;

  const file = e.target.files[0];
  handleImageLoad(file, processCallback);
};

function handleMetadataFileSelect(event) {
  const file = event.target.files[0];

  if (!file) {
    updateStatusMessage(
      "metadataLoadStatus",
      "No file selected.",
      "error-message"
    );
    return;
  }

  // Check file type
  const fileType = file.type;
  const validExcelTypes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  const validCsvType = "text/csv";

  if (!validExcelTypes.includes(fileType) && fileType !== validCsvType) {
    updateStatusMessage(
      "metadataLoadStatus",
      "Invalid file type. Please upload a .csv or .xls/.xlsx file.",
      "error-message"
    );

    return;
  }

  if (fileType === validCsvType) {
    processCSV(file);
  } else {
    processExcel(file);
  }
}

function processCSV(file) {
  Papa.parse(file, {
    complete: function (results) {
      validateMetadata(results.data, "csv");
    },
  });
}

function processExcel(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const json = XLSX.utils.sheet_to_json(worksheet);
    validateMetadata(json, "excel");
  };

  reader.readAsArrayBuffer(file);
}

function validateMetadata(data, fileType = "csv") {
  if (!data || data.length === 0) {
    updateStatusMessage(
      "metadataLoadStatus",
      "The file is empty.",
      "error-message"
    );
    return;
  }

  // Helper function to find a column name considering case-insensitivity and abbreviations
  function findColumnName(data, possibleNames, fileType = "csv") {
    let columnNames;
    if (fileType === "csv") {
      columnNames = data[0];
    } else {
      columnNames = Object.keys(data[0]);
    }
    for (const name of columnNames) {
      if (possibleNames.includes(name.toLowerCase())) {
        return name;
      }
    }
    return null;
  }

  // Define possible names for 'row' and 'column' considering case and abbreviations
  const possibleRowNames = ["row"];
  const possibleColumnNames = ["column", "col"];

  const rowName = findColumnName(data, possibleRowNames, fileType);
  const colName = findColumnName(data, possibleColumnNames, fileType);

  if (!rowName || !colName) {
    updateStatusMessage(
      "metadataLoadStatus",
      "Missing required columns: row and column/col.",
      "error-message"
    );
    return;
  }

  // Store the identified column names and the data
  window.metadataRowName = rowName;
  window.metadataColName = colName;

  if (fileType === "csv") {
    window.userUploadedMetadata = [];

    let keys = [];
    data.forEach((row, index) => {
      if (index === 0) {
        keys = row;
      } else {
        let obj = {};
        keys.forEach((key, i) => {
          obj[key] = row[i];
        });
        window.userUploadedMetadata.push(obj);
      }
    });
  } else {
    window.userUploadedMetadata = data;
  }

  updateStatusMessage(
    "metadataLoadStatus",
    "File successfully uploaded and validated.",
    "success-message"
  );
  updateImagePreview(
    originalImageContainer.src,
    originalImageContainer.width,
    originalImageContainer.height
  );
}

// Function to get input parameters from the UI
const getInputParameters = () => {
  const threshold = 1 - parseFloat(getInputValue("thresholdSlider"));
  const maskAlpha = parseFloat(getInputValue("maskAlphaSlider"));
  const minArea = parseInt(getInputValue("minAreaInput"), 10);
  const maxArea = parseInt(getInputValue("maxAreaInput"), 10);
  const disTransformMultiplier = parseFloat(
    getInputValue("disTransformMultiplierInput")
  );

  return {
    threshold,
    maskAlpha,
    minArea,
    maxArea,
    disTransformMultiplier,
  };
};

// Event handler for load image from URL
const handleLoadImageUrlClick = async () => {
  resetApplication();
  resolvedReviewIssueKeys = new Set();
  document.getElementById("fileInput").value = null;
  // Show loading spinner
  document.getElementById("loadingSpinner").style.display = "block";

  // Add a cors proxy to the image URL
  // const corsProxy = "https://corsproxy.io/?";

  // Add the cors proxy to the image URL input

  // $("#imageUrlInput").val(corsProxy + $("#imageUrlInput").val());

  const checkImageType = async (url) => {
    const fallbackType = getImageTypeFromUrl(url);

    try {
      const resp = await fetch(url, { method: "HEAD" });
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) {
        const headerType = contentType.split(";")[0].split("/")[1];
        return normalizeImageType(headerType);
      }

      if (contentType === "application/octet-stream") {
        return fallbackType || "svs";
      }
    } catch (error) {
      console.warn("Could not read image headers; using URL extension.", error);
    }

    return fallbackType;
  };

  const imageUrl = getInputValue("imageUrlInput");

  if (imageUrl) {
    let imageResp = undefined;
    let width, height;
    window.uploadedImageFileType = await checkImageType(imageUrl);
    window.originalImageUrl = imageUrl;

    try {
      if (isSimpleImageType(window.uploadedImageFileType)) {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Image URL returned ${response.status}`);
        }
        imageResp = await response.blob();
        window.scalingFactor = 1;
      } else {
        let imageInfo;
        try {
          imageInfo = await getWSIInfo(imageUrl);
        } catch (e) {
          console.error(e);
          alert("Image unsupported! Please try with a different URL.");
          document.getElementById("loadingSpinner").style.display = "none";
          return;
        }
        window.loadedWSIInfo = imageInfo;
        width = imageInfo.width;
        height = imageInfo.height;

        if (
          imageInfo.width > MAX_DIMENSION_FOR_DOWNSAMPLING ||
          imageInfo.height > MAX_DIMENSION_FOR_DOWNSAMPLING
        ) {
          const scalingFactor = Math.min(
            MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.width,
            MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.height
          );
          window.scalingFactor = scalingFactor;
        } else {
          window.scalingFactor = 1;
        }

        imageResp = await coerceImageResponseToBlob(
          await getPNGFromWSI(imageUrl, MAX_DIMENSION_FOR_DOWNSAMPLING)
        );
      }
    } catch (error) {
      updateStatusMessage(
        "imageLoadStatus",
        "Invalid image URL.",
        "error-message"
      );
      document.getElementById("loadingSpinner").style.display = "none";
      console.error("There has been a problem loading the image URL: ", error);
      return;
    }

    if (!(imageResp instanceof Blob)) {
      updateStatusMessage(
        "imageLoadStatus",
        "Invalid image URL.",
        "error-message"
      );
      // Hide loading spinner
      document.getElementById("loadingSpinner").style.display = "none";
      throw new Error("Network response was not ok.");
    }

    try {
      let objectURL = URL.createObjectURL(imageResp);
      originalImageContainer.crossOrigin = "anonymous";

      const img = new Image();
      img.src = objectURL;
      img.onload = async () => {
        width = width || img.naturalWidth || img.width;
        height = height || img.naturalHeight || img.height;
        // Check if the image needs to be scaled down. Will only occur for png/jpg images
        if (
          img.width > MAX_DIMENSION_FOR_DOWNSAMPLING ||
          img.height > MAX_DIMENSION_FOR_DOWNSAMPLING
        ) {
          const scalingFactor = Math.min(
            MAX_DIMENSION_FOR_DOWNSAMPLING / img.width,
            MAX_DIMENSION_FOR_DOWNSAMPLING / img.height
          );
          window.scalingFactor = scalingFactor;
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scalingFactor;
          canvas.height = img.height * scalingFactor;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          originalImageContainer.src = canvas.toDataURL();
        } else {
          // For SVS files, you don't need to check the scaling factor, because the scaling factor is already set and the
          // image is already scaled down
          if (isSimpleImageType(window.uploadedImageFileType)) {
            window.scalingFactor = 1;
          }
          originalImageContainer.src = img.src;
        }
      };

      // originalImageContainer.src = objectURL;
      originalImageContainer.onload = async () => {
        // Check if the image needs to be scaled down
        if (!width) {
          width = originalImageContainer.width;
        }
        if (!height) {
          height = originalImageContainer.height;
        }

        const displayScale = Number.isFinite(window.scalingFactor)
          ? window.scalingFactor
          : 1;
        const osdCanvasParent = document.getElementById("osdViewer");
        osdCanvasParent.style.width = `${Math.ceil(width * displayScale)}px`;
        osdCanvasParent.style.height = `${Math.ceil(
          height * displayScale
        )}px`;

        window.loadedImg = originalImageContainer;

        updateStatusMessage(
          "imageLoadStatus",
          "Image loaded successfully.",
          "success-message"
        );
        updateImagePreview(
          originalImageContainer.src,
          width * displayScale,
          height * displayScale
        );
        updateUploadSummary(window.uploadedImageFileType);
        await segmentImage(true);
      };
    }
    catch (error) {
      updateStatusMessage(
        "imageLoadStatus",
        "Invalid image URL.",
        "error-message"
      );
      // Hide loading spinner
      document.getElementById("loadingSpinner").style.display = "none";
      console.error(
        "There has been a problem with your fetch operation: ",
        error
      );
    };
  } else {
    updateStatusMessage("imageLoadStatus", "Invalid Image.", "error-message");
    // Hide loading spinner
    document.getElementById("loadingSpinner").style.display = "none";

    console.error("Please enter a valid image URL");
  }

  window.imageSource = "URL";
};

async function segmentImage(initializeParams = false) {
  if (window.state === undefined) {
    await initSegmentation();
  }

  const { threshold, maskAlpha, minArea, maxArea, disTransformMultiplier } =
    getInputParameters();

  if (
    originalImageContainer.src &&
    originalImageContainer.src[originalImageContainer.src.length - 1] !== "#"
  ) {
    let thresholdedPredictions;
    let preprocessedCores;

    try {
      [preprocessedCores, thresholdedPredictions] =
        await runSegmentationAndObtainCoreProperties(
          originalImageContainer,
          window.state.model,
          threshold,
          minArea,
          maxArea,
          disTransformMultiplier
        );
      window.preprocessedCores = preprocessCores(preprocessedCores);

      if (initializeParams) {
        const newParams = await loadDataAndDetermineParams(
          window.preprocessedCores,
          getHyperparametersFromUI()
        );

        const gridWidth = newParams.gridWidth;
        const coreRadius =
          getMedianNumber(window.preprocessedCores.map((core) => core.radius)) ||
          window.preprocessedCores[0].radius;

        const spacingBetweenCores = gridWidth - 2 * coreRadius;

        if (spacingBetweenCores < 0) {
          [preprocessedCores, thresholdedPredictions] =
            await runSegmentationAndObtainCoreProperties(
              originalImageContainer,
              window.state.model,
              0.95,
              minArea,
              maxArea,
              disTransformMultiplier
            );
          document.getElementById("thresholdSlider").value = 0.05;
          document.getElementById("thresholdValue").textContent = 0.05;
          window.preprocessedCores = preprocessCores(preprocessedCores);
        }
      }
    } catch (error) {
      window.lastSegmentationError = {
        name: error?.name || "Error",
        message: error?.message || String(error),
        stack: error?.stack || "",
      };
      console.error("Error processing image:", window.lastSegmentationError);
      setApplyStatus("Detection failed. Check parameters and try again.", "error");
    } finally {
      if (thresholdedPredictions && preprocessedCores) {
        // Visualize the predictions with the mask overlay and centroids
        await visualizeSegmentationResults(
          originalImageContainer,
          thresholdedPredictions,
          preprocessedCores,
          processedImageCanvasID,
          maskAlpha
        );
        updateSegmentationStats();
        renderReviewPanel();
        setApplyStatus("Detection updated.", "success");
      }
      // Hide loading spinner
      document.getElementById("loadingSpinner").style.display = "none";
    }
  }
}

function setSegmentationMode(mode) {
  window.segmentationEditMode = mode;
  document.querySelectorAll("[data-segmentation-mode]").forEach((button) => {
    const isActive = button.dataset.segmentationMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

async function redrawSegmentationPreviewOnly() {
  if (!window.properties || !window.thresholdedPredictions) {
    return;
  }

  await visualizeSegmentationResults(
    originalImageContainer,
    window.thresholdedPredictions,
    window.properties,
    processedImageCanvasID,
    parseFloat(getElement("maskAlphaSlider").value)
  );
}

function setupWorkspaceSidebarHeightSync() {
  if (window.workspaceSidebarHeightSyncInitialized) {
    return;
  }
  window.workspaceSidebarHeightSyncInitialized = true;

  const desktopQuery = window.matchMedia("(min-width: 901px)");
  const sidebarPairs = [
    ["segmentation-sidebar", "segmentationResultsCanvas"],
    ["gridding-sidebar", "osdViewer"],
    ["virtual-grid-sidebar", "virtualGridCanvas"],
  ];

  const syncHeights = () => {
    sidebarPairs.forEach(([sidebarId, imageId]) => {
      const sidebar = getElement(sidebarId);
      const image = getElement(imageId);
      const column = sidebar?.parentElement;
      const toggle = column?.querySelector(".workspace-sidebar-trigger");

      if (!sidebar || !image || !column) {
        return;
      }

      if (!desktopQuery.matches) {
        column.style.removeProperty("height");
        column.style.removeProperty("max-height");
        sidebar.style.removeProperty("height");
        sidebar.style.removeProperty("max-height");
        return;
      }

      const imageHeight = Math.round(image.getBoundingClientRect().height);
      if (imageHeight <= 0) {
        return;
      }

      const columnStyles = window.getComputedStyle(column);
      const gap = parseFloat(columnStyles.rowGap || columnStyles.gap) || 0;
      const toggleHeight = toggle?.getBoundingClientRect().height || 0;
      const sidebarHeight = Math.max(0, imageHeight - toggleHeight - gap);

      column.style.height = `${imageHeight}px`;
      column.style.maxHeight = `${imageHeight}px`;
      sidebar.style.height = `${sidebarHeight}px`;
      sidebar.style.maxHeight = `${sidebarHeight}px`;
    });
  };

  const resizeObserver = new ResizeObserver(syncHeights);
  sidebarPairs.forEach(([, imageId]) => {
    const image = getElement(imageId);
    if (image) {
      resizeObserver.observe(image);
    }
  });
  desktopQuery.addEventListener("change", syncHeights);
  window.addEventListener("resize", syncHeights);
  requestAnimationFrame(syncHeights);
}

function setupUiEnhancements() {
  setupMobileWorkspaceControls();
  setupWorkspaceSidebarHeightSync();

  document.querySelectorAll("[data-segmentation-mode]").forEach((button) => {
    bindOnce(button, "click", () => {
      const requestedMode = button.dataset.segmentationMode;
      setSegmentationMode(
        window.segmentationEditMode === requestedMode ? "none" : requestedMode
      );
    });
  });
  setSegmentationMode(window.segmentationEditMode || "add");

  bindOnce(getElement("segmentationUndoButton"), "click", () => {
    undo();
    updateSegmentationStats();
  });
  bindOnce(getElement("segmentationRedoButton"), "click", () => {
    redo();
    updateSegmentationStats();
  });
  bindOnce(getElement("toggleSegmentationMaskButton"), "click", async (event) => {
    const button = event.currentTarget;
    const pressed = button.getAttribute("aria-pressed") !== "false";
    button.setAttribute("aria-pressed", pressed ? "false" : "true");
    button.textContent = pressed ? "Mask Off" : "Mask On";
    getElement("maskAlphaSlider").value = pressed ? 0 : 0.2;
    updateSliderUIText(window.state || {});
    await redrawSegmentationPreviewOnly();
  });

  bindOnce(getElement("segmentationPresetSelect"), "change", (event) => {
    applySegmentationPreset(event.currentTarget.value);
  });

  bindOnce(getElement("probabilityHeatmapToggle"), "change", async () => {
    await redrawSegmentationPreviewOnly();
  });

  bindOnce(getElement("loadSampleImageBtn"), "click", () => {
    const imageUrlInput = getElement("imageUrlInput");
    if (imageUrlInput) {
      imageUrlInput.value = SAMPLE_IMAGE_URL;
    }
    selectUploadMethod("url-upload");
    handleLoadImageUrlClick();
  });

  [
    "thresholdSlider",
    "maskAlphaSlider",
    "minAreaInput",
    "maxAreaInput",
    "disTransformMultiplierInput",
  ].forEach((inputId) => {
    bindOnce(getElement(inputId), "input", markSegmentationParametersDirty, "dirty");
  });

  const toggleGridLabels = (button) => {
    const labelsAreOn = button.getAttribute("aria-pressed") !== "false";
    button.setAttribute("aria-pressed", labelsAreOn ? "false" : "true");
    button.textContent = labelsAreOn ? "Labels Off" : "Labels On";
    getElement("osdViewer")?.classList.toggle("hide-core-labels", labelsAreOn);
  };
  const toggleGridLines = (button) => {
    const linesAreOn = button.getAttribute("aria-pressed") !== "false";
    const checkbox = getElement("connectCoresCheckbox");
    if (checkbox) {
      checkbox.checked = !linesAreOn;
    }
    button.setAttribute("aria-pressed", linesAreOn ? "false" : "true");
    button.textContent = linesAreOn ? "Lines Off" : "Lines On";
    if (window.sortedCoresData?.length) {
      redrawCoresForTravelingAlgorithm();
    }
  };

  window.toggleGridLabels = toggleGridLabels;
  window.toggleGridLines = toggleGridLines;

  bindOnce(getElement("minimizeReviewPanelButton"), "click", () => {
    toggleReviewPanel();
  });
  bindOnce(getElement("reviewIssueList"), "click", (event) => {
    const resolveButton = event.target.closest("[data-resolve-index]");
    if (resolveButton) {
      resolveReviewIssue(parseInt(resolveButton.dataset.resolveIndex, 10));
      return;
    }

    const focusButton = event.target.closest("[data-review-index]");
    if (focusButton) {
      focusReviewIssue(parseInt(focusButton.dataset.reviewIndex, 10));
    }
  });

  updateUploadSummary();
  updateSegmentationStats();
  renderReviewPanel();
}

function setupMobileWorkspaceControls() {
  const mobileControlsQuery = window.matchMedia("(max-width: 760px)");

  const setControlsOpen = (button, open) => {
    const panel = getElement(button.dataset.mobileControlsTarget);
    if (!panel) {
      return;
    }

    button.dataset.mobileControlsOpen = open ? "true" : "false";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.textContent = open ? "Hide tools" : "Show tools";
    panel.classList.toggle(
      "mobile-controls-collapsed",
      mobileControlsQuery.matches && !open
    );
  };

  const syncMobileControls = () => {
    document.querySelectorAll("[data-mobile-controls-target]").forEach((button) => {
      const panel = getElement(button.dataset.mobileControlsTarget);
      if (!panel) {
        return;
      }

      if (!mobileControlsQuery.matches) {
        panel.classList.remove("mobile-controls-collapsed");
        button.setAttribute("aria-expanded", "true");
        button.textContent = "Tools";
        return;
      }

      setControlsOpen(button, button.dataset.mobileControlsOpen === "true");
    });
  };

  document.querySelectorAll("[data-mobile-controls-target]").forEach((button) => {
    bindOnce(button, "click", () => {
      setControlsOpen(button, button.dataset.mobileControlsOpen !== "true");
    }, "mobileControls");
  });

  if (mobileControlsQuery.addEventListener) {
    mobileControlsQuery.addEventListener("change", syncMobileControls);
  } else {
    mobileControlsQuery.addListener(syncMobileControls);
  }
  syncMobileControls();
}

// Function to handle Box login and OAuth flow
document.getElementById("boxLoginBtn").addEventListener("click", function () {
  var clientId = "1n44fu5yu1l547f2n2fgcw7vhps7kvuw";
  const currentURL = new URL(window.location.href);
  var redirectUri = currentURL.origin + currentURL.pathname; // Make sure this matches the Box app configuration
  redirectUri = redirectUri.replace(/\/$/, ""); // Remove trailing slash if present
  var state = "optional-custom-state";
  // Using the implicit grant (token) flow for simplicity in client-side handling
  var boxAuthUrl = `https://account.box.com/api/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;
  // Redirect to Box login page
  window.location.href = boxAuthUrl;
});

// Handle authentication response and initialize Box Picker
window.onload = async () => {
  if (localStorage.accessToken && localStorage.refreshToken) {
    await ensureValidAccessToken();
    accessToken = localStorage.accessToken;
    refreshToken = localStorage.refreshToken;
    accessTokenExpiry = localStorage.accessTokenExpiry;
    initializeBoxPicker(localStorage.accessToken);
  } else {
    // Correctly process the URL search parameters to get the authorization code
    const queryParams = new URLSearchParams(window.location.search);
    const authorizationCode = queryParams.get("code");

    if (authorizationCode) {
      // Since you cannot directly initialize the Box Picker with an authorization code,
      // you need to exchange the code for an access token.
      // This should be done on the server side for security reasons.
      exchangeAuthorizationCodeForAccessToken(authorizationCode);
    }
  }
};

let accessToken = "";
let accessTokenExpiry = 0;
let refreshToken = ""; // You need to store and manage this securely

function exchangeAuthorizationCodeForAccessToken(authorizationCode) {
  const clientId = "1n44fu5yu1l547f2n2fgcw7vhps7kvuw";
  const clientSecret = "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd";
  let redirectUri = window.location.href.split(/[?#]/)[0];

  // Remove any trailing slash from the redirect URI

  redirectUri = redirectUri.replace(/\/$/, "");

  const url = "https://api.box.com/oauth2/token";
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", authorizationCode);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("redirect_uri", redirectUri);
  params.append;

  fetch(url, {
    method: "POST",
    body: params,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.access_token && data.refresh_token) {
        accessToken = data.access_token;
        localStorage.accessToken = data.access_token;
        refreshToken = data.refresh_token;
        localStorage.refreshToken = data.refresh_token;
        accessTokenExpiry = Date.now() + data.expires_in * 1000;
        localStorage.accessTokenExpiry = Date.now() + data.expires_in * 1000;

        let replaceURLPath = window.location.host.includes("localhost")
          ? "/"
          : "/tma-grid";
        window.history.replaceState({}, "", `${replaceURLPath}`);

        initializeBoxPicker(accessToken); // Assuming this is your custom function
      } else {
        console.error("Could not obtain access token:", data);
      }
    })
    .catch((error) => {
      console.error(
        "Error exchanging authorization code for access token:",
        error
      );
    });
}

async function refreshAccessToken() {
  const clientId = "1n44fu5yu1l547f2n2fgcw7vhps7kvuw";
  const clientSecret = "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd";
  const url = "https://api.box.com/oauth2/token";
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken || localStorage.refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: params,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const data = await response.json();
    if (data.access_token) {
      accessToken = data.access_token;
      localStorage.accessToken = data.access_token;
      refreshToken = data.refresh_token; // Update the refresh token if a new one is returned
      localStorage.refreshToken = data.refresh_token;
      accessTokenExpiry = Date.now() + data.expires_in * 1000;
      localStorage.accessTokenExpiry = Date.now() + data.expires_in * 1000;
    } else {
      console.error("Could not refresh access token:", data);
    }
  } catch (error) {
    console.error("Error refreshing access token:", error);
  }
}

async function ensureValidAccessToken() {
  if (Date.now() >= localStorage.accessTokenExpiry) {
    await refreshAccessToken();
  }
}

async function fetchFileAsBlob(fileId) {
  await ensureValidAccessToken(); // Ensure the access token is valid

  const fileUrl = `https://api.box.com/2.0/files/${fileId}/content`;
  try {
    const response = await fetch(fileUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Network response was not ok, status: ${response.status}`
      );
    }

    return await response.blob();
  } catch (error) {
    console.error("Error fetching file from Box:", error);
    throw error;
  }
}

async function fetchFileDownloadURL(fileId, access_token) {
  const boxBasePath = "https://api.box.com/2.0";
  const ac = new AbortController();
  const signal = ac.signal;
  const downloadFile = await fetch(`${boxBasePath}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal,
  });
  ac.abort();
  return downloadFile.url;
}
function initializeBoxPicker(accessToken, folderId = "0") {
  const filePicker = new Box.FilePicker();

  const options = {
    chooseButtonLabel: "Select Image",
    cancelButtonLabel: "Cancel",
    container: "#boxFilesContainer",
    extensions: ["png", "jpg", "jpeg", "webp", "svs", "ndpi", "tif", "tiff"],
    maxSelectable: 1,
  };

  filePicker.addListener("choose", async (files) => {
    if (files.length > 0 && files[0].is_download_available) {
      resetApplication();
      const file = files[0];

      try {
        document.getElementById("loadingSpinner").style.display = "block";

        const downloadURL = await fetchFileDownloadURL(file.id, accessToken);
        document.getElementById("imageUrlInput").value = downloadURL;

        handleLoadImageUrlClick();

        // Code for downloading the file and using the file locally
        // const fileBlob = await fetchFileAsBlob(file.id, accessToken);
        // const blobFile = new File([fileBlob], file.name, { type: fileBlob.type });

        // console.log('Selected file:', file);
        // handleImageLoad(blobFile, () => segmentImage(true));
        // window.boxFile = fileBlob;
        // window.boxFileInfo = file;
      } catch (error) {
        console.error("Error processing file from Box:", error);
      }
    } else {
      console.warn("Selected file is not available for download.");
    }
  });

  filePicker.addListener("cancel", () => {
    console.info("Box file selection was canceled.");
  });

  // Go to box tab by clicking the Box Integration button
  // Find the button with the Box Integration data-target
  const boxIntegrationButton = document.querySelector(
    'button[data-target="box-upload"]'
  );

  // Simulate a click event on the button
  if (boxIntegrationButton) {
    // Check if the button exists
    boxIntegrationButton.click();

    // Hide the box login button
    document.getElementById("boxLoginBtn").style.display = "none";
  }

  filePicker.show(folderId, accessToken, options);
}

function bindEventListeners() {
  document
    .getElementById("downloadAllCoresButton")
    .addEventListener("click", () => {
      // Assuming coreOverlays is an array of your core overlay elements
      // for (const overlay of coreOverlays) {
      //   initiateDownload(overlay);
      // }

      // Check image data type
      if (
        isSimpleImageType(window.uploadedImageFileType) ||
        window.ndpiScalingFactor
      ) {
        alert(
          "Full resolution downloads are not supported for regular image files or locally uploaded .ndpi images."
        );
        return;
      }

      const exportableCores = (window.sortedCoresData || []).filter(
        (core) => !core.isMarker
      );
      if (exportableCores.length === 0) {
        downloadAllCores(exportableCores);
        return;
      }

      showExportGridWarning();
      if (
        !window.confirm(
          `${EXPORT_EMPTY_FOLDER_MESSAGE}\n\nSelect an empty folder now?`
        )
      ) {
        return;
      }

      downloadAllCores(exportableCores);
    });

  // document.querySelectorAll("input[type='number']").forEach((e) => {
  //   e.onwheel = (e) => {
  //     e.preventDefault();
  //   };
  // });

  // Event listener for the Apply Hyperparameters button
  document
    .getElementById("apply-hyperparameters")
    .addEventListener("click", applyAndVisualizeTravelingAlgorithm);

  document
    .getElementById("create-virtual-grid")
    .addEventListener("click", obtainHyperparametersAndDrawVirtualGrid);

  // Add event listeners for range inputs to show the current value
  document
    .getElementById("horizontalSpacing")
    .addEventListener("input", function () {
      document.getElementById("horizontalSpacingValue").textContent =
        this.value;
    });

  document
    .getElementById("verticalSpacing")
    .addEventListener("input", function () {
      document.getElementById("verticalSpacingValue").textContent = this.value;
    });

  // Add event listeners for range inputs to show the current value
  document.getElementById("startingX").addEventListener("input", function () {
    document.getElementById("startingXValue").textContent = this.value;
  });

  document.getElementById("startingY").addEventListener("input", function () {
    document.getElementById("startingYValue").textContent = this.value;
  });

  // JavaScript to handle the virtual grid sidebar hyperparameters and update the grid
  document
    .getElementById("applyVirtualGridSettings")
    .addEventListener("click", function () {
      const horizontalSpacing = parseInt(
        document.getElementById("horizontalSpacing").value,
        10
      );
      const verticalSpacing = parseInt(
        document.getElementById("verticalSpacing").value,
        10
      );
      const startingX = parseInt(
        document.getElementById("startingX").value,
        10
      );
      const startingY = parseInt(
        document.getElementById("startingY").value,
        10
      );

      if (isSimpleImageType(window.uploadedImageFileType)) {
        // Update the virtual grid with the new spacing values
        updateVirtualGridSpacing(
          horizontalSpacing,
          verticalSpacing,
          startingX,
          startingY
        );
      } else {
        updateVirtualGridSpacing(horizontalSpacing, verticalSpacing, 0, 0);
      }
    });

  document
    .getElementById("saveResultsAsJson")
    .addEventListener("click", function () {
      saveUpdatedCores("json");
    });

  document
    .getElementById("saveResultsAsCsv")
    .addEventListener("click", function () {
      saveUpdatedCores("csv");
    });

  document.getElementById("userRadius").addEventListener("input", function () {
    const radiusValue = document.getElementById("radiusValue");
    const userRadius = document.getElementById("userRadius").value;
    radiusValue.value = userRadius; // Update the output element with the slider value

    const imageFile = document.getElementById("fileInput").files[0];
    if ((imageFile || window.loadedImg) && window.preprocessedCores) {
      // Change the defaultRadius value of each core in window.sortedCores to the new radius
      window.sortedCoresData.forEach((core) => {
        core.currentRadius = parseInt(userRadius) / window.scalingFactor;
      });
      // If there's an image and cores data, draw the cores with the new radius
      redrawCoresForTravelingAlgorithm();
    } else {
      alert("Please load an image and JSON file first.");
    }
  });

  document.getElementById("originAngle").addEventListener("input", function () {
    const angleValue = document.getElementById("originAngle");

    document.getElementById("originAngleValue").textContent = angleValue.value;
    window.viewer.viewport.setRotation(-parseFloat(angleValue.value));
  });

  document
    .getElementById("originAngle")
    .addEventListener("mousedown", function () {
      const svgOverlay = window.viewer.svgOverlay();
      svgOverlay.node().style.display = "none"; // Hide the SVG overlay
    });

  document
    .getElementById("originAngle")
    .addEventListener("mouseup", function () {
      const svgOverlay = window.viewer.svgOverlay();
      svgOverlay.node().style.display = ""; // Show the SVG overlay
    });

  makeElementDraggable(document.getElementById("editSidebar"));

  // Close the sidebar
  document.querySelectorAll("#closeEditCoreButton").forEach((button) => {
    button.addEventListener("click", function () {
      const sidebar = this.closest(".edit-sidebar");
      sidebar.style.display = "none"; // You can toggle visibility or minimize the sidebar as required
      window.viewer.currentOverlays.forEach((o) => {
        o.element.classList.remove("selected");
      });
    });
  });

  document
    .getElementById("metadataFile")
    .addEventListener("change", handleMetadataFileSelect, false);

  // Select all close buttons
  const closeButtons = document.querySelectorAll(".close-instructions");

  // Add a click event listener to each close button
  closeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      // Hide the parent element of the clicked button
      this.parentElement.style.display = "none";
    });
  });
}

// Initialize and bind events
const initSegmentation = async () => {
  const state = await loadDependencies();
  window.state = state;
  setupUiEnhancements();

  document
    .getElementById("fileInput")
    .addEventListener("change", (e) =>
      handleImageInputChange(e, () => segmentImage(true))
    );
  document
    .getElementById("loadImageUrlBtn")
    .addEventListener("click", () => handleLoadImageUrlClick(state));

  ["input", "change"].forEach((event) => {
    document
      .getElementById("thresholdSlider")
      .addEventListener(event, () => updateSliderUIText(state));
    document
      .getElementById("maskAlphaSlider")
      .addEventListener(event, () => updateSliderUIText(state));
  });

  document
    .getElementById("applySegmentation")
    .addEventListener("click", async function () {
      // Assuming `properties` is the variable holding your segmentation results
      if (!window.properties) {
        alert("No image uploaded!");
        return;
      }

      window.actionHistory = [];
      resolvedReviewIssueKeys = new Set();
      setApplyStatus("Updating detection...", "neutral");
      await segmentImage();
    });

  document
    .getElementById("finalizeSegmentation")
    .addEventListener("click", async function () {
      // Assuming `properties` is the variable holding your segmentation results
      if (!window.properties) {
        alert("No image uploaded!");
        return;
      }

      window.state = undefined;
      const getImageInfo = async () => {
        const checkExtension = (path) =>
          hasAnyExtension(path, [
            ...SIMPLE_IMAGE_EXTENSIONS,
            ...WSI_IMAGE_EXTENSIONS,
          ]);
        const imageInfo = {
          url: "",
          type: "",
          isSimpleImage: undefined,
          isOperable: false,
        };
        if (document.getElementById("fileInput").files[0]) {
          const localFile = document.getElementById("fileInput").files[0];
          if (checkExtension(localFile.name)) {
            imageInfo.type = getImageTypeFromName(localFile.name);
            const useLocalNdpiThumbnail = imageInfo.type === "ndpi";
            imageInfo.isSimpleImage =
              isSimpleImageType(imageInfo.type) || useLocalNdpiThumbnail;
            imageInfo.isOperable = true;

            // If the image is an ndpi, pass in the URL used by the originalImage image
            if (useLocalNdpiThumbnail) {
              imageInfo.url = document.getElementById("originalImage").src;
              window.ndpiScalingFactor = window.scalingFactor;
              window.scalingFactor = 1;
            } else {
              imageInfo.url = imageInfo.isSimpleImage
                ? await loadImage(localFile)
                : document.getElementById("fileInput").files[0];
            }
          }
        } else if (getInputValue("imageUrlInput")) {
          const url = getInputValue("imageUrlInput");
          imageInfo.type =
            getImageTypeFromUrl(url) ||
            normalizeImageType(window.uploadedImageFileType || "");
          imageInfo.isSimpleImage = isSimpleImageType(imageInfo.type);
          imageInfo.isOperable = true;
          imageInfo.url = url;
        } else if (window.boxFileInfo) {
          if (checkExtension(window.boxFileInfo.name)) {
            imageInfo.type = getImageTypeFromName(window.boxFileInfo.name);
            imageInfo.isSimpleImage = isSimpleImageType(imageInfo.type);
            imageInfo.isOperable = true;
            imageInfo.url = URL.createObjectURL(window.boxFile);
          }
        }

        if (imageInfo.isOperable && !imageInfo.isSimpleImage) {
          const sourceInfo =
            window.loadedWSIInfo || (await getWSIInfo(imageInfo.url));
          imageInfo.width = sourceInfo.width;
          imageInfo.height = sourceInfo.height;
          window.loadedWSIInfo = sourceInfo;
        }

        return imageInfo;
      };
      document.getElementById("rawDataLoadingSpinner").style.display = "block";

      let tileSources = {};

      installOpenSeadragonDecodeShim();
      const imageInfo = await getImageInfo();
      if (
        imageInfo.isSimpleImage ||
        (window.uploadedImageFileType === "ndpi" &&
          window.ndpiScalingFactor !== undefined)
      ) {
        tileSources = {
          type: "image",
          url: imageInfo.url,
        };
      } else if (imageInfo.width && imageInfo.height) {
        tileSources = await createImageboxTileSource(imageInfo.url, imageInfo);
      } else {
        document.getElementById("rawDataLoadingSpinner").style.display = "none";
        alert(
          "Could not initialize the full-resolution tile viewer for this image."
        );
        return;
      }
      // document.getElementById(
      //   "osdViewer"
      // ).style.width = `${window.loadedImg.getAttribute("width")}px`;
      document.getElementById(
        "osdViewer"
      ).style.height = `${window.loadedImg.getAttribute("height")}px`;
      window.viewer?.destroy();
      window.viewer = OpenSeadragon({
        id: "osdViewer",
        visibilityRatio: 0.4,
        minZoomImageRatio: 0.4,
        tileSources,
        // prefixUrl: "https://episphere.github.io/svs/openseadragon/images/images_new/",
        gestureSettingsMouse: {
          clickToZoom: false,
        },
        crossOriginPolicy: "Anonymous",
        showNavigator: false,
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        timeout: 120 * 1000
      });
      // viewer.open(tileSources)
      const addCoreDiv = document.createElement("div");
      addCoreDiv.className = "osdViewerControlsParent";

      const addCoreBtn = document.createElement("button");
      addCoreBtn.className = "osdViewerControl";
      addCoreBtn.id = "osdViewerAddCoreBtn";
      addCoreBtn.textContent = "+ Add Core";
      window.applyTooltip?.(
        addCoreBtn,
        "Add a core manually to the gridding viewer."
      );
      addCoreDiv.appendChild(addCoreBtn);

      const labelsButton = document.createElement("button");
      labelsButton.type = "button";
      labelsButton.id = "toggleGridLabelsButton";
      labelsButton.className = "osdViewerControl";
      labelsButton.setAttribute("aria-pressed", "true");
      labelsButton.textContent = "Labels On";
      labelsButton.addEventListener("click", () => window.toggleGridLabels(labelsButton));
      addCoreDiv.appendChild(labelsButton);

      const linesButton = document.createElement("button");
      linesButton.type = "button";
      linesButton.id = "toggleGridLinesButton";
      linesButton.className = "osdViewerControl";
      linesButton.setAttribute("aria-pressed", "true");
      linesButton.textContent = "Lines On";
      linesButton.addEventListener("click", () => window.toggleGridLines(linesButton));
      addCoreDiv.appendChild(linesButton);

      const autoAssignRowColDiv = document.createElement("div");
      autoAssignRowColDiv.className = "osdViewerControl";

      const autoAssignRowColCheckbox = document.createElement("input");
      autoAssignRowColCheckbox.type = "checkbox";
      autoAssignRowColCheckbox.id = "editAutoUpdateRowsCheckbox";
      autoAssignRowColCheckbox.className = "osdViewerCheckbox";
      autoAssignRowColCheckbox.checked = true;

      const autoAssignRowColLabel = document.createElement("label");
      autoAssignRowColLabel.htmlFor = "editAutoUpdateRowsCheckbox";
      autoAssignRowColLabel.className = "osdViewerCheckboxLabel";
      autoAssignRowColLabel.innerText = "Auto Row/Col";
      const autoAssignTooltip =
        "Automatically infer row and column values while editing core placement.";
      window.applyTooltip?.(autoAssignRowColDiv, autoAssignTooltip);
      window.applyTooltip?.(autoAssignRowColCheckbox, autoAssignTooltip);
      window.applyTooltip?.(autoAssignRowColLabel, autoAssignTooltip);

      autoAssignRowColCheckbox.addEventListener("change", toggleRowInput);

      autoAssignRowColCheckbox.addEventListener("change", toggleColumnInput);


      autoAssignRowColDiv.appendChild(autoAssignRowColCheckbox);
      autoAssignRowColDiv.appendChild(autoAssignRowColLabel);

      addCoreDiv.appendChild(autoAssignRowColDiv);

      // Function to toggle the disabled state based on the checkbox
      function toggleColumnInput() {
        var editAutoUpdateColumnsCheckbox = document.getElementById(
          "editAutoUpdateColumnsCheckbox"
        );

        editAutoUpdateColumnsCheckbox.checked =
          !editAutoUpdateColumnsCheckbox.checked;
        var columnInput = document.getElementById("editColumnInput");

        // If the checkbox is checked, disable the column input
        if (editAutoUpdateColumnsCheckbox.checked) {
          columnInput.disabled = true;
        } else {
          // Otherwise, enable it
          columnInput.disabled = false;
        }
      }

      function toggleRowInput() {
        var editAutoUpdateRowsCheckbox = document.getElementById(
          "editAutoUpdateRowsCheckbox"
        );
        var rowInput = document.getElementById("editRowInput");

        // If the checkbox is checked, disable the column input
        if (editAutoUpdateRowsCheckbox.checked) {
          rowInput.disabled = true;
        } else {
          // Otherwise, enable it
          rowInput.disabled = false;
        }
      }

      window.viewer.addControl(
        addCoreDiv,
        {
          anchor: OpenSeadragon.ControlAnchor["TOP_RIGHT"],
        },
        window.viewer.controls.topRight
      );
      addCoreDiv.style.display = "flex";

      window.viewer.addOnceHandler("open", () => {
        let gridStarted = false;
        const startGrid = () => {
          if (gridStarted) {
            return;
          }

          gridStarted = true;
          document.getElementById("rawDataLoadingSpinner").style.display =
            "none";

          document.getElementById("rawDataTabButton").disabled = false;
          document.getElementById("rawDataTabButton").click();
          preprocessForTravelingAlgorithm();
          setTimeout(renderReviewPanel, 0);
        };

        window.viewer.addOnceHandler("tile-drawn", startGrid);
        requestAnimationFrame(() => requestAnimationFrame(startGrid));
      });
    });

  document.getElementById("helpButton").addEventListener("click", function () {
    // Get all tabcontent elements
    var tabContents = document.getElementsByClassName("tabcontent");
    // Loop through all tabcontent elements to find the active one
    for (var i = 0; i < tabContents.length; i++) {
      // Check if the current tabcontent is displayed (active)
      if (tabContents[i].style.display === "block") {
        // Find all instructions containers within the active tabcontent
        var instructionElements = tabContents[i].getElementsByClassName(
          "instructions-container"
        );
        // Loop through each instructions container and toggle its display
        for (var j = 0; j < instructionElements.length; j++) {
          if (
            instructionElements[j].style.display === "none" ||
            instructionElements[j].style.display === ""
          ) {
            instructionElements[j].style.display = "block";
          } else {
            instructionElements[j].style.display = "none";
          }
        }
        break; // Stop looping once the active tabcontent is found and handled
      }
    }
  });
};

document.querySelectorAll("input[type='number']").forEach((e) => {
  e.onwheel = (e) => {
    if (document.activeElement === e.target) {
      e.target.blur();
    }
  };

  document.getElementById("drop-area").ondrop = (e) => {
    resetApplication();
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    const files = dt.files;
    document.getElementById("imageUrlInput").value = null;
    document.getElementById("fileInput").files = files;
    handleImageLoad(files[0], () => segmentImage(true));
  };
});

async function downloadAllCores(cores) {
  const {default: JSZip} = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")

  if (!cores || cores.length === 0) {
    alert("No placed cores are available to export.");
    return;
  }

  const svsImageURL = document.getElementById("imageUrlInput").value
    ? document.getElementById("imageUrlInput").value
    : document.getElementById("fileInput").files.length > 0
      ? document.getElementById("fileInput").files[0]
      : window.boxFileInfo
        ? URL.createObjectURL(window.boxFile)
        : "path/to/default/image.jpg";

  // Prepare progress overlay
  const overlay = document.getElementById("progressOverlay");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  // Allow user to choose the download folder
  // let downloadFolder;
  // try {
  //   downloadFolder = await window.showDirectoryPicker();
  // } catch (error) {
  //   console.error("User cancelled folder selection:", error);
  //   return;
  // }

  // let selectedFolderHasEntries = false;
  // try {
  //   selectedFolderHasEntries = await directoryHasEntries(downloadFolder);
  // } catch (error) {
  //   console.warn("Could not verify whether the export folder is empty:", error);
  // }

  // if (selectedFolderHasEntries) {
  //   showExportGridWarning(EXPORT_NON_EMPTY_FOLDER_MESSAGE);
  //   alert(EXPORT_NON_EMPTY_FOLDER_MESSAGE);
  //   return;
  // }

  overlay.style.display = "flex";
  progressBar.style.width = "0%";
  progressText.innerText = "Starting download...";

  // Function to download a single core
  // async function downloadCore(core, index) {
  //   const topLeftX = parseInt(core.x - core.currentRadius);
  //   const topLeftY = parseInt(core.y - core.currentRadius);
  //   const tileWidth = parseInt(core.currentRadius * 2);
  //   const tileHeight = parseInt(core.currentRadius * 2);

  //   // if (window.uploadedImageFileType === "ndpi") {
  //   //   const apiURL = `https://imageboxv2-oxxe7c4jbq-uc.a.run.app/iiif/?format=ndpi&iiif=${svsImageURL}/${topLeftX},${topLeftY},${tileWidth},${tileHeight}/${Math.min(tileWidth, 3192)},/0/default.jpg`;
  //   //   const response = await fetch(apiURL);
  //   //   const blob = await response.blob();
  //   //   const fileName = `core_${core.row + 1}_${core.col + 1}.jpg`;
  //   //   const fileHandle = await downloadFolder.getFileHandle(fileName, { create: true });
  //   //   const writable = await fileHandle.createWritable();
  //   //   await writable.write(blob);
  //   //   await writable.close();
  //   // } else {
  //     const fullResTileParams = {
  //       tileX: topLeftX,
  //       tileY: topLeftY,
  //       tileWidth: tileWidth,
  //       tileHeight: tileHeight,
  //       tileSize: tileWidth,
  //     };
  //     const fullSizeImageResp = await getRegionFromWSI(svsImageURL, fullResTileParams);
  //     const blob = await coerceImageResponseToBlob(fullSizeImageResp);
  //     const blobURL = URL.createObjectURL(blob)
  //     const fileName = `core_${core.row + 1}_${core.col + 1}.jpg`;
  //     // const fileHandle = await downloadFolder.getFileHandle(fileName, { create: true });
  //     // const writable = await fileHandle.createWritable();
  //     // await writable.write(blob);
  //     // await writable.close();
  //     const downloadElement = document.createElement("a")
  //     downloadElement.setAttribute("href", blobURL)
  //     downloadElement.setAttribute("download", fileName)
  //     downloadElement.click()
  //     URL.revokeObjectURL(blobURL)

  //   // }
  // }

  async function downloadCoreRow(row, rowCores) {

    const zip = new JSZip();

    for (let index = 0; index < rowCores.length; index++) {
      const core = rowCores[index];

      const topLeftX = parseInt(core.x - core.currentRadius);
      const topLeftY = parseInt(core.y - core.currentRadius);
      const tileWidth = parseInt(core.currentRadius * 2);
      const tileHeight = parseInt(core.currentRadius * 2);

      const fullResTileParams = {
        tileX: topLeftX,
        tileY: topLeftY,
        tileWidth: tileWidth,
        tileHeight: tileHeight,
        tileSize: tileWidth,
      };

      const fullSizeImageResp = await getRegionFromWSI(
        svsImageURL,
        fullResTileParams
      );

      const blob = await coerceImageResponseToBlob(fullSizeImageResp);

      const fileName = `core_${core.row + 1}_${core.col + 1}.jpg`;

      zip.file(fileName, blob);

      const progress = ((index + 1) / rowCores.length) * 100;
      progressBar.style.width = `${progress}%`;
      progressText.innerText =
        `Preparing row ${row + 1}... (${index + 1}/${rowCores.length})`;
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "STORE"
    });

    const blobURL = URL.createObjectURL(zipBlob);

    const downloadElement = document.createElement("a");
    downloadElement.href = blobURL;
    downloadElement.download = `row_${row + 1}.zip`;

    document.body.appendChild(downloadElement);
    downloadElement.click();
    downloadElement.remove();

    setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
  }

  // // Download cores sequentially
  // for (let index = 0; index < cores.length; index++) {
  //   await downloadCore(cores[index], index);
  //   const progress = ((index + 1) / cores.length) * 100;
  //   progressBar.style.width = `${progress}%`;
  //   progressText.innerText = `Downloading... (${index + 1}/${cores.length})`;
  // }

  const coresByRow = cores.reduce((groups, core) => {
    if (!groups[core.row]) {
      groups[core.row] = [];
    }

    groups[core.row].push(core);
    return groups;
  }, {});

  const rows = Object.keys(coresByRow)
    .sort((a, b) => Number(a) - Number(b));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const rowCores = coresByRow[row];

    await downloadCoreRow(row, rowCores);

    const progress = ((rowIndex + 1) / rows.length) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.innerText =
      `Downloading... (${rowIndex + 1}/${rows.length} rows)`;
  }

  // Hide progress overlay and reset progress bar
  overlay.style.display = "none";
  progressBar.style.width = "0%";
  progressText.innerText = "Download complete!";
}

// Main function that runs the application
const run = async () => {
  bindEventListeners();

  initSegmentation();
};

run();
