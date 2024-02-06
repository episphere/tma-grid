import { getHyperparametersFromUI } from "./UI.js";
import {
  rotatePoint,
  runTravelingAlgorithm,
  updateSpacingInVirtualGrid,
} from "./data_processing.js";

import { preprocessCores } from "./delaunay_triangulation.js";

import { positionSidebarNextToCore, hideSidebar, showPopup } from "./UI.js";

import * as tf from "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/+esm";

// const OSD_WIDTH_SCALEDOWN_FACTOR_FOR_EDIT_SIDEBAR = 0.8; // Adjust for the 20% width of the add core sidebar.

let lastActionTime = 0;
const actionDebounceInterval = 500; // milliseconds

// Pure function to get input values
const getInputValue = (inputId) => document.getElementById(inputId).value;

// Global variables to hold the history for undo and redo
window.actionHistory = [];
let currentActionIndex = -1;

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

  document
    .getElementById("undoButton")
    .addEventListener("mousedown", function () {
      // Undo action here

      const currentTime = Date.now();
      if (currentTime - lastActionTime > actionDebounceInterval) {
        undo();
      }
      lastActionTime = currentTime;
    });

  document
    .getElementById("redoButton")
    .addEventListener("mousedown", function () {
      // Redo action here
      const currentTime = Date.now();
      if (currentTime - lastActionTime > actionDebounceInterval) {
        redo();
      }
      lastActionTime = currentTime;
    });
}

function drawCoresOnCanvasForTravelingAlgorithm() {


  let currentMode = "edit"; // Possible values: 'edit', 'add'


  drawCores();

  function connectAdjacentCores(core, updateSurroundings = false) {
    // Helper function to calculate the edge point
    // function calculateEdgePoint(center1, center2, r1, r2) {
    //   const angle = Math.atan2(center2.y - center1.y, center2.x - center1.x);
    //   return {
    //     start: {
    //       x: center1.x + Math.cos(angle) * r1,
    //       y: center1.y + Math.sin(angle) * r1,
    //     },
    //     end: {
    //       x: center2.x - Math.cos(angle) * r2,
    //       y: center2.y - Math.sin(angle) * r2,
    //     },
    //   };
    // }

    if (!document.getElementById("connectCoresCheckbox").checked) {
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
            startCore.x +
              (endCore.col - startCore.col) * startCore.currentRadius,
            startCore.y +
              (endCore.row - startCore.row) * startCore.currentRadius
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
    if (core.isMisaligned){
      overlayElement.classList.add("misaligned");
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

    // Define a flag outside of the click handler to track the event listener's state
    let isDeleteHandlerActive = false;
    let activeDeleteHandler = null; // Store the active handler function to remove it later


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
        if (e.quick) {
          const overlay = window.viewer.getOverlayById(overlayElement);
          const deleteBtnHandler = (e) => {
            if (e.key === "Delete" || e.key === "Backspace") {
              // check if the core is selected
              if (overlayElement.classList.contains("selected")) {
                removeCoreFromGrid(core); // Assuming removeCoreFromGrid is defined elsewhere
              }
            }
          };
          // Deselect all overlays first
          window.viewer.currentOverlays.forEach((overlay) => {
            overlay.element.classList.remove("selected");
          });
          // Then check if the clicked overlay wasn't already selected
          if (!overlayElement.classList.contains("selected")) {
            overlayElement.classList.add("selected");
            document.addEventListener("keydown", deleteBtnHandler, { once: true });
          } else {
            // If it was already selected, remove the listener (since it's deselected now)
            document.removeEventListener("keydown", deleteBtnHandler);
            // selectedIndex = null; // Uncomment if you use selectedIndex
          }
        }
      },
      
      dblClickHandler: (e) => {
        const overlay = window.viewer.getOverlayById(overlayElement);
        // selectedIndex = window.viewer.currentOverlays.indexOf(overlay)
        overlayElement.classList.add("selected");
        updateSidebar(core);
        positionSidebarNextToCore(e.originalEvent);
        // drawCores()
      },

      dragHandler: (e) => {
        let overlayWidth = null;
        const overlay = window.viewer.getOverlayById(overlayElement);
        const delta = window.viewer.viewport.deltaPointsFromPixels(e.delta);

        if (!e.shift) {
          overlay.element.style.cursor = "grabbing";
          overlay.update(overlay.location.plus(delta));
        } else {
          overlay.element.style.cursor = "nwse-resize";
          let { width, height } = overlay.bounds;
          const factorToResizeBy = Math.max(delta.x, delta.y);
          width += factorToResizeBy;
          height += factorToResizeBy;
          overlay.update(
            new OpenSeadragon.Rect(
              overlay.bounds.x,
              overlay.bounds.y,
              width,
              height
            )
          );
          overlayWidth = width;
        }

        overlay.drawHTML(overlay.element.parentElement, window.viewer.viewport);

        const deltaPosInImageCoords =
          window.viewer.viewport.viewportToImageCoordinates(delta);
        if (index !== -1) {
          window.sortedCoresData[index].x += deltaPosInImageCoords.x;
          window.sortedCoresData[index].y += deltaPosInImageCoords.y;

          // Set the radius if overlayWidth is not null
          if (overlayWidth !== null) {
            window.sortedCoresData[index].currentRadius = overlayWidth / 2;
          }

          document.getElementById("editXInput").value =
            window.sortedCoresData[index].x;
          document.getElementById("editYInput").value =
            window.sortedCoresData[index].y;

          document.getElementById("editRadiusInput").value =
            window.sortedCoresData[index].currentRadius;

          connectAdjacentCores(window.sortedCoresData[index], true);
        }
      },

      dragEndHandler: (e) => {
        const overlay = window.viewer.getOverlayById(overlayElement);
        overlay.element.style.cursor = "auto";
        if (index !== -1) {
          connectAdjacentCores(window.sortedCoresData[index], true);
        }
      },
    });

    return overlayElement;
    // ctx.lineWidth = 2;
    // ctx.setLineDash([]); // Reset line dash for all cores

    // // Core circle
    // ctx.beginPath();
    // ctx.arc(core.x, core.y, core.currentRadius, 0, Math.PI * 2);

    // Style settings for a selected core
    // if (isSelected) {
    //   ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    //   ctx.shadowBlur = 30; // More pronounced shadow for a glow effect
    //   ctx.shadowOffsetX = 0;
    //   ctx.shadowOffsetY = 0;
    //   ctx.strokeStyle = "#FFD700"; // Gold color for selection
    //   ctx.lineWidth = 5; // Thicker line for selected core
    // } else if (core.isTemporary) {
    //   ctx.strokeStyle = "#808080";
    //   ctx.setLineDash([5, 5]); // Dashed line for temporary core
    // } else {
    //   ctx.strokeStyle = core.isImaginary ? ; // Default color logic
    // }

    // Core labels
    // ctx.fillStyle = isSelected ? "#333" : "#333"; // Use the same gold color for selected core labels
    // ctx.font = isSelected ? "bold 14px Arial" : "12px Arial";
    // const textMetrics = ctx.measureText(`(${core.row + 1},${core.col + 1})`);
    // ctx.fillText(
    //   `(${core.row + 1},${core.col + 1})`,
    //   core.x - textMetrics.width / 2,
    //   core.y - core.currentRadius - 10
    // );
  }

  // Modified updateSidebar function to handle add mode
  function updateSidebar(core) {
    const sidebarPrefix = currentMode === "edit" ? "edit" : "add";

    document.getElementById(sidebarPrefix + "RowInput").value = core
      ? core.row + 1
      : "";
    document.getElementById(sidebarPrefix + "ColumnInput").value = core
      ? core.col + 1
      : "";
    document.getElementById(sidebarPrefix + "XInput").value = core
      ? core.x
      : "";
    document.getElementById(sidebarPrefix + "YInput").value = core
      ? core.y
      : "";
    document.getElementById(sidebarPrefix + "RadiusInput").value = core
      ? core.currentRadius
      : "";
    document.getElementById(sidebarPrefix + "AnnotationsInput").value =
      core?.annotations ? core.annotations : "";
    document.getElementById(sidebarPrefix + "RealInput").checked =
      !core?.isImaginary;
    document.getElementById(sidebarPrefix + "ImaginaryInput").checked =
      core?.isImaginary;

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
    if (!oldRow && !document.getElementById(currentMode + "RowInput").value && !document.getElementById("editAutoUpdateRowsCheckbox").checked) {
      alert("Please enter a value for the row");
      return false;
    }

    core.row =
      parseInt(document.getElementById(currentMode + "RowInput").value, 10) - 1;
    core.col =
      parseInt(document.getElementById(currentMode + "ColumnInput").value, 10) -
      1;
    core.x = parseFloat(document.getElementById(currentMode + "XInput").value);
    core.y = parseFloat(document.getElementById(currentMode + "YInput").value);
    core.currentRadius = parseFloat(
      document.getElementById(currentMode + "RadiusInput").value
    );
    core.annotations = document.getElementById(
      currentMode + "AnnotationsInput"
    ).value;


    // Update the isImaginary property based on which radio button is checked
    core.isImaginary = document.getElementById(
      currentMode + "ImaginaryInput"
    ).checked;

    const coreIndex = window.sortedCoresData.findIndex(
      (prevCore) => prevCore.x === core.x && prevCore.y === core.y
    );

    window.sortedCoresData[coreIndex] = core;


    if (document.getElementById(currentMode + "AutoUpdateRowsCheckbox").checked) {
      core.row = determineCoreRow(core, window.sortedCoresData);
    }


    if (document.getElementById("editAutoUpdateColumnsCheckbox").checked) {
      updateColumnsInRowAfterModification(core.row);

      if (oldRow !== core.row) {
        updateColumnsInRowAfterModification(oldRow);
      }
      updateSidebar(core);
    }


    core.isTemporary = false;
    core.isSelected = false;


    const imageRotation = parseFloat(
      document.getElementById("originAngle").value
    );

    // Reflag for misaligned cores
    window.sortedCoresData = flagMisalignedCores(window.sortedCoresData, imageRotation);

    drawCores(); // Redraw the cores with the updated data


    return true;
  }

  // Picks the row with the closest rotated median Y value to the rotated median Y value of the core
  function determineCoreRow(core, sortedCoresData){


    let imageRotation = parseFloat(
      document.getElementById("originAngle").value
    );

    if (imageRotation < 10) {

      imageRotation = 0;

    }

    // Determine rotated median Y value of each row
    const medianRows = Object.values(determineMedianRowColumnValues(sortedCoresData, imageRotation).rows);

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

  function removeCoreFromGrid(core) {
    const coreIndex = window.sortedCoresData.findIndex(
      (coreToRemove) =>
        coreToRemove.x === core.x &&
        coreToRemove.y === core.y &&
        coreToRemove.row === core.row &&
        coreToRemove.col === core.col
    );
    const modifiedRow = window.sortedCoresData[coreIndex].row;

    // Remove the selected core
    window.sortedCoresData.splice(coreIndex, 1);

    // Check if the removed core was the last real core in the row
    const isLastRealCore =
      window.sortedCoresData.filter(
        (core) => core.row === modifiedRow && !core.isImaginary
      ).length === 0;

    if (isLastRealCore) {
      // Remove all cores in the row
      window.sortedCoresData = window.sortedCoresData.filter(
        (core) => core.row !== modifiedRow
      );
      resData.forEach((core) => {
        if (core.row > modifiedRow) {
          core.row -= 1;
        }
      });
    }

    updateSidebar(null); // Update the sidebar to reflect no selection

    if (!isLastRealCore) {
      // Update columns only if the row was not removed
      updateColumnsInRowAfterModification(modifiedRow);
    }

    flagMisalignedCores(window.sortedCoresData, parseFloat(document.getElementById("originAngle").value));

    drawCores(); // Redraw the cores
  }

  // document
  //   .getElementById("saveCoreEdits")
  //   .addEventListener("click", function () {
  //     console.log("CLICK EVENT LISTENER")
  //     saveCore(window.sortedCoresData[selectedIndex])
  //   });

  // Function to rotate a point around the origin
  function rotatePoint(point, angle) {
    const pivotX = window.loadedImg.width / 2 / window.scalingFactor;
    const pivotY = window.loadedImg.height / 2 / window.scalingFactor;

    // Translate point to origin (pivot point becomes the new origin)
    const translatedX = point[0] - pivotX;
    const translatedY = point[1] - pivotY;

    // Convert angle to radians
    const radians = (angle * Math.PI) / 180;

    // Perform rotation around origin
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    // Translate point back
    const newX = rotatedX + pivotX;
    const newY = rotatedY + pivotY;

    return [newX, newY];
  }

  function updateColumnsInRowAfterModification(row) {
    const imageRotation = parseFloat(
      document.getElementById("originAngle").value
    );
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
  }

  const addCoreHandler = (e) => {
    const addCoreBtn = document.getElementById("osdViewerAddCoreBtn");
    if (addCoreBtn.classList.contains("active")) {
      addCoreBtn.classList.remove("active");
      window.viewer.canvas.style.cursor = "auto";
      window.viewer.removeAllHandlers("canvas-drag");
      window.viewer.removeAllHandlers("canvas-drag-end");
    } else {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          addCoreHandler();
        }
      });
      addCoreBtn.classList.add("active");
      window.viewer.canvas.style.cursor = "crosshair";

      const core = {
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

        if (core.x === -1) {
          core.x = positionInImage.x;
        }
        if (core.y === -1) {
          core.y = positionInImage.y;
        }

        core.currentRadius = Math.abs(
          Math.max(core.x - positionInImage.x, core.y - positionInImage.y)
        );

        if (overlayElement) {
          window.viewer.removeOverlay(overlayElement);
          window.sortedCoresData[window.sortedCoresData.length - 1] = core;
        } else {
          window.sortedCoresData.push(core);
        }
        overlayElement = drawCore(core, window.sortedCoresData.length - 1);
      };

      window.viewer.addHandler("canvas-drag", dragHandler);

      window.viewer.addOnceHandler("canvas-drag-end", (e) => {
        window.viewer.removeHandler("canvas-drag", dragHandler);
        window.viewer.canvas.style.cursor = "auto";
        addCoreBtn.classList.remove("active");
        core.isSelected = true;
        dragHandler(e);
        updateSidebar(core);
        positionSidebarNextToCore(e.originalEvent);

      });
    }
  };

  document
    .getElementById("osdViewerAddCoreBtn")
    .addEventListener("click", addCoreHandler);

  // document
  //   .getElementById("addCoreButton")
  //   .addEventListener("click", function () {
  //     if (currentMode === "add" && tempCore) {
  //       // Add the temporary core to sortedCoresData
  //       tempCore.row =
  //         parseInt(document.getElementById("addRowInput").value, 10) - 1;
  //       tempCore.col =
  //         parseInt(document.getElementById("addColumnInput").value, 10) - 1;
  //       tempCore.x = parseFloat(document.getElementById("addXInput").value);
  //       tempCore.y = parseFloat(document.getElementById("addYInput").value);
  //       tempCore.currentRadius = parseFloat(
  //         document.getElementById("addRadiusInput").value
  //       );
  //       tempCore.annotations = document.getElementById(
  //         "addAnnotationsInput"
  //       ).value;
  //       tempCore.isImaginary =
  //         document.getElementById("addImaginaryInput").checked;
  //       tempCore.isTemporary = false; // Set the temporary flag to false

  //       window.sortedCoresData.push(tempCore);

  //       if (document.getElementById("addAutoUpdateColumnsCheckbox").checked) {
  //         updateColumnsInRowAfterModification(tempCore.row);
  //       }
  //       tempCore = null;
  //       drawCores(); // Redraw to update the canvas
  //     }
  //   });

  // // Event listener for the cancel core drawing button
  // document
  //   .getElementById("cancelCoreDrawing")
  //   .addEventListener("click", cancelCoreDrawing);

  var coreCanvasElement = window.viewer.canvas.firstElementChild;

  // Add event listeners for mode switching buttons (assumes buttons exist in your HTML)
  // Call clearTempCore when necessary, such as when switching modes
  // document
  //   .getElementById("switchToEditMode")
  //   .addEventListener("click", (event) => {
  //     event.target.classList.add("active");
  //     document.getElementById("switchToAddMode").classList.remove("active");
  //     switchMode("edit");
  //     isSettingSize = false;
  //     // clearTempCore();
  //     // Add 'edit-mode' class and remove 'add-mode' class
  //     coreCanvasElement.classList.add("edit-mode");
  //     coreCanvasElement.classList.remove("add-mode");
  //   });

  // document
  //   .getElementById("switchToAddMode")
  //   .addEventListener("click", (event) => {
  //     event.target.classList.add("active");
  //     document.getElementById("switchToEditMode").classList.remove("active");
  //     switchMode("add");
  //     isSettingSize = false;
  //     // clearTempCore();
  //     // Add 'add-mode' class and remove 'edit-mode' class
  //     coreCanvasElement.classList.add("add-mode");
  //     coreCanvasElement.classList.remove("edit-mode");
  //   });

  // Function to toggle the disabled state based on the checkbox
  function toggleColumnInput() {
    var editAutoUpdateColumnsCheckbox = document.getElementById(
      currentMode + "AutoUpdateColumnsCheckbox"
    );
    var columnInput = document.getElementById(currentMode + "ColumnInput");

    // If the checkbox is checked, disable the column input
    if (editAutoUpdateColumnsCheckbox.checked) {
      columnInput.disabled = true;
    } else {
      // Otherwise, enable it
      columnInput.disabled = false;
    }
  }
  document
    .getElementById("editAutoUpdateColumnsCheckbox")
    .addEventListener("change", toggleColumnInput);

  function toggleRowInput() {
    var editAutoUpdateRowsCheckbox = document.getElementById(
      currentMode + "AutoUpdateRowsCheckbox"
    );
    var rowInput = document.getElementById(currentMode + "RowInput");

    // If the checkbox is checked, disable the column input
    if (editAutoUpdateRowsCheckbox.checked) {
      rowInput.disabled = true;
    } else {
      // Otherwise, enable it
      rowInput.disabled = false;
    }
  }

  document
    .getElementById("editAutoUpdateRowsCheckbox")
    .addEventListener("change", toggleRowInput);
}
// Function to find the optimal angle that minimizes imaginary cores
async function findOptimalAngle(
  preprocessedCores,
  getHyperparameters,
  runAlgorithm,
  updateUI
) {
  let targetRange = { start: -10, end: 10 };
  let searchIncrement = 1; // Fine-grained for targeted search
  let anglesWithMinCores = []; // Store angles with the minimum imaginary cores

  // Function to run the algorithm and count imaginary cores
  const countImaginaryCores = async (angle) => {
    updateUI(angle);
    const hyperparameters = getHyperparameters(angle);
    const sortedCoresData = await runAlgorithm(
      preprocessedCores,
      hyperparameters
    );
    return [
      sortedCoresData.filter((core) => core.isImaginary).length,
      sortedCoresData.length,
    ];
  };

  // Perform the initial targeted search and collect imaginary cores count
  let minImaginaryCores = Infinity;
  let minImaginaryCorePercentage = Infinity;
  for (
    let angle = targetRange.start;
    angle <= targetRange.end;
    angle += searchIncrement
  ) {
    const [imaginaryCoresCount, totalCoresCount] = await countImaginaryCores(
      angle
    );
    if (imaginaryCoresCount < minImaginaryCores) {
      minImaginaryCores = imaginaryCoresCount;
      minImaginaryCorePercentage = imaginaryCoresCount / totalCoresCount;
      anglesWithMinCores = [angle]; // Reset the array as this is the new minimum
    } else if (imaginaryCoresCount === minImaginaryCores) {
      anglesWithMinCores.push(angle); // Add this angle to the list of optimal angles
    }
  }

  // Calculate the median of the angles with the minimum imaginary cores
  const medianAngle =
    anglesWithMinCores.length % 2 === 0
      ? (anglesWithMinCores[anglesWithMinCores.length / 2 - 1] +
          anglesWithMinCores[anglesWithMinCores.length / 2]) /
        2
      : anglesWithMinCores[Math.floor(anglesWithMinCores.length / 2)];

  // If zero is among the optimal angles, return it as the optimal angle
  if (anglesWithMinCores.includes(0)) {
    return 0;
  }

  // If the median angle is within the targeted range, return it as the optimal angle
  if (minImaginaryCorePercentage < 0.3) {
    return medianAngle;
  }

  // Otherwise, perform a broader search
  searchIncrement = 2; // Coarser increment for broad search
  for (let angle = -50; angle <= 50; angle += searchIncrement) {
    if (angle >= targetRange.start && angle <= targetRange.end) continue; // Skip the targeted range
    const [imaginaryCoresCount, totalCoresCount] = await countImaginaryCores(
      angle
    );
    if (imaginaryCoresCount < minImaginaryCores) {
      minImaginaryCores = imaginaryCoresCount;
      anglesWithMinCores = [angle]; // Reset the array as this is the new minimum
    } else if (imaginaryCoresCount === minImaginaryCores) {
      anglesWithMinCores.push(angle); // Add this angle to the list of optimal angles
    }
  }

  // Recalculate the median for the broader search
  return anglesWithMinCores.length % 2 === 0
    ? (anglesWithMinCores[anglesWithMinCores.length / 2 - 1] +
        anglesWithMinCores[anglesWithMinCores.length / 2]) /
        2
    : anglesWithMinCores[Math.floor(anglesWithMinCores.length / 2)];
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
      (rowImaginaryRatio >= 0.65 || colImaginaryRatio >= 0.75)
    );
  });

  return coresData;
}

function determineMedianRowColumnValues(coresData, imageRotation) {
  if (imageRotation < 10){
    imageRotation = 0;
  }

  // Initialize structures to hold separated X and Y values for rows and columns
  const rowValues = {};
  const columnValues = {};

  // Calculate rotated values and separate X and Y for each row and column
  coresData.forEach((core) => {
    if (!core.isTemporary) {
      const [rotatedX, rotatedY] = rotatePoint([core.x, core.y], -imageRotation);
      
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
    medianValues.columns[col] = {
      medianX: calculateMedian(columnValues[col].x),
      medianY: calculateMedian(columnValues[col].y)
    };
  });

  Object.keys(rowValues).forEach((row) => {
    medianValues.rows[row] = {
      medianX: calculateMedian(rowValues[row].x),
      medianY: calculateMedian(rowValues[row].y)
    };
  });

  return medianValues;
}

function flagMisalignedCores(coresData, imageRotation) {

  if (imageRotation < 10){
    imageRotation = 0;
  }

  const medianValues = determineMedianRowColumnValues(coresData, imageRotation);

  // Count the number of cores in each column
  const coreCounts = {};
  coresData.forEach((core) => {
    coreCounts[core.col] = (coreCounts[core.col] || 0) + 1;
  });
  
  // Since we're aligning columns, we focus on median X values in columns
  const medianRotatedXValues = {};
  Object.keys(medianValues.columns).forEach(col => {
    medianRotatedXValues[col] = medianValues.columns[col].medianX;
  });

  // Modify this part to take into account the number of cores in each column
  coresData.forEach((core) => {
    const rotatedX = rotatePoint([core.x, core.y], -imageRotation)[0];

   
    // If the core's rotated X value is 1.5 radii outside of the median rotatedX value or if the core's column has less than two cores, mark it as misaligned. 

    if (
      Math.abs(medianRotatedXValues[core.col] - rotatedX) > 1.25 * core.currentRadius ||
      coreCounts[core.col] < 2
    ) {
      core.isMisaligned = true;
    } else {
      core.isMisaligned = false;
    }


    // If there's another core with the same row and column, also mark it as misaligned
   
    if (coresData.some((otherCore) => otherCore !== core && otherCore.row === core.row && otherCore.col === core.col)) {
      core.isMisaligned = true;
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
      rowMap[originalRow] = rowIndex++;
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
    coreCounts[core.col] = (coreCounts[core.col] || 0) + 1;
  });
  
  // Since we're aligning columns, we focus on median X values in columns
  const medianRotatedXValues = {};
  Object.keys(medianValues.columns).forEach(col => {
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

    // if (core.row == 9 && core.col == 11) {

    //   console.log("nearestCol", nearestCol);
    //   debugger
    // }

    core.col = parseInt(nearestCol);
  });

  return coresData;
}

function filterAndReassignCores(coresData, imageRotation) {


  if (imageRotation < 10){

    imageRotation = 0;

  }

  let filteredCores = alignMisalignedCores(coresData, imageRotation);
  
  filteredCores = reassignCoreIndices(filteredCores);
  
  filteredCores = removeImaginaryCoresFilledRowsAndColumns(coresData);

  filteredCores = alignMisalignedCores(filteredCores, imageRotation);

  filteredCores = reassignCoreIndices(filteredCores);

  filteredCores = flagMisalignedCores(filteredCores, imageRotation);


  return filteredCores;
}

function obtainHyperparametersAndDrawVirtualGrid() {
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
    startingY
  );

  showPopup("popupGridding");
  document.getElementById("virtualGridTabButton").disabled = false;
}

function createVirtualGrid(
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

    sortedCoresData.forEach((core) => {
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
