import { getHyperparametersFromUI } from "./UI.js";
import {
  rotatePoint,
  runTravelingAlgorithm,
  updateSpacingInVirtualGrid,
} from "./data_processing.js";

import { preprocessCores } from "./delaunay_triangulation.js";

import { positionSidebarNextToCore, hideSidebar, showPopup } from "./UI.js";

import * as tf from "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/+esm";

import { getRegionFromWSI } from "./wsi.js";

// const OSD_WIDTH_SCALEDOWN_FACTOR_FOR_EDIT_SIDEBAR = 0.8; // Adjust for the 20% width of the add core sidebar.

let lastActionTime = 0;
const actionDebounceInterval = 500; // milliseconds

// Pure function to get input values
const getInputValue = (inputId) => document.getElementById(inputId).value;

// Global variables to hold the history for undo and redo
window.actionHistory = [];
let currentActionIndex = -1;

let MIN_CORE_WIDTH_PROPORTION = 0.01;

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

  if (event.shiftKey) {
    // If the shift key is pressed, remove a core
    removeCore(offsetX, offsetY);
  } else {
    // Otherwise, add a core
    addCore(offsetX, offsetY);
  }
}

// Function to add a core
function addCore(x, y) {
  const newCore = { x, y, radius: 10 }; // Set radius as needed
  window.properties.push(newCore);
  console.log("Added core:", newCore);
  window.preprocessedCores = preprocessCores(window.properties);
  recordAction({ type: "add", core: newCore });
  redrawCanvas();
}

// Function to remove the nearest core
function removeCore(x, y) {
  const indexToRemove = findNearestCoreIndex(x, y);
  if (indexToRemove !== -1) {
    const removedCore = window.properties.splice(indexToRemove, 1)[0];
    console.log("Removed core:", removedCore);
    window.preprocessedCores = preprocessCores(window.properties);
    recordAction({ type: "remove", core: removedCore });
    redrawCanvas();
  }
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
  return await tf.tidy(() => {
    const clippedPredictions = predictions.clipByValue(0, 1);
    const resizedPredictions = tf.image.resizeBilinear(
      clippedPredictions,
      [1024, 1024]
    );
    const squeezedPredictions = resizedPredictions.squeeze();
    return squeezedPredictions.arraySync(); // Convert to a regular array for pixel manipulation
  });
}

function drawMask(ctx, mask, alpha, width, height) {
  // Create a temporary canvas to draw the mask
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");

  // Set the dimensions of the mask canvas
  maskCanvas.width = width;
  maskCanvas.height = height;

  // Create ImageData to store mask pixels
  const maskImageData = maskCtx.createImageData(width, height);
  const maskData = maskImageData.data;

  // Iterate over the mask array to set pixels on the mask canvas
  mask.forEach((row, i) => {
    row.forEach((maskValue, j) => {
      const index = (i * width + j) * 4;
      maskData[index] = 255; // Red
      maskData[index + 1] = 0; // Green
      maskData[index + 2] = 0; // Blue
      maskData[index + 3] = maskValue * 255; // Alpha channel
    });
  });

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
function connectAdjacentCores(core, updateSurroundings = false) {
  if (
    !document.getElementById("connectCoresCheckbox").checked ||
    core.isMarker
  ) {
    // If the checkbox is checked, draw lines between adjacent cores
    return;
  }

  if (
    isNaN(parseInt(core.row)) ||
    isNaN(parseInt(core.col)) ||
    core.isTemporary
  ) {
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
    const adjacentCore = window.sortedCoresData.find(
      (c) => c.row === core.row + pos[0] && c.col === core.col + pos[1]
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
            const row = parseInt(overlay.element.id.split("_")[2]);
            const col = parseInt(overlay.element.id.split("_")[4]);
            const coreIndex = window.sortedCoresData.findIndex(
              (core) => core.row === row && core.col === col
            );
            if (coreIndex !== -1) {
              const overlayBoundsInImageCoords =
                window.viewer.viewport.viewportToImageRectangle(
                  overlay.getBounds(window.viewer.viewport)
                );
              window.sortedCoresData[coreIndex]["x"] =
                overlayBoundsInImageCoords.x +
                overlayBoundsInImageCoords.width / 2;
              window.sortedCoresData[coreIndex]["y"] =
                overlayBoundsInImageCoords.y +
                overlayBoundsInImageCoords.height / 2;
              window.sortedCoresData[coreIndex]["currentRadius"] =
                overlayBoundsInImageCoords.width / 2;
              connectAdjacentCores(window.sortedCoresData[coreIndex], true);
              updateSidebar(window.sortedCoresData[coreIndex]);
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
  window.sortedCoresData.forEach(drawCore);
  window.sortedCoresData.forEach((core) => {
    connectAdjacentCores(core, false);
  });
}

function drawCore(core, index = -1) {
  // Add overlay element on the OSD viewer

  const overlayElement = document.createElement("div");
  overlayElement.className = "core-overlay-for-gridding";

  const overlayTitleDiv = document.createElement("div");
  overlayTitleDiv.className = "core-overlay-title-div";

  if (core.row >= 0 && core.col >= 0) {
    overlayElement.id = `core_row_${core.row}_col_${core.col}`;
    if (window.viewer.getOverlayById(overlayElement.id)) {
      window.viewer.removeOverlay(overlayElement.id);
    }
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
  if (core.isTemporary) {
    overlayElement.classList.add("temporary");
  }
  if (core.isSelected) {
    overlayElement.classList.add("selected");
  }

  if (core.isMarker) {
    overlayElement.classList.add("marker");
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

    clickHandler: overlayClickHandler,

    dblClickHandler: (e) => {
      const overlay = window.viewer.getOverlayById(overlayElement);
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

        // Set new row of selected core
        window.sortedCoresData[index].row = newRow;

        // Only update if the core isn't a marker
        updateRowsInGridAfterMovement(oldRow, newRow);

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
    const row = parseInt(overlay.element.id.split("_")[2]);
    const col = parseInt(overlay.element.id.split("_")[4]);
    if (!isNaN(row) && !isNaN(col)) {
      const core = window.sortedCoresData.find(
        (core) => core.row === row && core.col === col
      );
      removeCoreFromGrid(core);
    } else if (overlay.element.classList.contains("temporary")) {
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

      // Get the core data from the sortedCoresData array
      const row = parseInt(overlay.element.id.split("_")[2]);
      const col = parseInt(overlay.element.id.split("_")[4]);
      const coreData = window.sortedCoresData.find(
        (core) => core.row === row && core.col === col
      );
      // Set the core data in the JSONEditor
      window.jsonEditor.set(coreData);
    }
  }
};

// Modified updateSidebar function to handle add mode
function updateSidebar(core) {
  // const sidebarPrefix = currentMode === "edit" ? "edit" : "add";
  const sidebarPrefix = "edit";

  if (!core.isMarker) {
    document.getElementById(sidebarPrefix + "RowInput").value = core
      ? core.row + 1
      : "";
    document.getElementById(sidebarPrefix + "ColumnInput").value = core
      ? core.col + 1
      : "";
  } else {
    document.getElementById(sidebarPrefix + "RowInput").value = core
      ? core.row
      : "";
    document.getElementById(sidebarPrefix + "ColumnInput").value = core
      ? core.col
      : "";
  }

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
  if (
    !oldRow &&
    !document.getElementById("editRowInput").value &&
    !document.getElementById("editAutoUpdateRowsCheckbox").checked
  ) {
    alert("Please enter a value for the row");
    return false;
  }

  if (document.getElementById("editRowInput").value != -1) {
    core.row = parseInt(document.getElementById("editRowInput").value, 10) - 1;
    core.col =
      parseInt(document.getElementById("editColumnInput").value, 10) - 1;
  } else {
    core.row = parseInt(document.getElementById("editRowInput").value, 10);
    core.col = parseInt(document.getElementById("editColumnInput").value, 10);
  }

  core.x =
    parseFloat(document.getElementById("editXInput").value) /
    window.scalingFactor;
  core.y =
    parseFloat(document.getElementById("editYInput").value) /
    window.scalingFactor;
  core.currentRadius =
    parseFloat(document.getElementById("editRadiusInput").value) /
    window.scalingFactor;
  core.annotations = document.getElementById("editAnnotationsInput").value;

  // Update the isImaginary property based on which radio button is checked
  core.isImaginary = document.getElementById("editImaginaryInput").checked;

  // Update the isMarker property based on which radio button is checked
  core.isMarker = document.getElementById("editIsMarkerInput").checked;

  const coreIndex = window.sortedCoresData.findIndex(
    (prevCore) => prevCore.x === core.x && prevCore.y === core.y
  );

  if (
    document.getElementById("editAutoUpdateRowsCheckbox").checked &&
    !document.getElementById("editIsMarkerInput").checked
  ) {
    core.row = determineCoreRow(core, window.sortedCoresData);
  }

  if (document.getElementById("editAutoUpdateColumnsCheckbox").checked) {
    if (!core.isMarker) {
      updateColumnsInRowAfterModification(core.row);
    }
    if (oldRow !== core.row) {
      updateColumnsInRowAfterModification(oldRow);
    }

    window.sortedCoresData[coreIndex] = core;

    updateSidebar(core);
  }

  core.isTemporary = false;
  core.isSelected = false;

  const imageRotation = parseFloat(
    document.getElementById("originAngle").value
  );

  // Reflag for misaligned cores
  window.sortedCoresData = flagMisalignedCores(
    window.sortedCoresData,
    imageRotation,
    false
  );

  drawCores(); // Redraw the cores with the updated data

  return true;
}

// Picks the row with the closest rotated median Y value to the rotated median Y value of the core
function determineCoreRow(core, sortedCoresData) {
  let imageRotation = parseFloat(document.getElementById("originAngle").value);

  // Determine rotated median Y value of each row
  const medianRows = Object.values(
    determineMedianRowColumnValues(sortedCoresData, imageRotation).rows
  );

  // Determine the rotated Y value of the core
  const rotatedY = rotatePoint([core.x, core.y], -imageRotation)[1];

  // Determine the row with the closest rotated median Y value to the rotated median Y value of the core
  let closestRow = 0;
  let closestDistance = Infinity;
  for (let i = 0; i < medianRows.length; i++) {
    const distance = Math.abs(medianRows[i].medianY - rotatedY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestRow = i;
    }
  }
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
  updateRowsInGridAfterRemoval(oldRow);
  updateColumnsInRowAfterModification(newRow);
}

function removeCoreFromGrid(core) {
  let coreIndex = window.sortedCoresData.findIndex(
    (coreToRemove) => coreToRemove.x === core.x && coreToRemove.y === core.y
  );

  if (coreIndex === -1) {
    console.log("Core not found in sortedCoresData");
    return;
  }

  if (!core.isTemporary && !core.isMarker) {
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

  // Create an array to hold the original cores with their rotated coordinates for sorting
  const coresWithRotatedCoordinates = window.sortedCoresData
    .filter((core) => core.row === row)
    .map((core) => {
      return {
        originalCore: core,
        rotatedCoordinates: rotatePoint([core.x, core.y], -imageRotation),
      };
    });

  // Sort the array based on the x-value of the rotated coordinates
  coresWithRotatedCoordinates.sort(
    (a, b) => a.rotatedCoordinates[0] - b.rotatedCoordinates[0]
  );

  // Assign column values based on the sorted array, updating only the column in the original data
  let currentColumn = 0;
  coresWithRotatedCoordinates.forEach((item) => {
    item.originalCore.col = currentColumn;
    currentColumn++;
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
      isTemporary: true,
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

// Function to find the optimal angle that minimizes imaginary cores
async function findOptimalAngle(
  preprocessedCores,
  getHyperparameters,
  runAlgorithm,
  updateUI
) {
  let targetRange = { start: -10, end: 10 };
  let searchIncrement = 1;
  let optimalAnglesData = []; // Track angles and their stats for comparison

  // Function to evaluate each angle
  const evaluateAngle = async (angle) => {
    updateUI(angle);
    const hyperparameters = getHyperparameters(angle);
    let sortedCoresData = await runAlgorithm(
      preprocessedCores,
      hyperparameters
    );
    sortedCoresData = filterAndReassignCores(sortedCoresData, angle);
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

  // Initial targeted search
  for (
    let angle = targetRange.start;
    angle <= targetRange.end;
    angle += searchIncrement
  ) {
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
    return;
  }
  let hyperparameters;
  if (firstRun) {
    // Helper function to update the angle in the UI and return updated hyperparameters
    const updateUIAndHyperparameters = (angle) => {
      document.getElementById("originAngle").value = angle.toString();
      document.getElementById("originAngleValue").innerText = angle.toString();

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
      (angle) =>
        (document.getElementById("originAngle").value = angle.toString())
    );

    // Update UI with the optimal angle
    hyperparameters = updateUIAndHyperparameters(optimalAngle);

    //
  } else {
    hyperparameters = getHyperparametersFromUI();
  }

  // Run the algorithm with the optimal angle found
  let sortedCoresData = await runTravelingAlgorithm(
    window.preprocessedCores,
    hyperparameters
  );

  sortedCoresData = filterAndReassignCores(
    sortedCoresData,
    hyperparameters.originAngle
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

  // Visualize the cores
  drawCoresOnCanvasForTravelingAlgorithm();
}

function removeImaginaryCoresFilledRowsAndColumns(coresData) {
  // Calculate imaginary core counts
  let rowImaginaryCounts = {};
  let colImaginaryCounts = {};
  let rowCount = {};
  let colCount = {};

  // Initialize counts
  coresData.forEach((core) => {
    rowCount[core.row] = (rowCount[core.row] || 0) + 1;
    colCount[core.col] = (colCount[core.col] || 0) + 1;
    if (core.isImaginary) {
      rowImaginaryCounts[core.row] = (rowImaginaryCounts[core.row] || 0) + 1;
      colImaginaryCounts[core.col] = (colImaginaryCounts[core.col] || 0) + 1;
    }
  });

  // Filter cores
  coresData = coresData.filter((core) => {
    let rowImaginaryRatio =
      (rowImaginaryCounts[core.row] || 0) / rowCount[core.row];
    let colImaginaryRatio =
      (colImaginaryCounts[core.col] || 0) / colCount[core.col];
    return !(
      core.isImaginary &&
      (rowImaginaryRatio >= 0.75 || colImaginaryRatio >= 0.8)
    );
  });

  return coresData;
}

function determineMedianRowColumnValues(coresData, imageRotation) {
  // Initialize structures to hold separated X and Y values for rows and columns
  const rowValues = {};
  const columnValues = {};

  // Calculate rotated values and separate X and Y for each row and column
  coresData.forEach((core) => {
    if (!core.isTemporary && !core.isMarker) {
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

    // If the core's rotated X value is 1 radius outside of the median rotatedX value or if the core's column has less than two cores, mark it as misaligned.
    if (
      Math.abs(medianRotatedXValues[core.col] - rotatedX) >
      1 * core.currentRadius
    ) {
      core.isMisaligned = true;
    } else {
      core.isMisaligned = false;
    }

    // If there's another core with the same row and column, also mark it as misaligned
    if (
      coresData.some(
        (otherCore) =>
          otherCore !== core &&
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
            1.25 * core.currentRadius
        )
      ) {
        core.row = -1;
        core.col = -1;
        core.isMarker = true;
      } else {
        core.isMarker = false;
      }
    }
  });

  return coresData;
}

function reassignCoreIndices(coresData) {
  // Sort by row and col for consistent processing
  coresData.sort((a, b) => a.row - b.row || a.col - b.col);

  // Reassign row indices
  let rowMap = {};
  let rowIndex = 0;
  coresData
    .map((core) => core.row)
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a - b)
    .forEach((originalRow) => {
      if (originalRow != -1) {
        rowMap[originalRow] = rowIndex++;
      } else {
        rowMap[originalRow] = originalRow;
      }
    });

  // Reassign column indices within each row
  coresData.forEach((core) => {
    core.row = rowMap[core.row]; // Update row to new mapping
  });

  // For each row, assign consecutive col indices starting from 0
  let lastRow = -1;
  let colIndex = 0;
  coresData.forEach((core) => {
    if (core.row !== lastRow) {
      // New row
      lastRow = core.row;
      colIndex = 0;
    }
    core.col = colIndex++;
  });
  return coresData;
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

    core.col = parseInt(nearestCol);
  });

  return coresData;
}

function filterAndReassignCores(coresData, imageRotation) {
  let filteredCores = flagMisalignedCores(coresData, imageRotation, true);

  filteredCores = alignMisalignedCores(filteredCores, imageRotation);

  filteredCores = removeImaginaryCoresFilledRowsAndColumns(filteredCores);

  filteredCores = reassignCoreIndices(filteredCores);

  filteredCores = flagMisalignedCores(filteredCores, imageRotation, true);
  return filteredCores;
}

function finalizeSaveData() {
  // Create finalSaveData by mapping over sortedCoresData
  const finalSaveData = window.sortedCoresData.map((core) => {
    return {
      ...core,
      x: core.x,
      y: core.y,
      currentRadius: core.currentRadius,
      row: core.row + 1,
      col: core.col + 1,
    };
  });

  // Check if there's uploaded metadata to update
  if (window.userUploadedMetadata && window.userUploadedMetadata.length > 0) {
    // Assuming the row and column names are stored in these variables
    const metadataRowName = window.metadataRowName;
    const metadataColName = window.metadataColName;

    // Update userUploadedMetadata with sortedCoresData information
    finalSaveData.forEach((core) => {
      // Finding the matching metadata entry by row and column values
      const metadataEntry = window.userUploadedMetadata.find((entry) => {
        // Ensure both row and column values match
        // Using double equals (==) to allow for type coercion in case one is a string and the other is a number
        return (
          entry[metadataRowName] == core.row &&
          entry[metadataColName] == core.col
        );
      });

      if (metadataEntry) {
        // Merge the core data into the metadata entry

        // core["calculated_row"] = core.row;
        // core["calculated_col"] = core.col;
        delete core.row;
        delete core.col;

        for (let key in core) {
          // You might want to exclude some properties that should not be merged
          // if (key !== 'propertyToExclude') {
          metadataEntry[key] = core[key];
          // }
        }
        // update the finalSaveData with the metadataEntry
        return metadataEntry;
      }
    });

    window.finalSaveData = userUploadedMetadata;
  } else {
    // Return the finalSaveData
    window.finalSaveData = finalSaveData;
  }
}

function obtainHyperparametersAndDrawVirtualGrid() {
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

  createVirtualGrid(
    window.sortedCoresData,
    horizontalSpacing,
    verticalSpacing,
    startingX,
    startingY,
    true
  );
  document.getElementById("virtualGridTabButton").disabled = false;

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
  const imageSrc = document.getElementById("imageUrlInput").value
    ? document.getElementById("imageUrlInput").value
    : document.getElementById("fileInput").files.length > 0
    ? document.getElementById("fileInput").files[0]
    : window.boxFileInfo
    ? URL.createObjectURL(window.boxFile)
    : "path/to/default/image.jpg";

  if (window.uploadedImageFileType === "svs") {
    if (firstRun) {
      // Hide the virtual grid canvas
      const virtualGridCanvas = document.getElementById("virtualGridCanvas");
      virtualGridCanvas.style.display = "none";

      // Update the grid spacing and starting position
      updateGridSpacingInVirtualGridForSVS(
        horizontalSpacing,
        verticalSpacing,
        startingX,
        startingY
      );

      await drawVirtualGridFromWSI(imageSrc, sortedCoresData, 64);
    } else {
      updateGridSpacingInVirtualGridForSVS(
        horizontalSpacing,
        verticalSpacing,
        startingX,
        startingY
      );
    }
  } else {
    // Hide the virtual grid container
    const virtualGridDiv = document.getElementById("VirtualGridSVSContainer");
    virtualGridDiv.style.display = "none";

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

  // Use the getRegionFromWSI function to download the full resolution version of the image
  const fullResTileParams = {
    tileX: core.x - core.currentRadius,
    tileY: core.y - core.currentRadius,
    tileWidth: coreWidth,
    tileHeight: coreHeight,
    tileSize: coreWidth,
  };

  const fullSizeImageResp = await getRegionFromWSI(
    svsImageURL,
    fullResTileParams
  );
  const blob = await fullSizeImageResp.blob();

  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  debugger;
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
  const metadataObj = window.finalSaveData.find((metadata) => {
    return metadata[rowKeyName] == rowValue && metadata[colKeyName] == colValue;
  });

  if (metadataObj) {
    // Get the form element
    const form = document.getElementById("editMetadataForm");

    // Clear existing form contents
    form.innerHTML = "";
    form.className = "space-y-4";

    // Dynamically create form elements for each metadata property
    for (const key in metadataObj) {
      const value = metadataObj[key];
    
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
    
        // Create the label element for the checkbox
        const label = document.createElement("label");
        label.setAttribute("for", key);
        label.className = "custom-checkbox-label";
        label.textContent = `${key}: `;
    
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
    
        // Create the text or number input
        const input = document.createElement("input");
        input.type = inputType;
        input.name = key;
        input.id = key;
        input.value = value;
        input.className = "bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5";
    
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
      "mt-4 px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50";
    form.appendChild(submitButton);

    // Handle form submission
    form.onsubmit = function (event) {
      event.preventDefault(); // Prevent traditional form submission

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

      // Log the updated object for verification
      console.log("Metadata updated successfully:", metadataObj);
      // Implement any follow-up action here
    };

    adjustSidebarHeight();
  } else {
    console.error("No matching metadata found for the given row and column.");
  }
}

async function createImageForCore(svsImageURL, core, coreSize = 64) {
  const coreWidth = core.currentRadius * 2;
  const coreHeight = core.currentRadius * 2;

  const tileParams = {
    tileX: core.x - core.currentRadius,
    tileY: core.y - core.currentRadius,
    tileWidth: coreWidth,
    tileHeight: coreHeight,
    tileSize: coreSize,
  };

  const imageResp = await getRegionFromWSI(svsImageURL, tileParams, 1);
  const blob = await imageResp.blob();
  const img = new Image(coreSize, coreSize);

  // Set the width and height of the image to fill the container
  img.style.width = "100%";
  img.style.height = "100%";

  // Create container div to hold the image and overlay
  const container = document.createElement("div");
  container.classList.add("image-container");

  // Create overlay div for displaying row and column
  const overlay = document.createElement("div");
  overlay.classList.add("image-overlay");
  overlay.innerHTML = `(${core.row + 1}, ${core.col + 1})`;

  // Double-click event for initiating download
  container.ondblclick = () => {
    const fileName = `core_${core.row + 1}_${core.col + 1}.png`; // Construct file name

    initiateDownload(svsImageURL, core, coreWidth, coreHeight, fileName);
  };

  container.onclick = () => {
    // Select the core
    populateAndEditMetadataForm(core.row + 1, core.col + 1);

    // Remove the active class from all cores
    coreContainers.forEach((container) => {
      container.classList.remove("active");
    });

    // Add the active class to the selected core
    container.classList.add("active");

  };

  // Append children to the container
  container.appendChild(img);
  container.appendChild(overlay);

  // Add the container to the array of core containers
  coreContainers.push(container);

  return new Promise((resolve, reject) => {
    // Adjust the img.onload function as necessary to handle the blob URL...
    img.onload = function () {
      resolve(container); // Resolve with the container
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob); // Create a blob URL from the blob
  });
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
  virtualGridDiv.style.gridTemplateColumns = `repeat(auto-fill, 1fr)`;

  // Adjusting the gap property: first value for vertical spacing between rows, second value for horizontal spacing between columns
  virtualGridDiv.style.gap = `${verticalSpacing}px ${horizontalSpacing}px`;

  virtualGridDiv.style.padding = `${startingY}px ${startingX}px`;
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
  virtualGridDiv.innerHTML = ""; // Clear existing content

  // Calculate grid dimensions
  const maxRow = Math.max(...sortedCoresData.map((core) => core.row)) + 1;
  const maxCol = Math.max(...sortedCoresData.map((core) => core.col)) + 1;

  // Create and append column headers
  for (let col = 0; col < maxCol; col++) {
    const columnHeader = document.createElement("div");
    columnHeader.textContent = `${col + 1}`;
    columnHeader.style.gridRow = 1; // Place in the first row
    columnHeader.style.gridColumn = col + 2; // Offset by 1 for headers
    columnHeader.classList.add("grid-header");
    virtualGridDiv.appendChild(columnHeader);
  }

  // Create and append row headers
  for (let row = 0; row < maxRow; row++) {
    const rowHeader = document.createElement("div");
    rowHeader.textContent = `${row + 1}`;
    rowHeader.style.gridColumn = 1; // Place in the first column
    rowHeader.style.gridRow = row + 2; // Offset by 1 for headers
    rowHeader.classList.add("grid-header");
    virtualGridDiv.appendChild(rowHeader);
  }

  // Adjust the container to include headers in its grid template
  virtualGridDiv.style.gridTemplateColumns = `auto repeat(${maxCol}, 1fr)`;
  virtualGridDiv.style.gridTemplateRows = `auto repeat(${maxRow}, 1fr)`;

  const concurrencyLimit = 1;
  let activePromises = [];
  for (const core of sortedCoresData) {
    const promise = createImageForCore(svsImageURL, core, coreSize).then(
      (img) => {
        // Position the image in the grid based on the core's row and col properties
        img.style.gridColumn = core.col + 2; // CSS grid lines are 1-based
        img.style.gridRow = core.row + 2;
        return img;
      }
    );
    activePromises.push(promise);

    if (activePromises.length >= concurrencyLimit) {
      await Promise.all(activePromises).then((images) => {
        images.forEach((img) => virtualGridDiv.appendChild(img));
      });
      activePromises = [];
    }
  }
  await Promise.all(activePromises).then((images) => {
    images.forEach((img) => virtualGridDiv.appendChild(img));
  });
}

function drawVirtualGridFromPNG(
  sortedCoresData,
  horizontalSpacing,
  verticalSpacing,
  startingX,
  startingY
) {
  // Use the loaded image if available, otherwise use default or file input image
  const imageSrc = window.loadedImg
    ? window.loadedImg.src
    : document.getElementById("fileInput").files.length > 0
    ? URL.createObjectURL(document.getElementById("fileInput").files[0])
    : "path/to/default/image.jpg";

  const virtualGridCanvas = document.getElementById("virtualGridCanvas");
  if (!virtualGridCanvas) {
    console.error("Virtual grid canvas not found");
    return;
  }

  const rows =
    sortedCoresData.reduce((acc, core) => Math.max(acc, core.row), 0) + 1;
  const cols =
    sortedCoresData.reduce((acc, core) => Math.max(acc, core.col), 0) + 1;
  const defaultRadius = parseInt(document.getElementById("userRadius").value);
  virtualGridCanvas.width =
    cols * horizontalSpacing + defaultRadius * 2 + startingX;
  virtualGridCanvas.height =
    rows * verticalSpacing + defaultRadius * 2 + startingY;

  const vctx = virtualGridCanvas.getContext("2d");
  const img = new Image();
  img.src = imageSrc;

  img.onload = () => {
    vctx.clearRect(0, 0, virtualGridCanvas.width, virtualGridCanvas.height);

    sortedCoresData
      .filter((core) => !core.isMarker)
      .forEach((core) => {
        const idealX = startingX + core.col * horizontalSpacing;
        const idealY = startingY + core.row * verticalSpacing;
        const userRadius = core.currentRadius * window.scalingFactor;

        vctx.save();
        vctx.beginPath();
        vctx.arc(idealX, idealY, userRadius, 0, Math.PI * 2, true);
        vctx.closePath();

        // Use the isImaginary flag to determine the stroke style
        vctx.strokeStyle = core.isImaginary ? "red" : "green";
        vctx.lineWidth = 2; // Adjust line width as needed
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

        vctx.fillStyle = "black"; // Text color
        vctx.font = "12px Arial"; // Text font and size
        vctx.fillText(
          `(${core.row + 1},${core.col + 1})`,
          idealX - userRadius / 2,
          idealY - userRadius / 2
        );
      });
  };

  img.onerror = () => {
    console.error("Image failed to load.");
  };
}

function updateVirtualGridSpacing(
  horizontalSpacing,
  verticalSpacing,
  startingX,
  startingY
) {
  const virtualGridCanvas = document.getElementById("virtualGridCanvas");
  const vctx = virtualGridCanvas.getContext("2d");

  // Clear the existing grid
  vctx.clearRect(0, 0, virtualGridCanvas.width, virtualGridCanvas.height);

  // Redraw the grid with new spacings
  createVirtualGrid(
    window.sortedCoresData,
    horizontalSpacing * 1.25,
    verticalSpacing * 1.25,
    startingX,
    startingY
  );
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
};
