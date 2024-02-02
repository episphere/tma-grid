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
  const x = point[0];
  const y = point[1];
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const newX = x * cos - y * sin;
  const newY = x * sin + y * cos;
  return [newX, newY];
}


async function preprocessForTravelingAlgorithm() {
  await loadDataAndDetermineParams(
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
    let offsetX = rotatedFirstPoint[0] - medianX;

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
function transpose(matrix) {
  // Check if the matrix is empty
  if (matrix.length === 0 || matrix[0].length === 0) {
    return [];
  }

  // Initialize the transposed array with empty arrays for each column based on the longest row
  const maxLength = Math.max(...matrix.map((row) => row.length));
  let transposed = Array.from({ length: maxLength }, () => []);

  // Loop through each row and column to populate the transposed matrix, excluding undefined values
  matrix.forEach((row, rowIndex) => {
    row.forEach((item, colIndex) => {
      // Only add the item to the transposed array if it exists
      if (item !== undefined) {
        transposed[colIndex].push(item);
      }
    });
  });

  return transposed;
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
  
  // // Transpose rows to columns
  // let columns = transpose(sortedRows);

  // // Filter out columns where every cell is imaginary
  // columns = columns.filter((column) => column.some((v) => !v.isImaginary));

  // // Transpose back to rows
  // sortedRows = transpose(columns);

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

  updateSpacingInVirtualGrid(params.gridWidth);

  return sortedData;
}

// Function to update the horizontal and vertical spacing based on the calculated distance between cores

function updateSpacingInVirtualGrid(distance) {
  document.getElementById("horizontalSpacing").value = distance.toFixed(2);

  document.getElementById("horizontalSpacingValue").textContent =
    distance.toFixed(2);

  document.getElementById("verticalSpacing").value = distance.toFixed(2);

  document.getElementById("verticalSpacingValue").textContent =
    distance.toFixed(2);
}

// Updated function to accept hyperparameters and cores data
async function loadDataAndDetermineParams(normalizedCores, params) {
  const delaunayTriangleEdges = getEdgesFromTriangulation(normalizedCores);
  const lengthFilteredEdges = filterEdgesByLength(
    delaunayTriangleEdges,
    normalizedCores,
    params.thresholdMultiplier
  );

  const bestEdgeSet = filterEdgesByAngle(lengthFilteredEdges, normalizedCores, params.thresholdAngle, params.originAngle);

  let coordinatesInput = bestEdgeSet.map(([start, end]) => {
    return [
      [normalizedCores[start].x, normalizedCores[start].y],
      [normalizedCores[end].x, normalizedCores[end].y],
    ];
  });

  // Calculate the average distance and the image width
  const d = calculateAverageDistance(coordinatesInput);
  const imageWidth = calculateGridWidth(normalizedCores, d, params.multiplier);

  console.log(d);
  // Update the form values with the new calculations
  document.getElementById("gridWidth").value = d.toFixed(2);
  document.getElementById("imageWidth").value = imageWidth.toFixed(2);
  document.getElementById("gamma").value = d.toFixed(2);

  // Update the params object with the new calculations
  params.gridWidth = d;
  params.imageWidth = imageWidth;
  params.gamma = d;
}

function saveUpdatedCores() {
  if (!window.sortedCoresData) {
    alert("No data available to save.");
    return;
  }

  // Create finalSaveData by mapping over sortedCoresData
  const finalSaveData = window.sortedCoresData.map((core) => {
    return {
      ...core,
      x: core.x / window.scalingFactor,
      y: core.y / window.scalingFactor,
      currentRadius: core.currentRadius / window.scalingFactor,
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
          entry[metadataRowName] == core.row + 1 &&
          entry[metadataColName] == core.col + 1
        );
      });

      if (metadataEntry) {
        // Merge the core data into the metadata entry
        for (let key in core) {
          // You might want to exclude some properties that should not be merged
          // if (key !== 'propertyToExclude') {
          metadataEntry[key] = core[key];
          // }
        }
      }
    });

    // Now userUploadedMetadata has been updated with the sortedCoresData
    // You can process or save this updated metadata as needed

    // For example, you might want to save it to a JSON file
    const updatedMetadataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(window.userUploadedMetadata));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", updatedMetadataStr);
    downloadAnchorNode.setAttribute("download", "updated_metadata.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  } else {
    // Download the sorted cores data as a JSON file if no metadata was uploaded
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(finalSaveData));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "sorted_cores.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }
}

export {
  rotatePoint,
  runTravelingAlgorithm,
  loadDataAndDetermineParams,
  saveUpdatedCores,
  preprocessForTravelingAlgorithm,
};
