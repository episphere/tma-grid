import {
  getEdgesFromTriangulation,
  filterEdgesByAngle,
  filterEdgesByLength,
  limitConnections,
  determineImageRotation,
  calculateGridWidth,
  calculateAverageDistance,
  sortEdgesAndAddIsolatedPoints,
  traveling_algorithm,
} from "./delaunay_triangulation.js";

import { applyAndVisualizeTravelingAlgorithm } from "./drawCanvas.js";

import { getHyperparametersFromUI } from "./UI.js";

function rotatePoint(point, angle) {
  const pivotX = window.loadedImg.width / 2;
  const pivotY = window.loadedImg.height / 2;

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

async function preprocessForTravelingAlgorithm() {
  const newParams = await loadDataAndDetermineParams(
    window.preprocessedCores,
    getHyperparametersFromUI()
  );
  applyAndVisualizeTravelingAlgorithm(null, true);
}

// Function to calculate the median x coordinate of the first column
function calculateMedianX(sortedRows, originAngle) {
  // Extract the x coordinate of the first column from each row
  let firstColumnXValues = sortedRows.map(
    (row) => rotatePoint(row[0].point, -originAngle)[0]
  );

  firstColumnXValues.sort((a, b) => a - b);
  let middleIndex = Math.floor(firstColumnXValues.length / 2);
  // Calculate median
  if (firstColumnXValues.length % 2) {
    return firstColumnXValues[middleIndex];
  } else {
    return (
      (firstColumnXValues[middleIndex - 1] + firstColumnXValues[middleIndex]) /
      2.0
    );
  }
}

// Function to normalize rows by adding imaginary points
function normalizeRowsByAddingImaginaryPoints(
  sortedRows,
  medianX,
  gridWidth,
  originAngle,
  thresholdForImaginaryPoints = 0.6
) {
  return sortedRows.map((row, index) => {
    // Rotate first point to align with the x-axis
    let rotatedFirstPoint = rotatePoint(row[0].point, -originAngle);

    // Calculate the offset from the median
    let offsetX = rotatedFirstPoint[0] - medianX - 5;

    if (offsetX < 0) {
      offsetX = 0;
    }
    // Determine the number of imaginary points to add
    let imaginaryPointsCount = Math.max(
      0,
      Math.floor(offsetX / gridWidth + thresholdForImaginaryPoints)
    );

    // Generate imaginary points
    let imaginaryPoints = [];
    for (let i = imaginaryPointsCount - 1; i >= 0; i--) {
      imaginaryPoints.push({
        point: rotatePoint(
          [rotatedFirstPoint[0] - (i + 1) * gridWidth, rotatedFirstPoint[1]],
          originAngle
        ),
        row: index,
        col: imaginaryPointsCount - 1 - i,
        isImaginary: true,
        annotations: "",
      });
    }

    // Rotate back and combine with existing points
    let normalizedRow = imaginaryPoints.concat(
      row.map((core) => {
        return {
          ...core,
          point: core.point,
        };
      })
    );

    // Update col index for all points
    normalizedRow.forEach((core, index) => (core.col = index));

    return normalizedRow;
  });
}

// Helper function to transpose rows and columns without adding undefined values
// Function to transpose a jagged array
function transposeJaggedArray(jaggedArray) {
  let result = [];
  jaggedArray.forEach((row) => {
    row.forEach((item, columnIndex) => {
      if (!result[columnIndex]) {
        result[columnIndex] = []; // Create a new row if it doesn't exist
      }
      result[columnIndex].push(item);
    });
  });
  return result;
}

// Function to invert the transposition of a jagged array
// originalStructure is an array of the lengths of each sub-array in the original jagged array
function invertTranspose(transposedArray, originalStructure) {
  let result = [];
  let itemIndex = 0;
  for (let length of originalStructure) {
    let newRow = [];
    for (let i = 0; i < length; i++) {
      newRow.push(transposedArray[i][itemIndex]);
    }
    result.push(newRow);
    itemIndex++;
  }
  return result;
}

function sortRowsByRotatedPoints(rows, originAngle) {
  // Temporarily rotate the first point of each row for sorting purposes
  let sortingHelper = rows.map((row) => {
    return {
      originalRow: row,
      rotatedPoint: rotatePoint(row[0]["point"], -originAngle),
    };
  });

  // Sort the rows based on the y-coordinate of the rotated first point in each row
  sortingHelper.sort((a, b) => a.rotatedPoint[1] - b.rotatedPoint[1]);

  // Extract the original rows in sorted order
  return sortingHelper.map((item) => item.originalRow);
}

async function runTravelingAlgorithm(normalizedCores, params) {
  const delaunayTriangleEdges = getEdgesFromTriangulation(normalizedCores);
  const lengthFilteredEdges = filterEdgesByLength(
    delaunayTriangleEdges,
    normalizedCores,
    params.thresholdMultiplier
  );

  let bestEdgeSet = filterEdgesByAngle(
    lengthFilteredEdges,
    normalizedCores,
    params.thresholdAngle,
    params.originAngle
  );

  bestEdgeSet = limitConnections(bestEdgeSet, normalizedCores);
  bestEdgeSet = sortEdgesAndAddIsolatedPoints(bestEdgeSet, normalizedCores);

  let coordinatesInput = bestEdgeSet.map(([start, end]) => {
    return [
      [normalizedCores[start].x, normalizedCores[start].y],
      [normalizedCores[end].x, normalizedCores[end].y],
    ];
  });

  let rows = traveling_algorithm(
    coordinatesInput,
    params.imageWidth,
    params.gridWidth,
    params.gamma,
    params.searchAngle,
    params.originAngle,
    params.radiusMultiplier
  );

  // Extract the original rows in sorted order
  let sortedRows = sortRowsByRotatedPoints(rows, params.originAngle);
  // Calculate the median x coordinate for the first column
  let medianX = calculateMedianX(sortedRows, params.originAngle);
  // Normalize rows by adding imaginary points
  sortedRows = normalizeRowsByAddingImaginaryPoints(
    sortedRows,
    medianX,
    params.gridWidth,
    params.originAngle
  );

  const userRadius = document.getElementById("userRadius").value;

  let sortedData = [];
  sortedRows.forEach((row, rowIndex) => {
    row.forEach((core, colIndex) => {
      // Add the core or imaginary point to sortedData
      sortedData.push({
        x: core.point[0] + window.preprocessingData.minX,
        y: core.point[1] + window.preprocessingData.minY,
        row: rowIndex,
        col: colIndex,
        currentRadius: parseInt(userRadius),
        isImaginary: core.isImaginary,
        annotations: "",
      });
    });
  });

  return sortedData;
}

// Function to update the horizontal and vertical spacing based on the calculated distance between cores

function updateSpacingInVirtualGrid(distance) {
  if (window.uploadedImageFileType === "svs") {
    document.getElementById("horizontalSpacing").value = 0;
    document.getElementById("verticalSpacing").value = 0;

    document.getElementById("horizontalSpacingValue").textContent = 0;

    document.getElementById("verticalSpacingValue").textContent = 0;
  } else {
    document.getElementById("horizontalSpacing").value = distance.toFixed(2);
    document.getElementById("verticalSpacing").value = distance.toFixed(2);

    document.getElementById("horizontalSpacingValue").textContent =
      distance.toFixed(2);

    document.getElementById("verticalSpacingValue").textContent =
      distance.toFixed(2);

      document.getElementById("startingX").value = distance.toFixed(2);
      document.getElementById("startingY").value = distance.toFixed(2);

  }
}

// Updated function to accept hyperparameters and cores data
async function loadDataAndDetermineParams(normalizedCores, params) {
  const delaunayTriangleEdges = getEdgesFromTriangulation(normalizedCores);
  const lengthFilteredEdges = filterEdgesByLength(
    delaunayTriangleEdges,
    normalizedCores,
    params.thresholdMultiplier
  );

  const bestEdgeSet = filterEdgesByAngle(
    lengthFilteredEdges,
    normalizedCores,
    params.thresholdAngle,
    params.originAngle
  );

  let coordinatesInput = bestEdgeSet.map(([start, end]) => {
    return [
      [normalizedCores[start].x, normalizedCores[start].y],
      [normalizedCores[end].x, normalizedCores[end].y],
    ];
  });

  // Calculate the average distance and the image width
  const d = calculateAverageDistance(coordinatesInput);
  const imageWidth = calculateGridWidth(normalizedCores, d, params.multiplier);

  // Update the form values with the new calculations
  document.getElementById("gridWidth").value = d.toFixed(2);
  document.getElementById("imageWidth").value = imageWidth.toFixed(2);
  document.getElementById("gamma").value = (0.25 * d).toFixed(2);

  // Update the params object with the new calculations
  params.gridWidth = d;
  params.imageWidth = imageWidth;
  params.gamma = 0.25 * d;

  // Update radius
  document.getElementById("userRadius").value =
    window.preprocessedCores[0].radius;
  document.getElementById("radiusValue").value = Math.round(
    window.preprocessedCores[0].radius
  );

  return params;
}

function saveUpdatedCores(format) {
  if (!window.sortedCoresData) {
    alert("No data available to save.");
    return;
  }

  
  // Save data as JSON or CSV
  if (format === "json") {
    const dataStr = JSON.stringify(window.finalSaveData);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    let downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataUri);
    downloadAnchorNode.setAttribute("download", "data.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  } else if (format === "csv") {
    let csvStr = convertToCSV(window.finalSaveData);
    let blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    let url = URL.createObjectURL(blob);

    let downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "data.csv";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
}

// Function to convert JSON to CSV
function convertToCSV(objArray) {
  const array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
  let str = `${Object.keys(array[0]).map(value => `"${value}"`).join(",")}\r\n`;

  for (let i = 0; i < array.length; i++) {
    let line = '';
    for (let index in array[i]) {
      if (line != '') line += ','
      line += `"${array[i][index]}"`;
    }
    str += line + '\r\n';
  }
  return str;
}

export {
  rotatePoint,
  runTravelingAlgorithm,
  loadDataAndDetermineParams,
  saveUpdatedCores,
  preprocessForTravelingAlgorithm,
  updateSpacingInVirtualGrid,
};
