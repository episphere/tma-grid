import { getHyperparametersFromUI } from "./UI.js";
import {
  rotatePoint,
  runTravelingAlgorithm,
  updateSpacingInVirtualGrid,
} from "./data_processing.js";

import {
  filterEdgesByLength,
  getEdgesFromTriangulation,
  preprocessCores,
} from "./delaunay_triangulation.js";

import { positionSidebarNextToCore, hideSidebar, showPopup } from "./UI.js";

import * as tf from "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/+esm";

import { getRegionFromWSI } from "./wsi.js";

// const OSD_WIDTH_SCALEDOWN_FACTOR_FOR_EDIT_SIDEBAR = 0.8; // Adjust for the 20% width of the add core sidebar.

const coerceImageResponseToBlob = async (imageResponse) => {
  if (imageResponse instanceof Blob) {
    return imageResponse;
  }

  if (typeof imageResponse?.blob === "function") {
    return await imageResponse.blob();
  }

  throw new Error("Image response did not contain a readable image blob.");
};

const getCoreRegionParams = (core, tileSize) => {
  const imageWidth = window.loadedWSIInfo?.width;
  const imageHeight = window.loadedWSIInfo?.height;
  const left = Math.floor(core.x - core.currentRadius);
  const top = Math.floor(core.y - core.currentRadius);
  const right = Math.ceil(core.x + core.currentRadius);
  const bottom = Math.ceil(core.y + core.currentRadius);
  const clampedLeft = Math.max(0, left);
  const clampedTop = Math.max(0, top);
  const clampedRight = Number.isFinite(imageWidth)
    ? Math.min(imageWidth, right)
    : right;
  const clampedBottom = Number.isFinite(imageHeight)
    ? Math.min(imageHeight, bottom)
    : bottom;

  return {
    tileX: clampedLeft,
    tileY: clampedTop,
    tileWidth: Math.max(1, clampedRight - clampedLeft),
    tileHeight: Math.max(1, clampedBottom - clampedTop),
    tileSize: Math.max(1, Math.round(tileSize)),
  };
};

let lastActionTime = 0;
const actionDebounceInterval = 500; // milliseconds

// Pure function to get input values
const getInputValue = (inputId) => document.getElementById(inputId).value;

const WORKSPACE_STATUS_STATES = [
  "is-empty",
  "is-error",
  "is-loading",
  "is-success",
];

function setWorkspaceStatus(elementId, state, title, detail = "") {
  const statusElement = document.getElementById(elementId);
  if (!statusElement) {
    return;
  }

  statusElement.hidden = false;
  statusElement.classList.remove(...WORKSPACE_STATUS_STATES);
  statusElement.classList.add(`is-${state}`);
  statusElement.setAttribute(
    "aria-busy",
    state === "loading" ? "true" : "false"
  );

  const titleElement = statusElement.querySelector("[data-status-title]");
  const detailElement = statusElement.querySelector("[data-status-detail]");
  if (titleElement) {
    titleElement.textContent = title;
  }
  if (detailElement) {
    detailElement.textContent = detail;
  }
}

function clearWorkspaceStatus(elementId) {
  const statusElement = document.getElementById(elementId);
  if (!statusElement) {
    return;
  }

  statusElement.hidden = true;
  statusElement.setAttribute("aria-busy", "false");
}

const setGriddingStatus = (state, title, detail = "") =>
  setWorkspaceStatus("griddingStatus", state, title, detail);
const clearGriddingStatus = () => clearWorkspaceStatus("griddingStatus");
const setVirtualGridStatus = (state, title, detail = "") =>
  setWorkspaceStatus("virtualGridStatus", state, title, detail);
const clearVirtualGridStatus = () => clearWorkspaceStatus("virtualGridStatus");

const INTERNAL_METADATA_FIELDS = new Set([
  "markerGridRow",
  "markerGridSide",
  "assignmentResidual",
  "assignmentConfidence",
]);

function isExportedMetadataField(key, value) {
  return !INTERNAL_METADATA_FIELDS.has(key) && value !== undefined;
}

function sanitizeCoreMetadata(core) {
  return Object.fromEntries(
    Object.entries(core).filter(([key, value]) =>
      isExportedMetadataField(key, value)
    )
  );
}

const METADATA_FIELD_TOOLTIPS = {
  row: "The core's one-based row number in the exported grid.",
  col: "The core's one-based column number in the exported grid.",
  column: "The core's one-based column number in the exported grid.",
  x: "Horizontal center position of this core in source image pixels.",
  y: "Vertical center position of this core in source image pixels.",
  area: "Detected tissue region area from segmentation.",
  radius: "Detected core radius used for outlines and crops.",
  currentradius: "Core radius used for outlines and exported crops.",
  annotations: "Free-text notes for this core.",
  annotation: "Free-text notes for this core.",
  isimaginary: "Marks a missing placeholder core used to preserve grid spacing.",
  ismarker: "Marks an orientation or control marker instead of a specimen core.",
  offgridmarker: "Marker core kept outside the main row and column lattice.",
  autoassignedmarker: "Marker status or position was inferred automatically.",
  needsreview: "This core was flagged for manual review after automatic placement.",
};

function normalizeMetadataKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getMetadataTooltip(key, rowKeyName, colKeyName) {
  const normalizedKey = normalizeMetadataKey(key);
  const normalizedRowKey = normalizeMetadataKey(rowKeyName || "row");
  const normalizedColKey = normalizeMetadataKey(colKeyName || "col");

  if (normalizedKey === normalizedRowKey) {
    return "The core's one-based row number in the exported grid.";
  }

  if (normalizedKey === normalizedColKey) {
    return "The core's one-based column number in the exported grid.";
  }

  if (METADATA_FIELD_TOOLTIPS[normalizedKey]) {
    return METADATA_FIELD_TOOLTIPS[normalizedKey];
  }

  if (normalizedKey.includes("radius")) {
    return "Core radius used for outlines and exported crops.";
  }

  if (normalizedKey.includes("marker")) {
    return "Marker-related status used for orientation or grid review.";
  }

  if (normalizedKey.includes("imaginary") || normalizedKey.includes("missing")) {
    return "Missing-core status used to preserve row and column spacing.";
  }

  if (normalizedKey.includes("review")) {
    return "Review status used to flag cores that may need manual checking.";
  }

  if (normalizedKey.includes("annotation") || normalizedKey.includes("note")) {
    return "Notes that will be included in exported metadata.";
  }

  if (
    normalizedKey.includes("stain") ||
    normalizedKey.includes("antibody") ||
    normalizedKey.includes("biomarker")
  ) {
    return "Stain, antibody, or biomarker information for this core.";
  }

  if (
    normalizedKey.includes("patient") ||
    normalizedKey.includes("donor") ||
    normalizedKey.includes("case") ||
    normalizedKey.includes("subject")
  ) {
    return "Case or donor identifier associated with this core.";
  }

  if (
    normalizedKey.includes("sample") ||
    normalizedKey.includes("specimen") ||
    normalizedKey.includes("tissue") ||
    normalizedKey.includes("block")
  ) {
    return "Sample or specimen information associated with this core.";
  }

  if (
    normalizedKey.includes("image") ||
    normalizedKey.includes("slide") ||
    normalizedKey.includes("file")
  ) {
    return "Source image, slide, or file information for this core.";
  }

  return "Metadata value for this selected core. It will be included in exports.";
}

function applyElementTooltip(element, text, options = {}) {
  if (window.applyTooltip) {
    window.applyTooltip(element, text, options);
    return;
  }

  if (element && text) {
    element.dataset.tooltip = text;
  }
}

// Global variables to hold the history for undo and redo
window.actionHistory = [];
let currentActionIndex = -1;

let MIN_CORE_WIDTH_PROPORTION = 0.01;
let temporaryOverlayCounter = 0;

function getCoreOverlayId(index) {
  if (Number.isInteger(index) && index >= 0) {
    return `core_overlay_${index}`;
  }

  temporaryOverlayCounter += 1;
  return `core_overlay_temp_${temporaryOverlayCounter}`;
}

function setCoreOverlayMetadata(overlayElement, core, index) {
  overlayElement.dataset.coreIndex = Number.isInteger(index) ? `${index}` : "-1";
  overlayElement.dataset.row = Number.isFinite(core.row) ? `${core.row}` : "";
  overlayElement.dataset.col = Number.isFinite(core.col) ? `${core.col}` : "";
}

function getCoreFromOverlayElement(overlayElement) {
  if (!overlayElement) {
    return { core: null, index: -1 };
  }

  const coreIndex = parseInt(overlayElement.dataset.coreIndex, 10);
  if (
    Number.isInteger(coreIndex) &&
    coreIndex >= 0 &&
    window.sortedCoresData?.[coreIndex]
  ) {
    return {
      core: window.sortedCoresData[coreIndex],
      index: coreIndex,
    };
  }

  const row = parseInt(overlayElement.dataset.row, 10);
  const col = parseInt(overlayElement.dataset.col, 10);
  if (Number.isInteger(row) && Number.isInteger(col)) {
    const fallbackIndex = window.sortedCoresData?.findIndex(
      (core) => Number(core.row) === row && Number(core.col) === col
    );

    if (fallbackIndex >= 0) {
      return {
        core: window.sortedCoresData[fallbackIndex],
        index: fallbackIndex,
      };
    }
  }

  return { core: null, index: -1 };
}

function getMousePosition(event, canvasID = "coreCanvas") {
  const canvas = document.getElementById(canvasID);
  // Calculate scale factors based on the actual size of the canvas
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  // Adjust mouse coordinates with scale factors
  const adjustedX = (event.clientX - rect.left) * scaleX;
  const adjustedY = (event.clientY - rect.top) * scaleY;
  return [adjustedX, adjustedY];
}

function handleCanvasClick(event) {
  const [offsetX, offsetY] = getMousePosition(
    event,
    "segmentationResultsCanvas"
  );
  const editMode = window.segmentationEditMode || "add";

  if (editMode === "inspect") {
    return;
  }

  if (event.shiftKey || editMode === "remove") {
    // If the shift key is pressed, remove a core
    removeCore(offsetX, offsetY);
  } else {
    // Otherwise, add a core
    addCore(offsetX, offsetY);
  }
}

// Function to update or create the properties download link
function updatePropertiesDownloadLink() {
  const fileName = document.getElementById("file-name").textContent.split(".")[0];

  
  let propertiesDownloadLink = document.getElementById('propertiesDownloadLink');
  
  if (!propertiesDownloadLink) {
    // Create a new download link if it doesn't exist
    propertiesDownloadLink = document.createElement('a');
    propertiesDownloadLink.id = 'propertiesDownloadLink';
    propertiesDownloadLink.style.display = 'block';
    propertiesDownloadLink.style.marginTop = '10px';
    document.body.appendChild(propertiesDownloadLink);
  }

  // Update the link's properties
  const blob = new Blob([JSON.stringify(window.properties, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  
  propertiesDownloadLink.href = url;
  propertiesDownloadLink.download = 'CK56_' + fileName + '.json';
  propertiesDownloadLink.textContent = 'Download window.properties';

  // Clean up the old object URL if it exists
  if (propertiesDownloadLink.dataset.oldUrl) {
    URL.revokeObjectURL(propertiesDownloadLink.dataset.oldUrl);
  }
  
  // Store the new URL for future cleanup
  propertiesDownloadLink.dataset.oldUrl = url;

  // Set up cleanup for when the link is clicked
  propertiesDownloadLink.onclick = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      propertiesDownloadLink.dataset.oldUrl = '';
    }, 100);
  };
}


// Function to add a core
function addCore(x, y) {
  // Get the radius of the first core in properties
  const firstCoreRadius = window.properties[0].radius;

  const newCore = { x, y, radius: firstCoreRadius }; // Set radius as needed
  window.properties.push(newCore);
  window.preprocessedCores = preprocessCores(window.properties);
  recordAction({ type: "add", core: newCore });
  redrawCanvas();
  updatePropertiesDownloadLink();
}

// Function to remove the nearest core
function removeCore(x, y) {
  const indexToRemove = findNearestCoreIndex(x, y);
  if (indexToRemove !== -1) {
    const removedCore = window.properties.splice(indexToRemove, 1)[0];
    window.preprocessedCores = preprocessCores(window.properties);
    recordAction({ type: "remove", core: removedCore });
    redrawCanvas();
  }
  updatePropertiesDownloadLink();
}

// Function to record actions for undo/redo
function recordAction(action) {
  if (currentActionIndex < window.actionHistory.length - 1) {
    window.actionHistory = window.actionHistory.slice(
      0,
      currentActionIndex + 1
    );
  }
  window.actionHistory.push(action);
  currentActionIndex++;
}

// Undo and Redo Functions
function undo() {
  if (currentActionIndex >= 0) {
    const action = window.actionHistory[currentActionIndex];
    revertAction(action);
    currentActionIndex--;
    redrawCanvas();
  }
}

function redo() {
  if (currentActionIndex < window.actionHistory.length - 1) {
    currentActionIndex++;
    const action = window.actionHistory[currentActionIndex];
    applyAction(action);
    redrawCanvas();
  }
}

// Helper functions to revert or apply actions
function revertAction(action) {
  if (action.type === "add") {
    window.properties.pop();
  } else if (action.type === "remove") {
    window.properties.push(action.core);
  }
}

function applyAction(action) {
  if (action.type === "add") {
    window.properties.push(action.core);
  } else if (action.type === "remove") {
    const indexToRemove = findNearestCoreIndex(action.core.x, action.core.y);
    if (indexToRemove !== -1) {
      window.properties.splice(indexToRemove, 1);
    }
  }
}

function drawProperties(ctx, properties) {
  // Convert properties to an array if it's not already one
  if (!Array.isArray(properties)) {
    properties = Object.values(properties);
  }

  properties.forEach((prop) => {
    ctx.beginPath();
    ctx.arc(prop.x, prop.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();
  });
}

async function processPredictions(predictions) {
  const resizedPredictions = tf.tidy(() => {
    const clippedPredictions = predictions.clipByValue(0, 1);
    return tf.image.resizeBilinear(
      clippedPredictions,
      [1024, 1024]
    ).squeeze();
  });
  const data = await resizedPredictions.data();
  const [height, width] = resizedPredictions.shape;
  resizedPredictions.dispose();

  return { data, width, height };
}

function drawMask(ctx, mask, alpha, width, height) {
  if (!mask || alpha <= 0) {
    return;
  }

  // Create a temporary canvas to draw the mask
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");

  // Set the dimensions of the mask canvas
  maskCanvas.width = width;
  maskCanvas.height = height;

  // Create ImageData to store mask pixels
  const maskImageData = maskCtx.createImageData(width, height);
  const maskData = maskImageData.data;
  const sourceData = mask.data || [];
  const sourceWidth = mask.width || width;
  const sourceHeight = mask.height || height;
  const shouldCropPaddedMask = width <= sourceWidth && height <= sourceHeight;
  const scaleX = shouldCropPaddedMask ? 1 : sourceWidth / width;
  const scaleY = shouldCropPaddedMask ? 1 : sourceHeight / height;

  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * scaleY));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * scaleX));
      const maskValue = sourceData[sourceY * sourceWidth + sourceX] || 0;
      const index = (y * width + x) * 4;
      maskData[index] = 255; // Red
      maskData[index + 1] = 0; // Green
      maskData[index + 2] = 0; // Blue
      maskData[index + 3] = maskValue * 255; // Alpha channel
    }
  }

  // Put the mask ImageData onto the mask canvas
  maskCtx.putImageData(maskImageData, 0, 0);

  // Now draw the mask canvas onto the main canvas with the specified alpha
  ctx.globalAlpha = alpha;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalAlpha = 1.0; // Reset globalAlpha to full opacity
}

// Utility function to redraw the canvas
function redrawCanvas() {
  const maskAlpha = parseFloat(getInputValue("maskAlphaSlider"));
  const originalImageContainer = document.getElementById("originalImage");

  visualizeSegmentationResults(
    originalImageContainer,
    window.thresholdedPredictions,
    window.properties,
    "segmentationResultsCanvas",
    maskAlpha
  );
}

// Function to find the nearest core index
function findNearestCoreIndex(x, y) {
  let nearestIndex = -1;
  let minDistance = Infinity;
  window.properties.forEach((core, index) => {
    const distance = Math.sqrt((core.x - x) ** 2 + (core.y - y) ** 2);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

window.neuralNetworkResult = null;

async function visualizeSegmentationResults(
  originalImage,
  predictions,
  properties,
  canvasID,
  alpha = 0.3
) {
  const [width, height] = [
    originalImage.naturalWidth,
    originalImage.naturalHeight,
  ];

  const canvas = document.getElementById(canvasID);
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  canvas.maxwidth = "100%";
  canvas.maxheight = "100%";

  ctx.drawImage(originalImage, 0, 0, width, height);

  const segmentationOutput = await processPredictions(predictions);

  drawMask(ctx, segmentationOutput, alpha, width, height);
  drawProperties(ctx, properties);

  addSegmentationCanvasEventListeners(canvas);
}

function addSegmentationCanvasEventListeners(canvas) {
  if (canvas.dataset.segmentationEventsBound === "true") {
    return;
  }

  canvas.dataset.segmentationEventsBound = "true";
  canvas.addEventListener("mousedown", function (event) {
    // Throttle clicks to avoid rapid repeated actions if necessary
    const currentTime = Date.now();
    if (currentTime - lastActionTime > actionDebounceInterval) {
      handleCanvasClick(event); // Call the click handling function
      lastActionTime = currentTime;
    }
  });
}

function drawCoresOnCanvasForTravelingAlgorithm() {
  document
    .getElementById("osdViewerAddCoreBtn")
    .removeEventListener("click", addCoreHandler);

  document
    .getElementById("osdViewerAddCoreBtn")
    .addEventListener("click", addCoreHandler);
  drawCores();
}
function getCoreGridKey(row, col) {
  return `${row}:${col}`;
}

function buildCoreGridIndex(coresData) {
  const coreGridIndex = new Map();

  coresData.forEach((core) => {
    if (core.isMarker) {
      return;
    }

    const row = Number(core.row);
    const col = Number(core.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return;
    }

    const key = getCoreGridKey(row, col);
    const existingCore = coreGridIndex.get(key);
    if (!existingCore || (existingCore.isImaginary && !core.isImaginary)) {
      coreGridIndex.set(key, core);
    }
  });

  return coreGridIndex;
}

function findCoreByGridPosition(row, col, coreGridIndex = null) {
  if (coreGridIndex) {
    return coreGridIndex.get(getCoreGridKey(row, col));
  }

  return window.sortedCoresData.find(
    (core) => Number(core.row) === row && Number(core.col) === col
  );
}

function connectAdjacentCores(
  core,
  updateSurroundings = false,
  coreGridIndex = null
) {
  if (
    !document.getElementById("connectCoresCheckbox").checked ||
    core.isMarker
  ) {
    // If the checkbox is checked, draw lines between adjacent cores
    return;
  }

  const coreRow = Number(core.row);
  const coreCol = Number(core.col);
  if (!Number.isFinite(coreRow) || !Number.isFinite(coreCol)) {
    return;
  }
  // Find adjacent cores based on row and column
  const adjacentPositions = [
    [1, 0],
    [0, 1],
  ];

  if (updateSurroundings) {
    adjacentPositions.push([-1, 0]);
    adjacentPositions.push([0, -1]);
  }

  adjacentPositions.forEach((pos) => {
    const adjacentCore = findCoreByGridPosition(
      coreRow + pos[0],
      coreCol + pos[1],
      coreGridIndex
    );
    if (adjacentCore) {
      const startCore =
        core.row <= adjacentCore.row && core.col <= adjacentCore.col
          ? core
          : adjacentCore;
      const endCore = startCore === adjacentCore ? core : adjacentCore;

      const svgOverlay = window.viewer.svgOverlay();

      const point1 = window.viewer.viewport.imageToViewportCoordinates(
        new OpenSeadragon.Point(
          startCore.x + (endCore.col - startCore.col) * startCore.currentRadius,
          startCore.y + (endCore.row - startCore.row) * startCore.currentRadius
        )
      );
      const point2 = window.viewer.viewport.imageToViewportCoordinates(
        new OpenSeadragon.Point(
          endCore.x - (endCore.col - startCore.col) * endCore.currentRadius,
          endCore.y - (endCore.row - startCore.row) * endCore.currentRadius
        )
      );
      const id = `line_rowStart_${startCore.row}_colStart_${startCore.col}_rowEnd_${endCore.row}_colEnd_${endCore.col}`;
      let line = svgOverlay.node().querySelector(`line#${id}`);

      if (!line) {
        line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        svgOverlay.node().appendChild(line);
      }

      line.id = id;
      line.setAttribute("x1", point1.x);
      line.setAttribute("y1", point1.y);
      line.setAttribute("x2", point2.x);
      line.setAttribute("y2", point2.y);
      line.setAttribute("stroke", "black");
      line.setAttribute(
        "stroke-width",
        Math.min(
          window.viewer.viewport.imageToViewportCoordinates(100, 100).x /
            window.viewer.viewport.getZoom(),
          0.001
        )
      );
    }
  });
}

const drawResizeHandles = (overlay, show = true) => {
  const resizeHandleTL_Id = `coreResizeHandle_topLeft`;
  const resizeHandleTR_Id = `coreResizeHandle_topRight`;
  const resizeHandleBL_Id = `coreResizeHandle_bottomLeft`;
  const resizeHandleBR_Id = `coreResizeHandle_bottomRight`;

  let overlayResizeHandleTL = overlay.element.querySelector(
    `#${resizeHandleTL_Id}`
  );
  let overlayResizeHandleTR = overlay.element.querySelector(
    `#${resizeHandleTR_Id}`
  );
  let overlayResizeHandleBL = overlay.element.querySelector(
    `#${resizeHandleBL_Id}`
  );
  let overlayResizeHandleBR = overlay.element.querySelector(
    `#${resizeHandleBR_Id}`
  );

  overlayResizeHandleTL?.parentElement.removeChild(overlayResizeHandleTL);
  overlayResizeHandleTR?.parentElement.removeChild(overlayResizeHandleTR);
  overlayResizeHandleBL?.parentElement.removeChild(overlayResizeHandleBL);
  overlayResizeHandleBR?.parentElement.removeChild(overlayResizeHandleBR);

  overlay["trackers"]?.forEach((tracker) => tracker.destroy());
  overlay["trackers"] = [];

  if (show) {
    overlayResizeHandleTL = document.createElement("div");
    overlayResizeHandleTL.className = "coreResizeHandle topLeft";
    overlayResizeHandleTL.id = resizeHandleTL_Id;
    overlayResizeHandleTL.style.top = "-5px";
    overlayResizeHandleTL.style.left = "-5px";
    overlayResizeHandleTL.style.pointerEvents = "auto";

    overlayResizeHandleTR = document.createElement("div");
    overlayResizeHandleTR.className = "coreResizeHandle topRight";
    overlayResizeHandleTR.id = resizeHandleTR_Id;
    overlayResizeHandleTR.style.top = "-5px";
    overlayResizeHandleTR.style.right = "-5px";
    overlayResizeHandleTR.style.pointerEvents = "auto";

    overlayResizeHandleBL = document.createElement("div");
    overlayResizeHandleBL.className = "coreResizeHandle bottomLeft";
    overlayResizeHandleBL.id = resizeHandleBL_Id;
    overlayResizeHandleBL.style.bottom = "-5px";
    overlayResizeHandleBL.style.left = "-5px";
    overlayResizeHandleBL.style.pointerEvents = "auto";

    overlayResizeHandleBR = document.createElement("div");
    overlayResizeHandleBR.className = "coreResizeHandle bottomRight";
    overlayResizeHandleBR.id = resizeHandleBR_Id;
    overlayResizeHandleBR.style.bottom = "-5px";
    overlayResizeHandleBR.style.right = "-5px";
    overlayResizeHandleBR.style.pointerEvents = "auto";

    [
      overlayResizeHandleTL,
      overlayResizeHandleTR,
      overlayResizeHandleBL,
      overlayResizeHandleBR,
    ].forEach((resizeHandle) => {
      const tracker = new OpenSeadragon.MouseTracker({
        element: resizeHandle,
        userData: overlay.getBounds(window.viewer.viewport),
        preprocessEventHandler: (e) => {
          if (e.eventType === "drag") {
            e.stopPropagation = true;
            e.preventDefault = true;
          }
        },
        dragHandler: (e) => {
          let { x, y, width, height } = overlay.getBounds(
            window.viewer.viewport
          );

          const delta = window.viewer.viewport.deltaPointsFromPixels(e.delta);
          const factorToResizeBy = delta.y;

          const viewportBounds = window.viewer.viewport.getConstrainedBounds();
          const resizeHandleLocation = resizeHandle.id.split("_").slice(-1)[0];

          switch (resizeHandleLocation) {
            case "topLeft":
              if (-Math.PI <= e.direction && e.direction <= -Math.PI / 2) {
                x = Math.max(x + factorToResizeBy, viewportBounds.x);
                y = Math.max(y + factorToResizeBy, viewportBounds.y);
                width = Math.min(
                  width - factorToResizeBy,
                  viewportBounds.width
                );
                height = Math.min(
                  height - factorToResizeBy,
                  viewportBounds.height
                );
              } else if (0 <= e.direction && e.direction <= Math.PI / 2) {
                x = Math.min(
                  x + factorToResizeBy,
                  viewportBounds.width - MIN_CORE_WIDTH_PROPORTION
                );
                y = Math.min(
                  y + factorToResizeBy,
                  viewportBounds.height - MIN_CORE_WIDTH_PROPORTION
                );
                width = Math.max(
                  width - factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
                height = Math.max(
                  height - factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
              }
              break;

            case "topRight":
              if (-Math.PI / 2 <= e.direction && e.direction <= 0) {
                y = Math.max(y + factorToResizeBy, viewportBounds.y);
                width = Math.min(
                  width - factorToResizeBy,
                  viewportBounds.width
                );
                height = Math.min(
                  height - factorToResizeBy,
                  viewportBounds.height
                );
              } else if (Math.PI / 2 <= e.direction && e.direction <= Math.PI) {
                y = Math.min(
                  y + factorToResizeBy,
                  viewportBounds.height - MIN_CORE_WIDTH_PROPORTION
                );
                width = Math.max(
                  width - factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
                height = Math.max(
                  height - factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
              }
              break;

            case "bottomRight":
              if (0 <= e.direction && e.direction <= Math.PI / 2) {
                width = Math.min(
                  width + factorToResizeBy,
                  viewportBounds.width
                );
                height = Math.min(
                  height + factorToResizeBy,
                  viewportBounds.height
                );
              } else if (
                -Math.PI <= e.direction &&
                e.direction <= -Math.PI / 2
              ) {
                width = Math.max(
                  width + factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
                height = Math.max(
                  height + factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
              }
              break;

            case "bottomLeft":
              if (Math.PI / 2 <= e.direction && e.direction <= Math.PI) {
                x = Math.max(x - factorToResizeBy, viewportBounds.x);
                width = Math.min(
                  width + factorToResizeBy,
                  viewportBounds.width
                );
                height = Math.min(
                  height + factorToResizeBy,
                  viewportBounds.height
                );
              } else if (-Math.PI / 2 <= e.direction && e.direction <= 0) {
                x = Math.min(
                  x - factorToResizeBy,
                  viewportBounds.width - MIN_CORE_WIDTH_PROPORTION
                );
                width = Math.max(
                  width + factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
                height = Math.max(
                  height + factorToResizeBy,
                  MIN_CORE_WIDTH_PROPORTION
                );
              }
              break;

            default:
              break;
          }
          overlay.update(new OpenSeadragon.Rect(x, y, width, height));
          overlay.drawHTML(
            overlay.element.parentElement,
            window.viewer.viewport
          );

          if (!overlay.element.classList.contains("temporary")) {
            const { core, index: coreIndex } = getCoreFromOverlayElement(
              overlay.element
            );
            if (core && coreIndex !== -1) {
              const overlayBoundsInImageCoords =
                window.viewer.viewport.viewportToImageRectangle(
                  overlay.getBounds(window.viewer.viewport)
                );
              core.x =
                overlayBoundsInImageCoords.x +
                overlayBoundsInImageCoords.width / 2;
              core.y =
                overlayBoundsInImageCoords.y +
                overlayBoundsInImageCoords.height / 2;
              core.currentRadius = overlayBoundsInImageCoords.width / 2;
              connectAdjacentCores(core, true);
              updateSidebar(core);
            }
          }
        },
        dragEndHandler: (e) => {},
      });
      overlay["trackers"].push(tracker);
      overlay.element.appendChild(resizeHandle);
    });
  }
};

function drawCores() {
  window.viewer.clearOverlays();
  window.viewer.svgOverlay().node().replaceChildren();
  window.viewer.removeAllHandlers("zoom");
  window.viewer.addHandler("zoom", (e) => {
    window.viewer
      .svgOverlay()
      .node()
      .querySelectorAll("line")
      .forEach((element) => {
        element.setAttribute(
          "stroke-width",
          Math.min(
            window.viewer.viewport.imageToViewportCoordinates(100, 100).x /
              window.viewer.viewport.getZoom(),
            0.001
          )
        );
      });
  });
  const coreGridIndex = buildCoreGridIndex(window.sortedCoresData);

  window.sortedCoresData.forEach(drawCore);
  window.sortedCoresData.forEach((core) => {
    connectAdjacentCores(core, false, coreGridIndex);
  });
}

function drawCore(core, index = -1) {
  // Add overlay element on the OSD viewer

  const overlayElement = document.createElement("div");
  overlayElement.className = "core-overlay-for-gridding";
  overlayElement.id = getCoreOverlayId(index);
  setCoreOverlayMetadata(overlayElement, core, index);
  if (window.viewer.getOverlayById(overlayElement.id)) {
    window.viewer.removeOverlay(overlayElement.id);
  }

  const overlayTitleDiv = document.createElement("div");
  overlayTitleDiv.className = "core-overlay-title-div";

  if (core.row >= 0 && core.col >= 0) {
    overlayTitleDiv.innerText = `${core.row + 1},${core.col + 1}`;
  }
  overlayTitleDiv.style.top = `-${Math.floor(
    window.viewer.viewport.imageToViewportCoordinates(
      new OpenSeadragon.Point(core.currentRadius / 2, core.currentRadius / 2)
    ).x
  )}px`;
  overlayElement.appendChild(overlayTitleDiv);

  if (core.isImaginary) {
    overlayElement.classList.add("imaginary");
  }
  if (core.isSelected) {
    overlayElement.classList.add("selected");
  }

  if (core.isMarker) {
    overlayElement.classList.add("marker");
  }

  if (core.autoAssignedMarker) {
    overlayElement.classList.add("auto-assigned-marker");
  }

  if (core.needsReview) {
    overlayElement.classList.add("needs-review");
  }

  if (document.getElementById("flagMisalignmentCheckbox").checked) {
    if (core.isMisaligned) {
      overlayElement.classList.add("misaligned");
    }
  }

  const overlayRect = window.viewer.viewport.imageToViewportRectangle(
    new OpenSeadragon.Rect(
      core.x - core.currentRadius,
      core.y - core.currentRadius,
      core.currentRadius * 2,
      core.currentRadius * 2
    )
  );
  window.viewer.addOverlay(overlayElement, overlayRect);

  new OpenSeadragon.MouseTracker({
    element: overlayElement,

    clickTimeThreshold: 200,
    clickDistThreshold: 50,

    preProcessEventHandler: (e) => {
      if (
        e.eventType === "click" ||
        e.eventType === "drag" ||
        e.eventType === "dragEnd"
      ) {
        e.stopPropagation = true;
        e.preventDefault = true;
      }
    },

    clickHandler: (e) => {
      if (e.originalEvent.shiftKey && index !== -1) {
        window.sortedCoresData[index].isImaginary =
          !window.sortedCoresData[index].isImaginary;
        if (window.sortedCoresData[index].isImaginary) {
          overlayElement.classList.add("imaginary");
        } else {
          overlayElement.classList.remove("imaginary");
        }
        const overlayRect = window.viewer.viewport.imageToViewportRectangle(
          new OpenSeadragon.Rect(
            core.x - core.currentRadius,
            core.y - core.currentRadius,
            core.currentRadius * 2,
            core.currentRadius * 2
          )
        );
        window.viewer.updateOverlay(overlayElement, overlayRect);
      } else {
        overlayClickHandler(e);
      }
    },

    dblClickHandler: (e) => {
      // const overlay = window.viewer.getOverlayById(overlayElement);
      // selectedIndex = window.viewer.currentOverlays.indexOf(overlay)
      overlayElement.classList.add("selected");
      updateSidebar(core);
      positionSidebarNextToCore(e.originalEvent);
      // drawCores()
    },

    dragHandler: (e) => {
      const overlay = window.viewer.getOverlayById(overlayElement);
      const deltaViewport = window.viewer.viewport.deltaPointsFromPixels(
        e.delta
      );

      overlay.element.style.cursor = "grabbing";
      overlay.update(overlay.location.plus(deltaViewport));

      overlay.drawHTML(overlay.element.parentElement, window.viewer.viewport);
      const deltaImage =
        window.viewer.viewport.viewportToImageCoordinates(deltaViewport);

      if (index !== -1) {
        window.sortedCoresData[index].x += deltaImage.x;
        window.sortedCoresData[index].y += deltaImage.y;
        updateSidebar(window.sortedCoresData[index]);

        connectAdjacentCores(window.sortedCoresData[index], true);
      }
    },

    dragEndHandler: (e) => {
      const overlay = window.viewer.getOverlayById(overlayElement);
      overlay.element.style.cursor = "grab";
      if (index !== -1 && !core.isMarker) {
        connectAdjacentCores(window.sortedCoresData[index], true);

        const newRow = determineCoreRow(
          window.sortedCoresData[index],
          window.sortedCoresData
        );
        const oldRow = window.sortedCoresData[index].row;

        // If oldRow is now empty, remove it from the grid

        if (
          window.sortedCoresData.filter((core) => core.row === oldRow)
            .length === 0
        ) {
          updateRowsInGridAfterRemoval(oldRow);
        }

        // Only if the editAutoUpdateRowsCheckbox is checked for the core
        if (document.getElementById("editAutoUpdateRowsCheckbox").checked) {
          window.sortedCoresData[index].row = newRow;
          // Only update if the core isn't a marker
          updateRowsInGridAfterMovement(oldRow, newRow);
        }

        const imageRotation = document.getElementById("originAngle").value;
        flagMisalignedCores(window.sortedCoresData, imageRotation, false);
      }
      if (index !== -1) {
        drawCores();
      }
    },
  });

  return overlayElement;
}

const keyPressHandler = (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    const overlay = window.viewer.currentOverlays.find((overlay) =>
      overlay.element.classList.contains("selected")
    );
    const { core } = getCoreFromOverlayElement(overlay?.element);

    if (core) {
      removeCoreFromGrid(core);
    } else if (
      overlay?.element.classList.contains("temporary") ||
      overlay?.element.classList.contains("marker")
    ) {
      const overlayBounds = window.viewer.viewport.viewportToImageRectangle(
        overlay.getBounds(window.viewer.viewport)
      );
      const core = window.sortedCoresData.find(
        (core) =>
          Math.floor(core.x) ===
            Math.floor(overlayBounds.x + overlayBounds.width / 2) &&
          Math.floor(core.y) ===
            Math.floor(overlayBounds.y + overlayBounds.height / 2)
      );
      removeCoreFromGrid(core);
    }
    document.removeEventListener("keydown", keyPressHandler);
  } else if (e.key === "Escape") {
    overlayClickHandler({ quick: true });
  }
};

const zoomHandlerForResizeHandles = (e) => {
  const overlay = window.viewer.currentOverlays.find((overlay) =>
    overlay.element.classList.contains("selected")
  );
  drawResizeHandles(overlay, true);
};

const deselectOverlay = (overlay) => {
  overlay.element.classList.remove("selected");
  window.viewer.removeHandler("canvas-click", overlayClickHandler);
  window.viewer.removeHandler("zoom", zoomHandlerForResizeHandles);
  document.removeEventListener("keydown", keyPressHandler);
  hideSidebar();
  drawResizeHandles(overlay, false);
};

const overlayClickHandler = (e) => {
  let overlay = undefined;
  if (e.originalTarget?.classList.contains("core-overlay-for-gridding")) {
    overlay = window.viewer.getOverlayById(e.originalTarget);
  } else {
    overlay = window.viewer.currentOverlays.find((overlay) =>
      overlay.element.classList.contains("selected")
    );
  }

  if (e.quick && overlay) {
    if (overlay.element.classList.contains("selected")) {
      deselectOverlay(overlay);
    } else {
      // selectedIndex = null
      window.viewer.currentOverlays
        .filter((overlay) => overlay.element.classList.contains("selected"))
        .forEach(deselectOverlay);

      overlay.element.classList.add("selected");

      drawResizeHandles(overlay, true);
      document.addEventListener("keydown", keyPressHandler);
      window.viewer.addHandler("zoom", zoomHandlerForResizeHandles);
      window.viewer.addOnceHandler("canvas-click", overlayClickHandler);
    }
  }
};

// Modified updateSidebar function to handle add mode
function updateSidebar(core) {
  // const sidebarPrefix = currentMode === "edit" ? "edit" : "add";
  const sidebarPrefix = "edit";

  document.getElementById(sidebarPrefix + "RowInput").value = core
    ? core.row >= 0
      ? core.row + 1
      : core.row
    : "";
  document.getElementById(sidebarPrefix + "ColumnInput").value = core
    ? core.col >= 0
      ? core.col + 1
      : core.col
    : "";

  document.getElementById(sidebarPrefix + "XInput").value = core
    ? core.x * window.scalingFactor
    : "";
  document.getElementById(sidebarPrefix + "YInput").value = core
    ? core.y * window.scalingFactor
    : "";
  document.getElementById(sidebarPrefix + "RadiusInput").value = core
    ? core.currentRadius * window.scalingFactor
    : "";
  document.getElementById(sidebarPrefix + "AnnotationsInput").value =
    core?.annotations ? core.annotations : "";
  document.getElementById(sidebarPrefix + "RealInput").checked =
    !core?.isImaginary;
  document.getElementById(sidebarPrefix + "ImaginaryInput").checked =
    core?.isImaginary;
  document.getElementById(sidebarPrefix + "IsMarkerInput").checked =
    core?.isMarker;

  const saveHandler = (e) => {
    if (saveCore(core)) {
      document
        .getElementById("saveCoreEdits")
        .removeEventListener("click", saveHandler);
      hideSidebar();
    }
  };
  document.getElementById("saveCoreEdits").onclick = saveHandler;

  const removeHandler = (e) => {
    removeCoreFromGrid(core);
    document
      .getElementById("removeCoreButton")
      .removeEventListener("click", removeHandler);
    hideSidebar();
  };

  document.getElementById("removeCoreButton").onclick = removeHandler;
}

function saveCore(core) {
  const oldRow = core?.row;
  const wasMarker = core?.isMarker || core?.offGridMarker;
  if (
    !oldRow &&
    !document.getElementById("editRowInput").value &&
    !document.getElementById("editAutoUpdateRowsCheckbox").checked
  ) {
    alert("Please enter a value for the row");
    return false;
  }

  // Get the new row and column values
  const rowInputValue = document.getElementById("editRowInput").value;
  const colInputValue = document.getElementById("editColumnInput").value;
  const parsedRow = parseInt(rowInputValue, 10);
  const parsedCol = parseInt(colInputValue, 10);
  const newRow = parsedRow >= 0 ? parsedRow - 1 : parsedRow;
  const newCol = parsedCol >= 0 ? parsedCol - 1 : parsedCol;
  const newIsMarker = document.getElementById("editIsMarkerInput").checked;

  if (!Number.isFinite(newRow) || !Number.isFinite(newCol)) {
    alert("Please enter valid row and column values");
    return false;
  }

  // Check if the core is being moved to a different row
  if (newRow >= 0 && newCol >= 0) {
    // Locate the conflicting core, if any
    const conflictingCoreIndex = window.sortedCoresData.findIndex(
      (existingCore) =>
        existingCore !== core &&
        existingCore.row === newRow &&
        existingCore.col === newCol
    );

    if (conflictingCoreIndex !== -1 && !newIsMarker && wasMarker) {
      alert("That row and column already contain a core.");
      return false;
    }

    if (conflictingCoreIndex !== -1 && !newIsMarker) {
      const conflictingCore = window.sortedCoresData[conflictingCoreIndex];

      // Swap row and col values with the conflicting core
      [core.row, conflictingCore.row] = [conflictingCore.row, core.row];
      [core.col, conflictingCore.col] = [conflictingCore.col, core.col];
    } else {
      core.row = newRow;
      core.col = newCol;
    }

    if (
      oldRow !== newRow &&
      oldRow !== -1 &&
      document.getElementById("editAutoUpdateRowsCheckbox").checked
    ) {
      updateRowsInGridAfterRemoval(oldRow);
    }
  } else {
    core.row = newRow;
    core.col = newCol;
  }

  // Update core properties
  core.x = parseFloat(document.getElementById("editXInput").value) / window.scalingFactor;
  core.y = parseFloat(document.getElementById("editYInput").value) / window.scalingFactor;
  core.currentRadius = parseFloat(document.getElementById("editRadiusInput").value) / window.scalingFactor;
  core.annotations = document.getElementById("editAnnotationsInput").value;

  // Update the isImaginary property based on which radio button is checked
  core.isImaginary = document.getElementById("editImaginaryInput").checked;

  // Update the isMarker property based on which radio button is checked
  core.isMarker = newIsMarker;
  if (core.isMarker) {
    core.autoAssignedMarker = false;
    clearOffGridMarkerStatus(core);
    core.needsReview =
      core.row >= 0 &&
      core.col >= 0 &&
      window.sortedCoresData.some(
        (existingCore) =>
          existingCore !== core &&
          !existingCore.isMarker &&
          existingCore.row === core.row &&
          existingCore.col === core.col
      );
  }

  // Find the core index within the sorted cores data
  const coreIndex = window.sortedCoresData.indexOf(core);

  if (
    document.getElementById("editAutoUpdateRowsCheckbox").checked &&
    !document.getElementById("editIsMarkerInput").checked
  ) {
    core.row = determineCoreRow(core, window.sortedCoresData);
    if (!core.isMarker) {
      updateColumnsInRowAfterModification(core.row);
    }
    if (oldRow !== core.row && oldRow !== -1) {
      updateColumnsInRowAfterModification(oldRow);
    }

    if (coreIndex !== -1) {
      window.sortedCoresData[coreIndex] = core;
    }
    updateSidebar(core);
  }

  // Finalize core update
  core.isSelected = false;
  const imageRotation = parseFloat(document.getElementById("originAngle").value);

  // Reflag for misaligned cores
  window.sortedCoresData = flagMisalignedCores(window.sortedCoresData, imageRotation, false);
  drawCores(); // Redraw the cores

  return true;
}

// Picks the row with the closest rotated median Y value to the rotated median Y value of the core
function determineCoreRow(core, sortedCoresData) {
  const placedCores = sortedCoresData.filter((candidate) => {
    const row = Number(candidate.row);
    const col = Number(candidate.col);
    return (
      !candidate.isMarker &&
      Number.isFinite(row) &&
      Number.isFinite(col) &&
      row >= 0 &&
      col >= 0
    );
  });
  const rowsByIndex = new Map();

  placedCores.forEach((candidate) => {
    const row = Number(candidate.row);
    if (!rowsByIndex.has(row)) {
      rowsByIndex.set(row, []);
    }
    rowsByIndex.get(row).push(candidate);
  });

  const multiCoreRows = [...rowsByIndex.values()].filter(
    (rowCores) => rowCores.length > 1
  );
  const rowReferenceCores =
    multiCoreRows.length > 0 ? multiCoreRows.flat() : placedCores;
  const imageRotation =
    parseFloat(document.getElementById("originAngle").value) || 0;
  const medianRows = Object.entries(
    determineMedianRowColumnValues(rowReferenceCores, imageRotation).rows
  )
    .map(([row, values]) => ({
      row: Number(row),
      medianY: values.medianY,
    }))
    .filter(
      (entry) => Number.isFinite(entry.row) && Number.isFinite(entry.medianY)
    );

  if (medianRows.length === 0) {
    const currentRow = Number(core.row);
    return Number.isFinite(currentRow) && currentRow >= 0 ? currentRow : 0;
  }

  const rotatedY = rotatePoint([core.x, core.y], -imageRotation)[1];

  let closestRow = medianRows[0].row;
  let closestDistance = Infinity;
  medianRows.forEach((rowEntry) => {
    const distance = Math.abs(rowEntry.medianY - rotatedY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestRow = rowEntry.row;
    }
  });

  return closestRow;
}

function updateRowsInGridAfterRemoval(modifiedRow) {
  // Check if the removed core was the last real core in the row
  const isLastRealCore =
    window.sortedCoresData.filter(
      (core) => core.row === modifiedRow && !core.isImaginary && !core.isMarker
    ).length === 0;

  if (isLastRealCore) {
    // Remove all cores in the row
    window.sortedCoresData = window.sortedCoresData.filter(
      (core) => core.row !== modifiedRow
    );
    window.sortedCoresData.forEach((core) => {
      if (core.row > modifiedRow) {
        core.row -= 1;
      }
    });
  }

  if (!isLastRealCore) {
    // Update columns only if the row was not removed
    updateColumnsInRowAfterModification(modifiedRow);
  }
}

function updateRowsInGridAfterMovement(oldRow, newRow) {
  if (Number(oldRow) !== -1) {
    updateRowsInGridAfterRemoval(oldRow);
  }
  updateColumnsInRowAfterModification(newRow);
}

function removeCoreFromGrid(core) {
  let coreIndex = window.sortedCoresData.indexOf(core);

  if (coreIndex === -1) {
    coreIndex = window.sortedCoresData.findIndex(
      (coreToRemove) => coreToRemove.x === core.x && coreToRemove.y === core.y
    );
  }

  if (coreIndex === -1) {
    console.warn("Core not found in sortedCoresData");
    return;
  }

  if (!core.isMarker) {
    const modifiedRow = window.sortedCoresData[coreIndex].row;
    // Remove the selected core
    window.sortedCoresData.splice(coreIndex, 1);

    updateRowsInGridAfterRemoval(modifiedRow);

    flagMisalignedCores(
      window.sortedCoresData,
      parseFloat(document.getElementById("originAngle").value),
      false
    );
  } else {
    // Remove the selected core
    window.sortedCoresData.splice(coreIndex, 1);
  }

  drawCores(); // Redraw the cores
}

// document
//   .getElementById("saveCoreEdits")
//   .addEventListener("click", function () {
//     console.log("CLICK EVENT LISTENER")
//     saveCore(window.sortedCoresData[selectedIndex])
//   });

function updateColumnsInRowAfterModification(row) {
  let imageRotation = parseFloat(document.getElementById("originAngle").value);

  // Get cores in the specified row and their rotated coordinates
  const coresWithRotatedCoordinates = window.sortedCoresData
    .filter((core) => core.row === row)
    .map((core) => ({
      originalCore: core,
      rotatedCoordinates: rotatePoint([core.x, core.y], -imageRotation),
    }));

  // Sort based on the x-value of the rotated coordinates
  coresWithRotatedCoordinates.sort(
    (a, b) => a.rotatedCoordinates[0] - b.rotatedCoordinates[0]
  );

  let currentColumn = 0;
  coresWithRotatedCoordinates.forEach((item) => {
    item.originalCore.col = currentColumn++;
  });

  drawCores(); // Redraw the cores
}

const addCoreEscapeHandler = (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    addCoreHandler(e);
  }
};

const addCoreHandler = (e) => {
  const addCoreBtn = document.getElementById("osdViewerAddCoreBtn");

  if (addCoreBtn.classList.contains("active")) {
    addCoreBtn.classList.remove("active");
    window.viewer.canvas.style.cursor = "auto";
    window.viewer.removeAllHandlers("canvas-drag");
    window.viewer.removeAllHandlers("canvas-drag-end");
    document.removeEventListener("keydown", addCoreEscapeHandler);
  } else {
    addCoreBtn.classList.add("active");

    window.viewer.canvas.style.cursor = "crosshair";

    const tempCore = {
      x: -1,
      y: -1,
      currentRadius: -1,
      isSelected: false,
    };

    let overlayElement = undefined;

    const dragHandler = (e) => {
      e.preventDefaultAction = true;
      const positionInImage =
        window.viewer.viewport.viewerElementToImageCoordinates(e.position);

      if (tempCore.x === -1) {
        tempCore.x = positionInImage.x;
      }
      if (tempCore.y === -1) {
        tempCore.y = positionInImage.y;
      }

      tempCore.currentRadius = Math.abs(
        Math.max(tempCore.x - positionInImage.x, tempCore.y - positionInImage.y)
      );

      if (overlayElement) {
        window.viewer.removeOverlay(overlayElement);
        window.sortedCoresData[window.sortedCoresData.length - 1] = tempCore;
      } else {
        window.sortedCoresData.push(tempCore);
      }
      overlayElement = drawCore(tempCore, window.sortedCoresData.length - 1);
    };

    const dragEndHandler = (e) => {
      tempCore.isSelected = true;
      dragHandler(e);
      updateSidebar(tempCore);
      positionSidebarNextToCore(e.originalEvent);
      addCoreHandler(e, dragHandler, dragEndHandler, addCoreEscapeHandler);

      saveCore(tempCore);
    };

    document.addEventListener("keydown", addCoreEscapeHandler, { once: true });

    window.viewer.addHandler("canvas-drag", dragHandler);

    window.viewer.addOnceHandler("canvas-drag-end", dragEndHandler);
  }
};

function normalizeAngleToGridAxis(angle) {
  let normalizedAngle = angle;
  while (normalizedAngle <= -90) normalizedAngle += 180;
  while (normalizedAngle > 90) normalizedAngle -= 180;
  return normalizedAngle;
}

function estimateDominantGridAngle(preprocessedCores, params, targetRange) {
  if (!Array.isArray(preprocessedCores) || preprocessedCores.length < 2) {
    return 0;
  }

  try {
    const edges = filterEdgesByLength(
      getEdgesFromTriangulation(preprocessedCores),
      preprocessedCores,
      params.thresholdMultiplier
    );
    const angles = edges
      .map(([start, end]) => {
        const startCore = preprocessedCores[start];
        const endCore = preprocessedCores[end];
        return normalizeAngleToGridAxis(
          (Math.atan2(endCore.y - startCore.y, endCore.x - startCore.x) * 180) /
            Math.PI
        );
      })
      .filter(
        (angle) => angle >= targetRange.start - 2 && angle <= targetRange.end + 2
      )
      .sort((a, b) => a - b);

    if (!angles.length) {
      return 0;
    }

    const middleIndex = Math.floor(angles.length / 2);
    return angles.length % 2
      ? angles[middleIndex]
      : (angles[middleIndex - 1] + angles[middleIndex]) / 2;
  } catch (error) {
    console.warn("Could not estimate grid angle from core edges.", error);
    return 0;
  }
}

function getFastAngleCandidates(preprocessedCores, params, targetRange) {
  const estimatedAngle = estimateDominantGridAngle(
    preprocessedCores,
    params,
    targetRange
  );
  const roundedEstimate = Math.round(estimatedAngle);
  const rawCandidates = [
    roundedEstimate,
    roundedEstimate - 1,
    roundedEstimate + 1,
    0,
  ];
  const seenAngles = new Set();

  return rawCandidates
    .map((angle) =>
      clampNumber(Math.round(angle), targetRange.start, targetRange.end)
    )
    .filter((angle) => {
      if (seenAngles.has(angle)) {
        return false;
      }

      seenAngles.add(angle);
      return true;
    });
}

// Function to find the optimal angle that minimizes imaginary cores
async function findOptimalAngle(
  preprocessedCores,
  getHyperparameters,
  runAlgorithm,
  updateUI
) {
  let targetRange = { start: -10, end: 10 };
  const angleCandidates = getFastAngleCandidates(
    preprocessedCores,
    getHyperparameters(0),
    targetRange
  );
  let optimalAnglesData = []; // Track angles and their stats for comparison

  // Function to evaluate each angle
  const evaluateAngle = async (angle) => {
    updateUI(angle);
    const hyperparameters = getHyperparameters(angle);
    let sortedCoresData = await runAlgorithm(
      preprocessedCores,
      hyperparameters
    );
    sortedCoresData = filterAndReassignCores(
      sortedCoresData,
      angle,
      hyperparameters,
      { updateStatus: false, fastAngleEvaluation: true }
    );
    const imaginaryCoresCount = sortedCoresData.filter(
      (core) => core.isImaginary
    ).length;
    const misalignedCoresCount = sortedCoresData.filter(
      (core) => core.isMisaligned
    ).length;
    const rows = new Set(
      sortedCoresData.filter((core) => !core.isMarker).map((core) => core.row)
    ).size; // Unique rows count
    return { angle, imaginaryCoresCount, rows, misalignedCoresCount };
  };

  let minImaginaryCores = Infinity;
  let minRows = Infinity;

  // Evaluate a compact edge-derived candidate set instead of every angle.
  for (const angle of angleCandidates) {
    const evaluationResult = await evaluateAngle(angle);

    // // Update minimums and optimal angles based on primary and secondary goals
    // if (evaluationResult.imaginaryCoresCount < minImaginaryCores ||
    //     (evaluationResult.imaginaryCoresCount === minImaginaryCores && evaluationResult.rows < minRows)) {
    //   minImaginaryCores = evaluationResult.imaginaryCoresCount;
    //   minRows = evaluationResult.rows;
    //   optimalAnglesData = [evaluationResult]; // Reset with new optimal result
    // } else if (evaluationResult.imaginaryCoresCount === minImaginaryCores && evaluationResult.rows === minRows) {
    //   optimalAnglesData.push(evaluationResult); // Add to optimal results for tiebreaking
    // }

    // Update minimums and optimal angles based on primary and secondary goals
    if (evaluationResult.rows < minRows) {
      minImaginaryCores = evaluationResult.imaginaryCoresCount;
      minRows = evaluationResult.rows;
      optimalAnglesData = [evaluationResult]; // Reset with new optimal result
    } else if (evaluationResult.rows === minRows) {
      optimalAnglesData.push(evaluationResult); // Add to optimal results for tiebreaking
    }
  }

  // Tiebreaker: Among angles with same minImaginaryCores and minRows, find minMisalignedCores
  let minMisalignedCores = Infinity;
  let finalOptimalAngles = [];
  optimalAnglesData.forEach((angleData) => {
    if (angleData.misalignedCoresCount < minMisalignedCores) {
      minMisalignedCores = angleData.misalignedCoresCount;
      finalOptimalAngles = [angleData.angle]; // Reset with new optimal result
    } else if (angleData.misalignedCoresCount === minMisalignedCores) {
      finalOptimalAngles.push(angleData.angle); // Multiple angles with same minMisalignedCores
    }
  });

  // Find median angle from finalOptimalAngles
  finalOptimalAngles.sort((a, b) => a - b);
  const medianIndex = Math.floor(finalOptimalAngles.length / 2);
  const medianAngle =
    finalOptimalAngles.length % 2 !== 0
      ? finalOptimalAngles[medianIndex]
      : (finalOptimalAngles[medianIndex - 1] +
          finalOptimalAngles[medianIndex]) /
        2;

  // If zero is in the finalOptimalAngles, return zero
  if (finalOptimalAngles.includes(0)) {
    return 0;
  }

  return medianAngle;
}

async function applyAndVisualizeTravelingAlgorithm(e, firstRun = false) {
  if (!window.preprocessedCores) {
    console.error("No cores data available. Please load a file first.");
    setGriddingStatus(
      "error",
      "No detected cores available",
      "Run core detection before applying the gridding algorithm."
    );
    return;
  }

  setGriddingStatus(
    "loading",
    "Building grid markers",
    "Optimizing grid angle and assigning cores to rows and columns."
  );

  try {
    let hyperparameters;
    if (firstRun) {
      // Helper function to update the angle in the UI and return updated hyperparameters
      const updateUIAndHyperparameters = (angle) => {
        document.getElementById("originAngle").value = angle.toString();
        document.getElementById("originAngleValue").innerText =
          angle.toString();

        // Update OSD viewer to be rotated with the optimal angle
        window.viewer.viewport.setRotation(-angle);
        return {
          ...getHyperparametersFromUI(),
          originAngle: angle,
        };
      };

      // Find the optimal angle
      const optimalAngle = await findOptimalAngle(
        window.preprocessedCores,
        updateUIAndHyperparameters,
        runTravelingAlgorithm,
        (angle) => {
          document.getElementById("originAngle").value = angle.toString();
          setGriddingStatus(
            "loading",
            "Testing grid angle",
            `Checking ${angle} degrees against detected cores.`
          );
        }
      );

      // Update UI with the optimal angle
      hyperparameters = updateUIAndHyperparameters(optimalAngle);
    } else {
      hyperparameters = getHyperparametersFromUI();
    }

    setGriddingStatus(
      "loading",
      "Placing grid markers",
      "Filtering, reassigning, and drawing core overlays."
    );

    // Run the algorithm with the optimal angle found
    let sortedCoresData = await runTravelingAlgorithm(
      window.preprocessedCores,
      hyperparameters
    );

    sortedCoresData = filterAndReassignCores(
      sortedCoresData,
      hyperparameters.originAngle,
      hyperparameters
    );

    updateSpacingInVirtualGrid(hyperparameters.gridWidth * 1.5);

    // Function to scale core data
    const scaleCoreData = (core) => ({
      ...core,
      x: core.x / window.scalingFactor,
      y: core.y / window.scalingFactor,
      currentRadius: core.currentRadius / window.scalingFactor,
    });

    // Scale and update the cores data
    window.sortedCoresData = sortedCoresData.map(scaleCoreData);

    if (window.sortedCoresData.length === 0) {
      setGriddingStatus(
        "empty",
        "No grid markers were generated",
        "Try adjusting detection or gridding parameters, then apply again."
      );
      return;
    }

    // Visualize the cores
    drawCoresOnCanvasForTravelingAlgorithm();
    clearGriddingStatus();
  } catch (error) {
    console.error("Error applying gridding algorithm:", error);
    setGriddingStatus(
      "error",
      "Grid markers could not be built",
      "Check the detected cores and gridding parameters, then apply again."
    );
  }
}

function removeImaginaryCoresFilledColumns(coresData) {
  // Calculate imaginary core counts
  let colImaginaryCounts = {};
  let colCount = {};

  // Initialize counts
  coresData.forEach((core) => {
    colCount[core.col] = (colCount[core.col] || 0) + 1;
    if (core.isImaginary) {
      colImaginaryCounts[core.col] = (colImaginaryCounts[core.col] || 0) + 1;
    }
  });

  // Filter cores
  coresData = coresData.filter((core) => {
    let colImaginaryRatio =
      (colImaginaryCounts[core.col] || 0) / colCount[core.col];
    return !(core.isImaginary && colImaginaryRatio >= 0.8);
  });

  return coresData;
}

function determineMedianRowColumnValues(coresData, imageRotation) {
  // Initialize structures to hold separated X and Y values for rows and columns
  const rowValues = {};
  const columnValues = {};

  // Calculate rotated values and separate X and Y for each row and column
  coresData.forEach((core) => {
    if (!core.isMarker) {
      const [rotatedX, rotatedY] = rotatePoint(
        [core.x, core.y],
        -imageRotation
      );

      // Handle column values
      if (!columnValues[core.col]) {
        columnValues[core.col] = { x: [], y: [] };
      }
      columnValues[core.col].x.push(rotatedX);
      columnValues[core.col].y.push(rotatedY);

      // Handle row values
      if (!rowValues[core.row]) {
        rowValues[core.row] = { x: [], y: [] };
      }
      rowValues[core.row].x.push(rotatedX);
      rowValues[core.row].y.push(rotatedY);
    }
  });

  // Function to calculate median of a sorted array
  const calculateMedian = (arr) => {
    const mid = Math.floor(arr.length / 2);
    arr.sort((a, b) => a - b);
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  // Calculate medians for each column and row
  const medianValues = { rows: {}, columns: {} };

  Object.keys(columnValues).forEach((col) => {
    if (columnValues[col].x.length > 1 && parseInt(col) !== -1) {
      medianValues.columns[col] = {
        medianX: calculateMedian(columnValues[col].x),
        medianY: calculateMedian(columnValues[col].y),
      };
    }
  });

  Object.keys(rowValues).forEach((row) => {
    if (parseInt(row) !== -1) {
      medianValues.rows[row] = {
        medianX: calculateMedian(rowValues[row].x),
        medianY: calculateMedian(rowValues[row].y),
      };
    }
  });

  return medianValues;
}

function calculateMedianNumber(values) {
  const sortedValues = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sortedValues.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middleIndex]
    : (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function getMedianEntries(medianValues, key) {
  return Object.entries(medianValues)
    .map(([index, value]) => ({
      index: parseInt(index, 10),
      value: value[key],
    }))
    .filter((entry) => Number.isFinite(entry.index) && Number.isFinite(entry.value))
    .sort((a, b) => a.index - b.index);
}

function estimateIndexedSpacing(entries, fallbackSpacing) {
  if (Number.isFinite(fallbackSpacing) && fallbackSpacing > 0) {
    return fallbackSpacing;
  }

  const spacings = [];
  for (let i = 1; i < entries.length; i++) {
    const indexDistance = entries[i].index - entries[i - 1].index;
    const coordinateDistance = entries[i].value - entries[i - 1].value;

    if (indexDistance > 0 && coordinateDistance > 0) {
      spacings.push(coordinateDistance / indexDistance);
    }
  }

  return calculateMedianNumber(spacings);
}

function getIndexRange(entries) {
  const indexes = entries.map((entry) => entry.index);
  return {
    min: Math.min(...indexes),
    max: Math.max(...indexes),
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCellKey(row, col) {
  return `${row}_${col}`;
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function solveLinearSystem3x3(matrix, values) {
  const m = cloneMatrix(matrix);
  const b = [...values];

  for (let pivot = 0; pivot < 3; pivot++) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < 3; row++) {
      if (Math.abs(m[row][pivot]) > Math.abs(m[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(m[maxRow][pivot]) < 1e-9) {
      return null;
    }

    if (maxRow !== pivot) {
      [m[pivot], m[maxRow]] = [m[maxRow], m[pivot]];
      [b[pivot], b[maxRow]] = [b[maxRow], b[pivot]];
    }

    const pivotValue = m[pivot][pivot];
    for (let col = pivot; col < 3; col++) {
      m[pivot][col] /= pivotValue;
    }
    b[pivot] /= pivotValue;

    for (let row = 0; row < 3; row++) {
      if (row === pivot) {
        continue;
      }

      const factor = m[row][pivot];
      for (let col = pivot; col < 3; col++) {
        m[row][col] -= factor * m[pivot][col];
      }
      b[row] -= factor * b[pivot];
    }
  }

  return b;
}

function fitAffineLatticeModel(samples) {
  const normalMatrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const normalX = [0, 0, 0];
  const normalY = [0, 0, 0];

  samples.forEach((sample) => {
    const features = [1, sample.row, sample.col];
    const weight = sample.weight || 1;

    for (let i = 0; i < 3; i++) {
      normalX[i] += weight * features[i] * sample.x;
      normalY[i] += weight * features[i] * sample.y;

      for (let j = 0; j < 3; j++) {
        normalMatrix[i][j] += weight * features[i] * features[j];
      }
    }
  });

  const xCoefficients = solveLinearSystem3x3(normalMatrix, normalX);
  const yCoefficients = solveLinearSystem3x3(normalMatrix, normalY);

  if (!xCoefficients || !yCoefficients) {
    return null;
  }

  const rowVector = {
    x: xCoefficients[1],
    y: yCoefficients[1],
  };
  const colVector = {
    x: xCoefficients[2],
    y: yCoefficients[2],
  };
  const determinant = rowVector.x * colVector.y - colVector.x * rowVector.y;

  if (Math.abs(determinant) < 1e-6) {
    return null;
  }

  return {
    origin: {
      x: xCoefficients[0],
      y: yCoefficients[0],
    },
    rowVector,
    colVector,
    determinant,
    rowSpacing: Math.hypot(rowVector.x, rowVector.y),
    colSpacing: Math.hypot(colVector.x, colVector.y),
  };
}

function predictPointFromLattice(model, row, col) {
  return {
    x: model.origin.x + row * model.rowVector.x + col * model.colVector.x,
    y: model.origin.y + row * model.rowVector.y + col * model.colVector.y,
  };
}

function getLatticeResidual(model, sample) {
  const predicted = predictPointFromLattice(model, sample.row, sample.col);
  return Math.hypot(sample.x - predicted.x, sample.y - predicted.y);
}

function projectPointToLattice(model, point) {
  const dx = point.x - model.origin.x;
  const dy = point.y - model.origin.y;
  const rowFloat = (dx * model.colVector.y - model.colVector.x * dy) / model.determinant;
  const colFloat = (model.rowVector.x * dy - dx * model.rowVector.y) / model.determinant;

  return {
    rowFloat,
    colFloat,
    row: Math.round(rowFloat),
    col: Math.round(colFloat),
  };
}

function getLatticeSamples(coresData) {
  return coresData
    .filter(
      (core) =>
        !core.isMarker &&
        !core.autoAssignedMarker &&
        !core.isImaginary &&
        Number.isFinite(core.row) &&
        Number.isFinite(core.col) &&
        Number.isFinite(core.x) &&
        Number.isFinite(core.y) &&
        core.row >= 0 &&
        core.col >= 0
    )
    .map((core) => ({
      core,
      row: core.row,
      col: core.col,
      x: core.x,
      y: core.y,
      weight: 1,
    }));
}

function buildRobustAffineLatticeModel(coresData, params = {}) {
  const samples = getLatticeSamples(coresData);
  const uniqueRows = new Set(samples.map((sample) => sample.row));
  const uniqueCols = new Set(samples.map((sample) => sample.col));

  if (samples.length < 6 || uniqueRows.size < 2 || uniqueCols.size < 2) {
    return null;
  }

  let activeSamples = samples;
  let model = null;
  let residualThreshold = null;

  for (let iteration = 0; iteration < 4; iteration++) {
    const nextModel = fitAffineLatticeModel(activeSamples);
    if (!nextModel) {
      break;
    }

    const residuals = samples.map((sample) =>
      getLatticeResidual(nextModel, sample)
    );
    const medianResidual = calculateMedianNumber(residuals) || 0;
    const mad =
      calculateMedianNumber(
        residuals.map((residual) => Math.abs(residual - medianResidual))
      ) || 0;
    const medianRadius =
      calculateMedianNumber(
        samples
          .map((sample) => sample.core.currentRadius)
          .filter((radius) => Number.isFinite(radius) && radius > 0)
      ) || 1;
    const spacingFloor =
      Math.min(nextModel.rowSpacing, nextModel.colSpacing) ||
      params.gridWidth ||
      medianRadius * 3;

    residualThreshold = Math.max(
      medianRadius * 1.8,
      spacingFloor * 0.28,
      medianResidual + 3 * mad
    );

    const nextActiveSamples = samples.filter(
      (sample) => getLatticeResidual(nextModel, sample) <= residualThreshold
    );

    model = nextModel;
    activeSamples = nextActiveSamples.length >= 6 ? nextActiveSamples : activeSamples;
  }

  if (!model) {
    return null;
  }

  const finalSamples = activeSamples.length >= 6 ? activeSamples : samples;
  const rowIndexes = finalSamples.map((sample) => sample.row);
  const colIndexes = finalSamples.map((sample) => sample.col);
  const medianRadius =
    calculateMedianNumber(
      finalSamples
        .map((sample) => sample.core.currentRadius)
        .filter((radius) => Number.isFinite(radius) && radius > 0)
    ) || 1;
  const spacingFloor =
    Math.min(model.rowSpacing, model.colSpacing) ||
    params.gridWidth ||
    medianRadius * 3;

  return {
    ...model,
    medianRadius,
    assignmentThreshold: Math.max(
      medianRadius * 1.6,
      spacingFloor * 0.24,
      residualThreshold || 0
    ),
    rowRange: {
      min: Math.min(...rowIndexes),
      max: Math.max(...rowIndexes),
    },
    colRange: {
      min: Math.min(...colIndexes),
      max: Math.max(...colIndexes),
    },
    maxExtraRows: Math.max(2, Math.ceil(uniqueRows.size * 0.2)),
    maxExtraColumns: Math.max(4, Math.ceil(uniqueCols.size * 0.35)),
  };
}

function isWithinLatticeBounds(row, col, model) {
  return (
    isWithinExtendedRange(row, model.rowRange, model.maxExtraRows) &&
    isWithinExtendedRange(col, model.colRange, model.maxExtraColumns)
  );
}

function hasDuplicateCell(core, coresData) {
  if (!Number.isFinite(core.row) || !Number.isFinite(core.col)) {
    return false;
  }

  return coresData.some(
    (candidate) =>
      candidate !== core &&
      !candidate.isMarker &&
      candidate.row === core.row &&
      candidate.col === core.col
  );
}

function getRefinementStats(coresData, refinedCount = 0) {
  const unresolved = coresData.filter(
    (core) =>
      core.isMarker &&
      !core.offGridMarker &&
      core.isImaginary === false
  ).length;
  const assigned = coresData.filter(
    (core) => core.autoAssignedMarker && !core.isMarker
  ).length;
  const ignoredOffGrid = coresData.filter(
    (core) => core.isMarker && core.offGridMarker
  ).length;

  return {
    total: assigned + unresolved + ignoredOffGrid,
    assigned,
    unresolved,
    ignoredOffGrid,
    refined: refinedCount,
  };
}

function getMarkerAssignmentModel(coresData, imageRotation, params = {}) {
  const placedCores = coresData.filter(
    (core) =>
      !core.isMarker &&
      Number.isFinite(core.row) &&
      Number.isFinite(core.col) &&
      core.row >= 0 &&
      core.col >= 0
  );

  if (placedCores.length < 4) {
    return null;
  }

  const medianValues = determineMedianRowColumnValues(placedCores, imageRotation);
  const rowEntries = getMedianEntries(medianValues.rows, "medianY");
  const columnEntries = getMedianEntries(medianValues.columns, "medianX");

  if (rowEntries.length === 0 || columnEntries.length === 0) {
    return null;
  }

  const fallbackSpacing =
    Number.isFinite(params.gridWidth) && params.gridWidth > 0
      ? params.gridWidth
      : parseFloat(document.getElementById("gridWidth")?.value);
  const medianRadius =
    calculateMedianNumber(
      placedCores
        .map((core) => core.currentRadius)
        .filter((radius) => Number.isFinite(radius) && radius > 0)
    ) || 1;
  const columnSpacing =
    estimateIndexedSpacing(columnEntries, fallbackSpacing) || medianRadius * 3;
  const rowSpacing =
    estimateIndexedSpacing(rowEntries, fallbackSpacing) || medianRadius * 3;

  const columnOrigin = calculateMedianNumber(
    columnEntries.map((entry) => entry.value - entry.index * columnSpacing)
  );
  const rowOrigin = calculateMedianNumber(
    rowEntries.map((entry) => entry.value - entry.index * rowSpacing)
  );

  return {
    columnEntries,
    rowEntries,
    columnRange: getIndexRange(columnEntries),
    rowRange: getIndexRange(rowEntries),
    columnOrigin,
    rowOrigin,
    columnSpacing,
    rowSpacing,
    columnThreshold: Math.max(medianRadius * 1.35, columnSpacing * 0.32),
    rowThreshold: Math.max(medianRadius * 1.5, rowSpacing * 0.42),
    medianRadius,
    maxExtraColumns: Math.max(3, Math.ceil(columnEntries.length * 0.5)),
    maxExtraRows: Math.max(2, Math.ceil(rowEntries.length * 0.25)),
  };
}

function isWithinExtendedRange(index, range, extra) {
  return index >= range.min - extra && index <= range.max + extra;
}

function getClosestExistingRow(rotatedY, model) {
  let closestRow = null;
  let closestDistance = Infinity;

  model.rowEntries.forEach((entry) => {
    const distance = Math.abs(entry.value - rotatedY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestRow = entry.index;
    }
  });

  if (closestDistance <= model.rowThreshold) {
    return closestRow;
  }

  if (!Number.isFinite(model.rowOrigin) || !Number.isFinite(model.rowSpacing)) {
    return null;
  }

  const projectedRow = Math.round((rotatedY - model.rowOrigin) / model.rowSpacing);
  const projectedY = model.rowOrigin + projectedRow * model.rowSpacing;
  const residual = Math.abs(rotatedY - projectedY);

  if (
    residual <= model.rowThreshold &&
    isWithinExtendedRange(projectedRow, model.rowRange, model.maxExtraRows)
  ) {
    return projectedRow;
  }

  return null;
}

function getProjectedColumn(rotatedX, model) {
  if (!Number.isFinite(model.columnOrigin) || !Number.isFinite(model.columnSpacing)) {
    return null;
  }

  const projectedColumn = Math.round(
    (rotatedX - model.columnOrigin) / model.columnSpacing
  );
  const projectedX = model.columnOrigin + projectedColumn * model.columnSpacing;
  const residual = Math.abs(rotatedX - projectedX);

  if (
    residual <= model.columnThreshold &&
    isWithinExtendedRange(
      projectedColumn,
      model.columnRange,
      model.maxExtraColumns
    )
  ) {
    return projectedColumn;
  }

  return null;
}

function isGridCellOccupied(coresData, row, col, ignoredCore) {
  return coresData.some(
    (core) =>
      core !== ignoredCore &&
      !core.isMarker &&
      core.row === row &&
      core.col === col
  );
}

function markOffGridMarker(core, targetRow, markerSide) {
  core.row = -1;
  core.col = -1;
  core.isMarker = true;
  core.isMisaligned = false;
  core.autoAssignedMarker = false;
  core.offGridMarker = true;
  core.needsReview = false;
  core.markerGridRow = targetRow;
  core.markerGridSide = markerSide;
  core.markerAssignmentMethod = "off-grid-marker";
}

function clearOffGridMarkerStatus(core) {
  core.offGridMarker = false;
  delete core.markerGridRow;
  delete core.markerGridSide;
}

function getOffGridMarkerSide(core, targetRow, coresData, imageRotation, model) {
  const rowCores = coresData
    .filter(
      (candidate) =>
        candidate !== core &&
        !candidate.isMarker &&
        candidate.row === targetRow &&
        Number.isFinite(candidate.col)
    )
    .map((candidate) => ({
      core: candidate,
      rotatedX: rotatePoint([candidate.x, candidate.y], -imageRotation)[0],
    }))
    .sort((a, b) => a.rotatedX - b.rotatedX);

  if (rowCores.length < 2) {
    return null;
  }

  const rotatedX = rotatePoint([core.x, core.y], -imageRotation)[0];
  const firstX = rowCores[0].rotatedX;
  const lastX = rowCores[rowCores.length - 1].rotatedX;
  const margin = Math.max(model.medianRadius * 1.25, model.columnSpacing * 0.35);

  if (rotatedX < firstX - margin) {
    return "left";
  }

  if (rotatedX > lastX + margin) {
    return "right";
  }

  return null;
}

function normalizeGridIndices(coresData) {
  const placedCores = coresData.filter(
    (core) =>
      !core.isMarker &&
      Number.isFinite(core.row) &&
      Number.isFinite(core.col)
  );

  if (placedCores.length === 0) {
    return;
  }

  const minRow = Math.min(...placedCores.map((core) => core.row));
  const minCol = Math.min(...placedCores.map((core) => core.col));
  const rowOffset = minRow < 0 ? Math.abs(minRow) : 0;
  const colOffset = minCol < 0 ? Math.abs(minCol) : 0;

  if (rowOffset === 0 && colOffset === 0) {
    return;
  }

  placedCores.forEach((core) => {
    core.row += rowOffset;
    core.col += colOffset;
  });
}

function updateMarkerAutoAssignmentStatus(stats) {
  const statusElement = document.getElementById("markerAutoStatus");
  if (!statusElement || !stats) {
    return;
  }

  statusElement.classList.remove("success", "warning", "neutral");
  const refinementText = stats.refined
    ? ` Refined ${stats.refined} additional core assignment${
        stats.refined === 1 ? "" : "s"
      } with the fitted grid model.`
    : "";
  const ignoredText = stats.ignoredOffGrid
    ? ` Kept ${stats.ignoredOffGrid} off-grid marker core${
        stats.ignoredOffGrid === 1 ? "" : "s"
      } outside row and column numbering.`
    : "";

  if (stats.total === 0) {
    statusElement.textContent =
      `No marker cores needed automatic placement.${refinementText}`;
    statusElement.classList.add("neutral");
  } else if (stats.assigned === 0 && stats.unresolved === 0) {
    statusElement.textContent =
      `No marker cores needed automatic placement.${ignoredText}${refinementText}`;
    statusElement.classList.add("neutral");
  } else if (stats.unresolved === 0) {
    statusElement.textContent = `Auto-placed ${stats.assigned} marker core${
      stats.assigned === 1 ? "" : "s"
    } into inferred row and column positions.${ignoredText}${refinementText}`;
    statusElement.classList.add("success");
  } else {
    statusElement.textContent = `Auto-placed ${stats.assigned} marker core${
      stats.assigned === 1 ? "" : "s"
    }; ${stats.unresolved} still need manual review.${ignoredText}${refinementText}`;
    statusElement.classList.add("warning");
  }
}

function assignMarkerCoresToGrid(
  coresData,
  imageRotation,
  params = {},
  options = {}
) {
  const markerCandidates = coresData.filter(
    (core) => core.isMarker && core.isImaginary === false
  );
  const stats = {
    total: markerCandidates.length,
    assigned: 0,
    unresolved: markerCandidates.length,
    ignoredOffGrid: 0,
  };

  if (markerCandidates.length === 0) {
    window.markerAutoAssignmentStats = stats;
    if (options.updateStatus !== false) {
      updateMarkerAutoAssignmentStatus(stats);
    }
    return coresData;
  }

  const model = getMarkerAssignmentModel(coresData, imageRotation, params);
  if (!model) {
    window.markerAutoAssignmentStats = stats;
    if (options.updateStatus !== false) {
      updateMarkerAutoAssignmentStatus(stats);
    }
    return coresData;
  }

  markerCandidates
    .sort((a, b) => {
      const [aX, aY] = rotatePoint([a.x, a.y], -imageRotation);
      const [bX, bY] = rotatePoint([b.x, b.y], -imageRotation);
      return aY - bY || aX - bX;
    })
    .forEach((core) => {
      const [rotatedX, rotatedY] = rotatePoint([core.x, core.y], -imageRotation);
      const targetRow = getClosestExistingRow(rotatedY, model);

      if (targetRow === null) {
        clearOffGridMarkerStatus(core);
        core.autoAssignedMarker = false;
        return;
      }

      const offGridSide = getOffGridMarkerSide(
        core,
        targetRow,
        coresData,
        imageRotation,
        model
      );

      if (offGridSide) {
        markOffGridMarker(core, targetRow, offGridSide);
        stats.ignoredOffGrid += 1;
        return;
      }

      let targetCol = null;
      const projectedCol = getProjectedColumn(rotatedX, model);

      if (
        projectedCol !== null &&
        !isGridCellOccupied(coresData, targetRow, projectedCol, core)
      ) {
        targetCol = projectedCol;
      }

      if (targetCol === null) {
        clearOffGridMarkerStatus(core);
        core.autoAssignedMarker = false;
        return;
      }

      clearOffGridMarkerStatus(core);
      core.row = targetRow;
      core.col = targetCol;
      core.isMarker = false;
      core.isMisaligned = false;
      core.autoAssignedMarker = true;
      core.markerAssignmentMethod = "lattice";
      stats.assigned += 1;
    });

  normalizeGridIndices(coresData);
  stats.unresolved = markerCandidates.filter(
    (core) => core.isMarker && !core.offGridMarker
  ).length;
  window.markerAutoAssignmentStats = stats;

  if (options.updateStatus !== false) {
    updateMarkerAutoAssignmentStatus(stats);
  }

  return coresData;
}

function refineCoresWithAffineLattice(
  coresData,
  imageRotation,
  params = {},
  options = {}
) {
  const allowRenumbering = options.allowLatticeRenumbering === true;
  const model = buildRobustAffineLatticeModel(coresData, params);
  if (!model) {
    if (options.updateStatus !== false) {
      updateMarkerAutoAssignmentStatus(getRefinementStats(coresData));
    }
    return coresData;
  }

  const candidates = coresData
    .filter(
      (core) =>
        !core.offGridMarker &&
        !core.autoAssignedMarker &&
        core.isImaginary === false &&
        Number.isFinite(core.x) &&
        Number.isFinite(core.y)
    )
    .map((core) => {
      const projection = projectPointToLattice(model, core);
      const predicted = predictPointFromLattice(
        model,
        projection.row,
        projection.col
      );
      const residual = Math.hypot(core.x - predicted.x, core.y - predicted.y);
      const threshold = core.isMarker
        ? model.assignmentThreshold * 1.25
        : model.assignmentThreshold;
      const isInBounds = isWithinLatticeBounds(
        projection.row,
        projection.col,
        model
      );
      const isAccepted =
        residual <= threshold &&
        isInBounds &&
        projection.row >= 0 &&
        projection.col >= 0;
      const isSameCell =
        core.row === projection.row && core.col === projection.col;
      const isSuspect =
        core.isMarker ||
        core.autoAssignedMarker ||
        hasDuplicateCell(core, coresData);
      const score =
        residual -
        (isSameCell && !core.isMarker ? model.assignmentThreshold * 0.2 : 0);

      return {
        core,
        row: projection.row,
        col: projection.col,
        residual,
        threshold,
        isAccepted,
        isSameCell,
        isSuspect,
        score,
      };
    })
    .filter((candidate) => candidate.isAccepted);

  const winningAssignments = new Map();
  candidates
    .sort((a, b) => a.score - b.score)
    .forEach((candidate) => {
      const key = getCellKey(candidate.row, candidate.col);
      if (!winningAssignments.has(key)) {
        winningAssignments.set(key, candidate);
      }
    });

  let refinedCount = 0;

  winningAssignments.forEach((assignment) => {
    const shouldApply =
      assignment.core.isMarker ||
      assignment.isSameCell ||
      (allowRenumbering && assignment.isSuspect);

    if (!shouldApply) {
      return;
    }

    const didMove =
      assignment.core.row !== assignment.row ||
      assignment.core.col !== assignment.col;
    const wasMarker = assignment.core.isMarker;

    if (assignment.core.isMarker || allowRenumbering) {
      assignment.core.row = assignment.row;
      assignment.core.col = assignment.col;
      assignment.core.isMarker = false;
      assignment.core.isMisaligned = false;
    }

    assignment.core.needsReview = false;
    assignment.core.assignmentResidual = assignment.residual;
    assignment.core.assignmentConfidence = clampNumber(
      1 - assignment.residual / assignment.threshold,
      0,
      1
    );

    if (wasMarker) {
      assignment.core.autoAssignedMarker = true;
      assignment.core.markerAssignmentMethod = "affine-lattice";
    }

    if (didMove && !wasMarker && allowRenumbering) {
      refinedCount += 1;
      assignment.core.assignmentMethod = "affine-lattice-refinement";
    }
  });

  const assignedCells = new Set(
    coresData
      .filter((core) => !core.isMarker && core.isImaginary === false)
      .map((core) => getCellKey(core.row, core.col))
  );

  let refinedCores = coresData.filter(
    (core) =>
      !(core.isImaginary && assignedCells.has(getCellKey(core.row, core.col)))
  );

  refinedCores.forEach((core) => {
    if ((core.isMarker && !core.offGridMarker) || hasDuplicateCell(core, refinedCores)) {
      core.needsReview = true;
    }
  });

  normalizeGridIndices(refinedCores);

  if (options.updateStatus !== false) {
    updateMarkerAutoAssignmentStatus(
      getRefinementStats(refinedCores, refinedCount)
    );
  }

  window.latticeRefinementModel = model;
  window.latticeRefinementStats = getRefinementStats(refinedCores, refinedCount);

  return refinedCores;
}

function flagMisalignedCores(coresData, imageRotation, checkMarker = false) {
  const medianValues = determineMedianRowColumnValues(coresData, imageRotation);

  // Count the number of cores in each column
  const coreCounts = {};
  coresData.forEach((core) => {
    coreCounts[core.col] = (coreCounts[core.col] || 0) + 1;
  });

  // Since we're aligning columns, we focus on median X values in columns
  const medianRotatedXValues = {};
  Object.keys(medianValues.columns).forEach((col) => {
    medianRotatedXValues[col] = medianValues.columns[col].medianX;
  });

  // Mark all cores as isMarker to be false
  coresData.forEach((core) => {
    core.isMisaligned = false;
  });

  // Modify this part to take into account the number of cores in each column
  coresData.forEach((core) => {
    const rotatedX = rotatePoint([core.x, core.y], -imageRotation)[0];
    const targetColumnX = medianRotatedXValues[core.col];

    // If the core's rotated X value is 1 radius outside of the median rotatedX value or if the core's column has less than two cores, mark it as misaligned.
    if (
      Number.isFinite(targetColumnX) &&
      Math.abs(targetColumnX - rotatedX) > 1 * core.currentRadius
    ) {
      core.isMisaligned = true;
    } else {
      core.isMisaligned = false;
    }

    // If there's another core with the same row and column, also mark it as misaligned
    if (
      !core.isMarker &&
      coresData.some(
        (otherCore) =>
          otherCore !== core &&
          !otherCore.isMarker &&
          otherCore.row === core.row &&
          otherCore.col === core.col
      )
    ) {
      core.isMisaligned = true;
    }

    if (checkMarker) {
      if (
        !Object.keys(medianRotatedXValues).some(
          (col) =>
            Math.abs(medianRotatedXValues[col] - rotatedX) <
            1.5 * core.currentRadius
        ) &&
        core.isImaginary === false
      ) {
        core.row = -1;
        core.col = -1;
        core.isMarker = true;
        clearOffGridMarkerStatus(core);
      } else {
        core.isMarker = false;
        clearOffGridMarkerStatus(core);
      }
    }
  });

  return coresData;
}

function getRotatedXByCore(coresData, imageRotation) {
  const rotatedXByCore = new Map();

  coresData.forEach((core) => {
    rotatedXByCore.set(
      core,
      rotatePoint([core.x, core.y], -imageRotation)[0]
    );
  });

  return rotatedXByCore;
}

function enforceLeftToRightColumnOrder(coresData, imageRotation) {
  const rowGroups = new Map();
  const rotatedXByCore = getRotatedXByCore(coresData, imageRotation);

  coresData.forEach((core) => {
    if (core.isMarker) {
      return;
    }

    const row = Number(core.row);
    const col = Number(core.col);
    if (!Number.isFinite(row) || !Number.isFinite(col) || row < 0 || col < 0) {
      return;
    }

    if (!rowGroups.has(row)) {
      rowGroups.set(row, []);
    }
    rowGroups.get(row).push(core);
  });

  rowGroups.forEach((rowCores) => {
    if (rowCores.length < 2) {
      return;
    }

    const sortedByX = [...rowCores].sort(
      (a, b) =>
        rotatedXByCore.get(a) - rotatedXByCore.get(b) ||
        Number(a.col) - Number(b.col)
    );
    const sortedCols = rowCores
      .map((core) => Number(core.col))
      .sort((a, b) => a - b);

    sortedByX.forEach((core, index) => {
      core.col = sortedCols[index];
    });
  });

  return coresData;
}

function reassignCoreIndices(coresData, imageRotation = 0) {
  const markerCores = coresData.filter((core) => core.isMarker);
  const gridCores = coresData.filter((core) => !core.isMarker);

  markerCores.forEach((core) => {
    core.row = -1;
    core.col = -1;
  });

  // Sort by row first for consistent row remapping.
  gridCores.sort((a, b) => a.row - b.row || a.col - b.col);

  // Reassign row indices
  let rowMap = {};
  let rowIndex = 0;
  gridCores
    .map((core) => core.row)
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a - b)
    .forEach((originalRow) => {
      if (Number(originalRow) !== -1) {
        rowMap[originalRow] = rowIndex++;
      } else {
        rowMap[originalRow] = originalRow;
      }
  });

  // Reassign column indices within each row
  gridCores.forEach((core) => {
    core.row = rowMap[core.row]; // Update row to new mapping
  });

  const rotatedXByCore = getRotatedXByCore(gridCores, imageRotation);
  gridCores.sort(
    (a, b) =>
      a.row - b.row ||
      rotatedXByCore.get(a) - rotatedXByCore.get(b) ||
      a.col - b.col
  );

  // For each row, assign consecutive col indices from left to right.
  let lastRow = -1;
  let colIndex = 0;
  gridCores.forEach((core) => {
    if (core.row !== lastRow) {
      // New row
      lastRow = core.row;
      colIndex = 0;
    }
    core.col = colIndex++;
  });
  return [...gridCores, ...markerCores];
}

function alignMisalignedCores(coresData, imageRotation) {
  const medianValues = determineMedianRowColumnValues(coresData, imageRotation);

  // Count the number of cores in each column
  const coreCounts = {};
  coresData.forEach((core) => {
    if (!core.isMarker) {
      coreCounts[core.col] = (coreCounts[core.col] || 0) + 1;
    }
  });

  // Since we're aligning columns, we focus on median X values in columns
  const medianRotatedXValues = {};
  Object.keys(medianValues.columns).forEach((col) => {
    medianRotatedXValues[col] = medianValues.columns[col].medianX;
  });

  // Modify this part to take into account the number of cores in each column
  coresData.forEach((core) => {
    if (core.isMarker) {
      return;
    }

    const rotatedX = rotatePoint([core.x, core.y], -imageRotation)[0];
    let nearestCol = null;
    let minDistance = Infinity;

    // Store the distances
    let distances = {};

    Object.keys(medianRotatedXValues).forEach((col) => {
      // Added one so that if the core is the median itself, there will still be a nonzero distance, so it can get reassigned to another column if the
      // weightedDistance is high enough

      const distance = Math.abs(medianRotatedXValues[col] - rotatedX) + 5;

      distances[col] = distance;

      // Added a 0.000001 to prevent division by zero. This makes the penalty for being in a column of 1 extremely high.
      const weightedDistance = distance / Math.log(coreCounts[col] + 0.000001); // Example weighting

      if (weightedDistance < minDistance) {
        nearestCol = col;
        minDistance = weightedDistance;
      }
    });

    if (nearestCol !== null) {
      core.col = parseInt(nearestCol, 10);
    }
  });

  // Filter out "imaginary" cores that are outside the threshold for all columns
  coresData = coresData.filter((core) => {
    if (core.isMarker || core.isImaginary === false) {
      return true;
    }

    const rotatedX = rotatePoint([core.x, core.y], -imageRotation)[0];
    return Object.keys(medianRotatedXValues).some(
      (col) =>
        Math.abs(medianRotatedXValues[col] - rotatedX) <
        1.25 * core.currentRadius
    );
  });

  return coresData;
}

function filterAndReassignCores(
  coresData,
  imageRotation,
  params = {},
  options = {}
) {
  let filteredCores = flagMisalignedCores(coresData, imageRotation, true);

  filteredCores = alignMisalignedCores(filteredCores, imageRotation);

  filteredCores = removeImaginaryCoresFilledColumns(filteredCores);

  filteredCores = reassignCoreIndices(filteredCores, imageRotation);

  if (options.fastAngleEvaluation) {
    return flagMisalignedCores(filteredCores, imageRotation, false);
  }

  filteredCores = assignMarkerCoresToGrid(
    filteredCores,
    imageRotation,
    params,
    { ...options, updateStatus: false }
  );

  filteredCores = refineCoresWithAffineLattice(
    filteredCores,
    imageRotation,
    params,
    options
  );

  filteredCores = enforceLeftToRightColumnOrder(filteredCores, imageRotation);

  filteredCores = flagMisalignedCores(filteredCores, imageRotation, false);

  return filteredCores;
}

function metadataValuesMatch(left, right) {
  const normalizedLeft = String(left ?? "").trim();
  const normalizedRight = String(right ?? "").trim();
  const numericLeft = Number(normalizedLeft);
  const numericRight = Number(normalizedRight);

  if (Number.isFinite(numericLeft) && Number.isFinite(numericRight)) {
    return numericLeft === numericRight;
  }

  return normalizedLeft === normalizedRight;
}

function finalizeSaveData() {
  // Create finalSaveData by mapping over sortedCoresData
  const finalSaveData = window.sortedCoresData
    .filter((core) => !core.isMarker)
    .map((core) => {
      return sanitizeCoreMetadata({
        ...core,
        x: core.x / (window.ndpiScalingFactor ?? 1),
        y: core.y / (window.ndpiScalingFactor ?? 1),
        currentRadius: core.currentRadius / (window.ndpiScalingFactor ?? 1),
        row: core.row + 1,
        col: core.col + 1,
      });
    });

  // Check if there's uploaded metadata to update
  if (window.userUploadedMetadata && window.userUploadedMetadata.length > 0) {
    // Assuming the row and column names are stored in these variables
    const metadataRowName = window.metadataRowName;
    const metadataColName = window.metadataColName;

    // Update userUploadedMetadata with sortedCoresData information
    finalSaveData.forEach((core) => {
      // Finding the matching metadata entry by row and column values
      const metadataEntry = window.userUploadedMetadata.find(
        (entry) =>
          metadataValuesMatch(entry[metadataRowName], core.row) &&
          metadataValuesMatch(entry[metadataColName], core.col)
      );

      if (metadataEntry) {
        // Merge the core data into the metadata entry

        // core["calculated_row"] = core.row;
        // core["calculated_col"] = core.col;
        delete core.row;
        delete core.col;

        for (let key in core) {
          if (!isExportedMetadataField(key, core[key])) {
            continue;
          }
          // You might want to exclude some properties that should not be merged
          // if (key !== 'propertyToExclude') {
          metadataEntry[key] = core[key];
          // }
        }
        // update the finalSaveData with the metadataEntry
        return metadataEntry;
      }
    });

    window.finalSaveData = window.userUploadedMetadata.map(sanitizeCoreMetadata);
  } else {
    // Return the finalSaveData
    window.finalSaveData = finalSaveData;
  }
}

async function obtainHyperparametersAndDrawVirtualGrid() {
  // Check if there are marker cores and if there are, alert the user to assign indices to them, or they will not show up in the virtual grid
  const sortedCoresData = window.sortedCoresData || [];
  const markerCores = sortedCoresData.filter(
    (core) => core.isMarker && !core.offGridMarker
  );

  if (sortedCoresData.length === 0) {
    setGriddingStatus(
      "loading",
      "Grid markers are still loading",
      "Wait for gridding to finish before creating the virtual grid."
    );
    return;
  }

  if (
    markerCores.length > 0 &&
    !window.confirm(
      `${markerCores.length} marker core${
        markerCores.length === 1 ? "" : "s"
      } could not be placed automatically. Continue without them?`
    )
  ) {
    return;
  }

  finalizeSaveData();

  const horizontalSpacing = parseInt(
    document.getElementById("horizontalSpacing").value,
    10
  );

  const verticalSpacing = parseInt(
    document.getElementById("verticalSpacing").value,
    10
  );
  const startingX = parseInt(document.getElementById("startingX").value, 10);
  const startingY = parseInt(document.getElementById("startingY").value, 10);

  document.getElementById("virtualGridTabButton").disabled = false;
  document.getElementById("virtualGridTabButton").click();

  setVirtualGridStatus(
    "loading",
    "Building virtual grid",
    `Preparing previews for ${window.finalSaveData.length} cores.`
  );

  try {
    await createVirtualGrid(
      window.finalSaveData,
      horizontalSpacing,
      verticalSpacing,
      startingX,
      startingY,
      true
    );
    clearVirtualGridStatus();
  } catch (error) {
    console.error("Error creating virtual grid:", error);
    setVirtualGridStatus(
      "error",
      "Virtual grid could not be built",
      "Try creating the virtual grid again or check source image access."
    );
  }

  // If an element with id of popupGridding exists, show the popup

  var element = document.getElementById("popupGridding");

  if (element) {
    showPopup("popupGridding");
  }
}

async function createVirtualGrid(
  sortedCoresData,
  horizontalSpacing,
  verticalSpacing,
  startingX,
  startingY,
  firstRun = false
) {
  if (!Array.isArray(sortedCoresData) || sortedCoresData.length === 0) {
    setVirtualGridStatus(
      "empty",
      "No cores are available for the virtual grid",
      "Return to gridding and make sure at least one core is placed."
    );
    return;
  }

  const imageSrc = document.getElementById("imageUrlInput").value
    ? document.getElementById("imageUrlInput").value
    : document.getElementById("fileInput").files.length > 0
    ? document.getElementById("fileInput").files[0]
    : window.boxFileInfo
    ? URL.createObjectURL(window.boxFile)
    : "path/to/default/image.jpg";

  if (
    window.uploadedImageFileType === "svs" ||
    window.uploadedImageFileType === "tiff" ||
    (window.uploadedImageFileType === "ndpi" && !window.ndpiScalingFactor)
  ) {
    // if (firstRun) {
    // Hide the virtual grid canvas
    const virtualGridCanvas = document.getElementById("virtualGridCanvas");
    virtualGridCanvas.style.display = "none";
    document.getElementById("VirtualGridSVSContainer").style.display = "grid";
    setVirtualGridStatus(
      "loading",
      "Loading core previews",
      `Fetching ${sortedCoresData.filter((core) => !core.isMarker).length} core image tiles.`
    );

    // Update the grid spacing and starting position
    updateGridSpacingInVirtualGridForSVS(
      horizontalSpacing,
      verticalSpacing,
      startingX,
      startingY
    );

    await drawVirtualGridFromWSI(imageSrc, sortedCoresData, 64);
    // } else {
    //   updateGridSpacingInVirtualGridForSVS(
    //     horizontalSpacing,
    //     verticalSpacing,
    //     startingX,
    //     startingY
    //   );
    // }
  } else {
    // Hide the virtual grid container
    const virtualGridDiv = document.getElementById("VirtualGridSVSContainer");
    virtualGridDiv.style.display = "none";
    document.getElementById("virtualGridCanvas").style.display = "block";
    setVirtualGridStatus(
      "loading",
      "Drawing virtual grid",
      "Cropping cores from the loaded image preview."
    );

    await drawVirtualGridFromPNG(
      sortedCoresData,
      horizontalSpacing,
      verticalSpacing,
      startingX,
      startingY
    );
  }
}

// Move the initiateDownload function outside of createImageForCore
async function initiateDownload(
  svsImageURL,
  core,
  coreWidth,
  coreHeight,
  fileName
) {
  const downloadLink = document.createElement("a");

  if (
    window.uploadedImageFileType === "svs" ||
    window.uploadedImageFileType === "tiff"
  ) {
    // Use the getRegionFromWSI function to download the full resolution version of the image
    const fullResTileParams = getCoreRegionParams(core, coreWidth);

    const fullSizeImageResp = await getRegionFromWSI(
      svsImageURL,
      fullResTileParams
    );
    const blob = await coerceImageResponseToBlob(fullSizeImageResp);

    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  } else if (window.uploadedImageFileType === "ndpi") {
    // Construct the URL for the imageboxv2 API
    const imageUrl = encodeURIComponent(svsImageURL); // Ensure the URL is properly encoded
    const topLeftX = parseInt(core.x - core.currentRadius);
    const topLeftY = parseInt(core.y - core.currentRadius);
    const tileWidth = parseInt(coreWidth);
    const tileHeight = parseInt(coreHeight);
    const tileSize = parseInt(coreWidth); // Assuming tileSize is intended to be the same as tileWidth

    // Construct the URL for the API call
    const apiURL = `https://imageboxv2-oxxe7c4jbq-uc.a.run.app/iiif/?format=ndpi&iiif=${imageUrl}/${topLeftX},${topLeftY},${tileWidth},${tileHeight}/${Math.min(
      tileSize,
      3192
    )},/0/default.jpg`;

    // Initiate the download
    fetch(apiURL)
      .then((response) => response.blob()) // Convert the response to a Blob
      .then((blob) => {
        // Create a URL for the blob
        const blobUrl = URL.createObjectURL(blob);

        // Create a new download link
        const downloadLink = document.createElement("a");
        downloadLink.href = blobUrl;
        downloadLink.download = fileName; // Set the desired file name for the download

        // Trigger the download
        document.body.appendChild(downloadLink);
        downloadLink.click();

        // Clean up by revoking the Blob URL and removing the link
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(downloadLink);
      })
      .catch((error) => console.error("Error downloading the file:", error));
  }
}

// Create an array to store all the core containers
const coreContainers = [];

function adjustSidebarHeight() {
  const virtualGrid = document.getElementById("VirtualGrid");
  const sidebar = document.getElementById("virtual-grid-sidebar");

  if (virtualGrid && sidebar) {
    const virtualGridHeight = virtualGrid.offsetHeight; // Get the current height of the VirtualGrid
    sidebar.style.height = `${virtualGridHeight}px`; // Set the sidebar's height to match
  }
}

// Populate the editMetadataForm form with the uploaded metadata's fields
function populateAndEditMetadataForm(rowValue, colValue) {
  // Retrieve the row and column key names from the window object
  const rowKeyName = window.metadataRowName || "row";
  const colKeyName = window.metadataColName || "col";

  // Find the metadata object with the matching row and column values
  const metadataObj = (window.finalSaveData || []).find(
    (metadata) =>
      metadataValuesMatch(metadata[rowKeyName], rowValue) &&
      metadataValuesMatch(metadata[colKeyName], colValue)
  );

  if (metadataObj) {
    Object.keys(metadataObj).forEach((key) => {
      if (!isExportedMetadataField(key, metadataObj[key])) {
        delete metadataObj[key];
      }
    });

    // Get the form element
    const form = document.getElementById("editMetadataForm");

    // Clear existing form contents
    form.replaceChildren();
    form.className = "space-y-4";

    // Dynamically create form elements for each metadata property
    for (const key in metadataObj) {
      const value = metadataObj[key];
      const tooltipText = getMetadataTooltip(key, rowKeyName, colKeyName);

      // Determine input type based on the value type
      let inputType = "text"; // Default input type
      if (typeof value === "number") {
        inputType = "number";
      } else if (typeof value === "boolean") {
        inputType = "checkbox";
      }

      if (inputType === "checkbox") {
        // Create the checkbox container div
        const checkboxContainer = document.createElement("div");
        checkboxContainer.className = "custom-checkbox";

        // Create the hidden checkbox input
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = key;
        input.name = key;
        input.checked = value;
        applyElementTooltip(input, tooltipText);

        // Create the label element for the checkbox
        const label = document.createElement("label");
        label.setAttribute("for", key);
        label.className = "custom-checkbox-label";
        label.textContent = `${key}: `;
        applyElementTooltip(label, tooltipText);

        // Create the custom checkmark span
        const checkmark = document.createElement("span");
        checkmark.className = "checkmark";

        // Append the hidden checkbox and checkmark to the checkbox container
        checkboxContainer.appendChild(input);
        checkboxContainer.appendChild(checkmark);

        // Append the checkbox container to the label
        label.appendChild(checkboxContainer);

        // Append the label to the form
        form.appendChild(label);
      } else {
        // Create a label for non-checkbox inputs
        const label = document.createElement("label");
        label.setAttribute("for", key);
        label.textContent = key + ": ";
        label.className = "mb-2 text-sm font-medium text-gray-900";
        applyElementTooltip(label, tooltipText);

        // Create the text or number input
        const input = document.createElement("input");
        input.type = inputType;
        input.name = key;
        input.id = key;
        input.value = value;
        input.className =
          "bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5";
        applyElementTooltip(input, tooltipText);

        // Create a wrapper div for non-checkbox inputs
        const inputDiv = document.createElement("div");
        inputDiv.className = "flex flex-col mb-4";

        // Append the label and input to the wrapper div
        inputDiv.appendChild(label);
        inputDiv.appendChild(input);

        // Append the wrapper div to the form
        form.appendChild(inputDiv);
      }
    }

    // Create a submit button
    const submitButton = document.createElement("input");
    submitButton.type = "submit";
    submitButton.value = "Update Metadata";
    submitButton.className =
      "mt-4 px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 w-full";
    applyElementTooltip(
      submitButton,
      "Save the edited metadata values for the selected core."
    );
    form.appendChild(submitButton);

    // Create a button to add custom properties
    const addPropertyButton = document.createElement("button");
    addPropertyButton.type = "button";
    addPropertyButton.textContent = "Add Field";
    addPropertyButton.className =
      "mt-2 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 w-full";
    applyElementTooltip(
      addPropertyButton,
      "Add a new metadata field to every core and set its value for this core."
    );
    form.insertBefore(addPropertyButton, submitButton);

    // Handle adding custom properties
    addPropertyButton.onclick = function () {
      const customPropertyDiv = document.createElement("div");
      customPropertyDiv.className = "flex flex-col mb-4";

      const customPropertyLabel = document.createElement("span");
      customPropertyLabel.contentEditable = true;
      customPropertyLabel.dataset.placeholder = "Enter custom field name";
      customPropertyLabel.className =
        "mb-2 text-sm font-medium text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50";
      customPropertyLabel.style.borderBottom = "1px dashed #ccc";
      customPropertyLabel.style.paddingBottom = "2px";
      customPropertyLabel.style.display = "inline-block";
      customPropertyLabel.style.minWidth = "100px";
      applyElementTooltip(
        customPropertyLabel,
        "Name for the new metadata field that will be added to every core."
      );

      // Add placeholder text
      customPropertyLabel.textContent = "Enter custom field name";

      // Remove placeholder text when the label is focused
      customPropertyLabel.addEventListener("focus", function () {
        if (this.textContent === "Enter custom field name") {
          this.textContent = "";
          this.classList.remove("text-gray-400");
          this.classList.add("text-gray-900");
        }
      });

      // Add placeholder text when the label is empty and loses focus
      customPropertyLabel.addEventListener("blur", function () {
        if (this.textContent.trim() === "") {
          this.textContent = "Enter custom field name";
          this.classList.remove("text-gray-900");
          this.classList.add("text-gray-400");
        }
      });

      const customPropertyValueInput = document.createElement("input");
      customPropertyValueInput.type = "text";
      customPropertyValueInput.name = "customPropertyValue";
      customPropertyValueInput.placeholder = "Enter custom field value";
      customPropertyValueInput.className =
        "bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5";
      applyElementTooltip(
        customPropertyValueInput,
        "Value for this new field on the selected core."
      );

      customPropertyDiv.appendChild(customPropertyLabel);
      customPropertyDiv.appendChild(customPropertyValueInput);

      form.insertBefore(customPropertyDiv, addPropertyButton);

      // Set focus on the custom property label
      customPropertyLabel.focus();
    };

    // Handle form submission
    form.onsubmit = function (event) {
      event.preventDefault(); // Prevent traditional form submission

      // Ensure that the row/column values inputted are not a value that already exists in window.finalSaveData
      const newRowValue = Number(form.elements.namedItem(rowKeyName).value);
      const newColValue = Number(form.elements.namedItem(colKeyName).value);

      if (
        (newRowValue !== rowValue || newColValue !== colValue) &&
        window.finalSaveData.some(
          (core) =>
            core[rowKeyName] === newRowValue && core[colKeyName] === newColValue
        )
      ) {
        alert("A core with the same row and column values already exists.");
        return;
      }
      // Update the metadata object with new form values
      for (const key in metadataObj) {
        if (metadataObj.hasOwnProperty(key)) {
          const input = form.elements.namedItem(key);
          if (input.type === "checkbox") {
            metadataObj[key] = input.checked;
          } else {
            metadataObj[key] =
              input.type === "number" ? Number(input.value) : input.value;
          }
        }
      }

      // Add custom properties to all cores in window.finalSaveData
      const customPropertyLabels = form.querySelectorAll(
        'span[contenteditable="true"]'
      );
      const customPropertyValueInputs = form.querySelectorAll(
        'input[name="customPropertyValue"]'
      );

      for (let i = 0; i < customPropertyLabels.length; i++) {
        const key = customPropertyLabels[i].textContent.trim();
        const value = customPropertyValueInputs[i].value.trim();

        if (key !== "") {
          // Add the custom property to all cores if it doesn't exist
          window.finalSaveData.forEach((core) => {
            if (!core.hasOwnProperty(key)) {
              core[key] = "";
            }
          });

          // Set the custom property value for the selected core
          if (value !== "") {
            metadataObj[key] = value;
          }
        }
      }

      // If the row and column values have been updated, update the virtual grid

      if (newRowValue !== rowValue || newColValue !== colValue) {
        updateVirtualGridSpacing();
      }

    };

    adjustSidebarHeight();
  } else {
    console.error("No matching metadata found for the given row and column.");
  }
}

async function createImageForCore(svsImageURL, core, coreSize = 64) {
  const coreWidth = core.currentRadius * 2;
  const coreHeight = core.currentRadius * 2;
  const tileParams = getCoreRegionParams(core, coreSize);

  // Create container div to hold the image and overlay
  const container = document.createElement("div");
  container.classList.add("image-container");

  // Create overlay div for displaying row and column
  const overlay = document.createElement("div");
  overlay.classList.add("image-overlay");
  overlay.textContent = `(${core.row}, ${core.col})`;

  // Double-click event for initiating download
  container.ondblclick = () => {
    const fileName = `core_${core.row}_${core.col}.png`; // Construct file name

    initiateDownload(svsImageURL, core, coreWidth, coreHeight, fileName);
  };

  container.onclick = () => {
    // Select the core
    populateAndEditMetadataForm(core.row, core.col);

    // Remove the active class from all cores
    coreContainers.forEach((container) => {
      container.classList.remove("active");
    });

    // Add the active class to the selected core
    container.classList.add("active");
  };

  // Append children to the container
  container.appendChild(overlay);

  // Add the container to the array of core containers
  coreContainers.push(container);

  try {
    const imageResp = await getRegionFromWSI(svsImageURL, tileParams, 1);
    const blob = await coerceImageResponseToBlob(imageResp);
    const img = new Image(coreSize, coreSize);

    // Set the width and height of the image to fill the container
    img.style.width = "100%";
    img.style.height = "100%";

    await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Core image failed to load."));
      };
      img.src = objectUrl;
    });

    container.prepend(img);
  } catch (error) {
    console.warn(
      `Could not render core preview at row ${core.row}, col ${core.col}.`,
      error
    );
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";
    placeholder.textContent = "Preview unavailable";
    container.classList.add("image-container-missing");
    container.prepend(placeholder);
  }

  return container;
}

function updateGridSpacingInVirtualGridForSVS(
  horizontalSpacing,
  verticalSpacing,
  startingX,
  startingY
) {
  const virtualGridDiv = document.getElementById("VirtualGridSVSContainer");
  virtualGridDiv.style.display = "grid";

  // Here we ensure that the gridTemplateColumns property sets the width of the grid items,
  virtualGridDiv.style.gridTemplateColumns = `repeat(auto-fill, 0fr)`;

  // Adjusting the gap property: first value for vertical spacing between rows, second value for horizontal spacing between columns
  // virtualGridDiv.style.gap = `${verticalSpacing}px ${horizontalSpacing}px`;

  // virtualGridDiv.style.padding = `${startingY}px ${startingX}px`;
  virtualGridDiv.style.width = "100%";
}

async function drawVirtualGridFromWSI(
  svsImageURL,
  sortedCoresData,
  coreSize = 256
) {
  // Do not draw the markers
  sortedCoresData = sortedCoresData.filter((core) => !core.isMarker);
  const virtualGridDiv = document.getElementById("VirtualGridSVSContainer");
  virtualGridDiv.replaceChildren();
  coreContainers.length = 0;

  if (sortedCoresData.length === 0) {
    setVirtualGridStatus(
      "empty",
      "No non-marker cores are available",
      "Marker-only grids cannot create core previews."
    );
    return;
  }

  // Calculate grid dimensions
  const minRow = Math.min(...sortedCoresData.map((core) => core.row));
  const minCol = Math.min(...sortedCoresData.map((core) => core.col));
  const maxRow = Math.max(...sortedCoresData.map((core) => core.row));
  const maxCol = Math.max(...sortedCoresData.map((core) => core.col));
  const rowsAreZeroBased = minRow === 0;
  const colsAreZeroBased = minCol === 0;
  const rowCount = rowsAreZeroBased ? maxRow + 1 : maxRow;
  const colCount = colsAreZeroBased ? maxCol + 1 : maxCol;
  const getDisplayRow = (core) => (rowsAreZeroBased ? core.row + 1 : core.row);
  const getDisplayCol = (core) => (colsAreZeroBased ? core.col + 1 : core.col);

  // Create and append column headers
  for (let col = 1; col <= colCount; col++) {
    const columnHeader = document.createElement("div");
    columnHeader.textContent = `${col}`;
    columnHeader.style.gridRow = 1; // Place in the first row
    columnHeader.style.gridColumn = col + 1; // Offset by 1 for headers
    columnHeader.classList.add("grid-header");
    virtualGridDiv.appendChild(columnHeader);
  }

  // Create and append row headers
  for (let row = 1; row <= rowCount; row++) {
    const rowHeader = document.createElement("div");
    rowHeader.textContent = `${row}`;
    rowHeader.style.gridColumn = 1; // Place in the first column
    rowHeader.style.gridRow = row + 1; // Offset by 1 for headers
    rowHeader.classList.add("grid-header");
    virtualGridDiv.appendChild(rowHeader);
  }

  // Adjust the container to include headers in its grid template
  virtualGridDiv.style.gridTemplateColumns = `auto repeat(${colCount}, 1fr)`;
  virtualGridDiv.style.gridTemplateRows = `auto repeat(${rowCount}, 1fr)`;

  const concurrencyLimit = 1;
  let activePromises = [];
  let loadedCoreCount = 0;
  let renderedCoreCount = 0;
  const appendLoadedImages = (images) => {
    const loadedImages = images.filter(Boolean);
    loadedCoreCount += images.length;
    renderedCoreCount += loadedImages.length;
    loadedImages.forEach((img) => virtualGridDiv.appendChild(img));
    setVirtualGridStatus(
      "loading",
      "Loading core previews",
      `${loadedCoreCount}/${sortedCoresData.length} cores checked; ${renderedCoreCount} previews loaded.`
    );
  };

  for (const core of sortedCoresData) {
    const promise = createImageForCore(svsImageURL, core, coreSize).then(
      (img) => {
        // Position the image in the grid based on the core's row and col properties
        img.style.gridColumn = getDisplayCol(core) + 1; // CSS grid lines are 1-based
        img.style.gridRow = getDisplayRow(core) + 1;
        return img;
      }
    ).catch((error) => {
      console.warn(
        `Skipping core at row ${core.row}, col ${core.col} after preview failure.`,
        error
      );
      return null;
    }
    );
    activePromises.push(promise);

    if (activePromises.length >= concurrencyLimit) {
      await Promise.all(activePromises).then(appendLoadedImages);
      activePromises = [];
    }
  }
  await Promise.all(activePromises).then(appendLoadedImages);

  if (renderedCoreCount === 0) {
    setVirtualGridStatus(
      "error",
      "No core previews could be loaded",
      "Check source image access and try building the virtual grid again."
    );
    throw new Error("No core previews could be loaded.");
  }
}

function drawVirtualGridFromPNG(
  sortedCoresData,
  horizontalSpacing,
  verticalSpacing,
  startingX,
  startingY
) {
  // filter out cores with isMarker
  sortedCoresData = sortedCoresData.filter((core) => !core.isMarker);
  if (sortedCoresData.length === 0) {
    setVirtualGridStatus(
      "empty",
      "No non-marker cores are available",
      "Marker-only grids cannot create core previews."
    );
    return Promise.resolve();
  }

  let imageSrc = null;
  if (window.uploadedImageFileType === "ndpi") {
    imageSrc = document.getElementById("originalImage").src;
  } else {
    imageSrc = window.loadedImg
      ? window.loadedImg.src
      : document.getElementById("fileInput").files.length > 0
      ? URL.createObjectURL(document.getElementById("fileInput").files[0])
      : "path/to/default/image.jpg";
  }

  const virtualGridCanvas = document.getElementById("virtualGridCanvas");
  if (!virtualGridCanvas) {
    console.error("Virtual grid canvas not found");
    return;
  }

  const rows =
    sortedCoresData.reduce((acc, core) => Math.max(acc, core.row), 0) +1;
  const cols =
    sortedCoresData.reduce((acc, core) => Math.max(acc, core.col), 0) + 1;
  const defaultRadius = parseInt(document.getElementById("userRadius").value);
  // Adjust canvas size to make space for row and column markers
  virtualGridCanvas.width =
    cols * horizontalSpacing + defaultRadius * 2 + startingX + 50; // Added space for row markers
  virtualGridCanvas.height = rows * verticalSpacing + defaultRadius * 2; // Added space for column markers

  const vctx = virtualGridCanvas.getContext("2d");
  const img = new Image();
  img.src = imageSrc;

  let selectedCore = null; // Keep track of the selected core

  return new Promise((resolve, reject) => {
    img.onload = () => {
      vctx.clearRect(0, 0, virtualGridCanvas.width, virtualGridCanvas.height);

      // Draw row markers
      for (let i = 1; i < rows; i++) {
        vctx.font = "bold 16px Arial";

        vctx.fillText(i, 10, startingY + i * verticalSpacing + 10);
      }

      // Draw column markers
      for (let j = 1; j < cols; j++) {
        vctx.font = "bold 16px Arial";
        vctx.fillText(j, startingX + j * horizontalSpacing, 20);
      }

      sortedCoresData.forEach((core) => {
        const idealX = startingX + core.col * horizontalSpacing;
        const idealY = startingY + core.row * verticalSpacing;
        const userRadius = core.currentRadius * window.scalingFactor;

        vctx.save();
        vctx.beginPath();
        vctx.arc(idealX, idealY, userRadius, 0, Math.PI * 2, true);
        vctx.closePath();

        // Highlight the selected core
        if (
          selectedCore &&
          selectedCore.row === core.row &&
          selectedCore.col === core.col
        ) {
          vctx.strokeStyle = "#FFD700"; // Gold color for selection
          vctx.lineWidth = 4; // Thicker border for selected core
          vctx.shadowBlur = 10; // Glow effect
          vctx.shadowColor = "#FFD700"; // Glow color matches the border
        } else {
          // Default style for non-selected cores
          vctx.strokeStyle = core.isImaginary ? "red" : "green";
          vctx.lineWidth = 2;
          vctx.shadowBlur = 0;
        }

        vctx.stroke();

        vctx.clip();

        const sourceX = core.x * window.scalingFactor - userRadius;
        const sourceY = core.y * window.scalingFactor - userRadius;

        vctx.drawImage(
          img,
          sourceX,
          sourceY,
          userRadius * 2,
          userRadius * 2,
          idealX - userRadius,
          idealY - userRadius,
          userRadius * 2,
          userRadius * 2
        );

        vctx.restore();
      });
      resolve();
    };

    img.onerror = () => {
      reject(new Error("Image failed to load."));
    };
  });

  virtualGridCanvas.onclick = (event) => {
    const [x, y] = getMousePosition(event, "virtualGridCanvas");
    sortedCoresData.forEach((core) => {
      const idealX = startingX + core.col * horizontalSpacing;
      const idealY = startingY + core.row * verticalSpacing;
      const userRadius = core.currentRadius * window.scalingFactor;
      const distance = Math.sqrt(
        Math.pow(x - idealX, 2) + Math.pow(y - idealY, 2)
      );

      if (distance < userRadius) {
        selectedCore = core; // Update the selected core
        populateAndEditMetadataForm(selectedCore.row, selectedCore.col);
        img.onload(); // Redraw the canvas to show the selection
      }
    });
  };
}

async function updateVirtualGridSpacing(
  horizontalSpacing,
  verticalSpacing,
  startingX,
  startingY
) {
  const virtualGridCanvas = document.getElementById("virtualGridCanvas");
  const vctx = virtualGridCanvas.getContext("2d");
  const nextHorizontalSpacing = Number.isFinite(horizontalSpacing)
    ? horizontalSpacing
    : parseInt(document.getElementById("horizontalSpacing").value, 10);
  const nextVerticalSpacing = Number.isFinite(verticalSpacing)
    ? verticalSpacing
    : parseInt(document.getElementById("verticalSpacing").value, 10);
  const nextStartingX = Number.isFinite(startingX)
    ? startingX
    : parseInt(document.getElementById("startingX").value, 10);
  const nextStartingY = Number.isFinite(startingY)
    ? startingY
    : parseInt(document.getElementById("startingY").value, 10);
  setVirtualGridStatus(
    "loading",
    "Updating virtual grid",
    "Applying spacing changes to the current core layout."
  );

  // Clear the existing grid
  vctx.clearRect(0, 0, virtualGridCanvas.width, virtualGridCanvas.height);

  // Redraw the grid with new spacings
  try {
    await createVirtualGrid(
      window.finalSaveData,
      nextHorizontalSpacing * 1.25,
      nextVerticalSpacing * 1.25,
      nextStartingX,
      nextStartingY
    );
    clearVirtualGridStatus();
  } catch (error) {
    console.error("Error updating virtual grid:", error);
    setVirtualGridStatus(
      "error",
      "Virtual grid could not be updated",
      "Try applying the grid settings again."
    );
  }
}

// Function to redraw the cores on the canvas
function redrawCoresForTravelingAlgorithm() {
  const imageFile = window.loadedImg
    ? window.loadedImg.src
    : document.getElementById("fileInput").files.length > 0
    ? URL.createObjectURL(document.getElementById("fileInput").files[0])
    : "path/to/default/image.jpg";

  if (imageFile && window.preprocessedCores) {
    drawCoresOnCanvasForTravelingAlgorithm();
  } else {
    alert("Please load an image first.");
  }
}

export {
  drawCoresOnCanvasForTravelingAlgorithm,
  applyAndVisualizeTravelingAlgorithm,
  createVirtualGrid,
  updateVirtualGridSpacing,
  redrawCoresForTravelingAlgorithm,
  visualizeSegmentationResults,
  obtainHyperparametersAndDrawVirtualGrid,
  undo,
  redo,
};
