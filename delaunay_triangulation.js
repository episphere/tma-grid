import * as d3 from "https://esm.sh/d3@7.8.5";

import * as math from "https://esm.sh/mathjs@12.2.0";

import { rotatePoint } from "./data_processing.js";


function preprocessCores(cores) {
  // If cores is an object, convert it to an array
  let coresArray = cores;
  if (typeof cores === "object" && !Array.isArray(cores)) {
    coresArray = Object.values(cores);
  }

  const minX = Math.min(...coresArray.map((core) => core.x));
  const minY = Math.min(...coresArray.map((core) => core.y));

  window.preprocessingData = {
    minX,
    minY,
  };

  // Normalize the coordinates
  return coresArray.map((core) => {
    // Perform the transformation without mutating the original core object
    return {
      ...core, // Spread operator to copy properties of the original core object
      x: core.x - minX,
      y: core.y - minY
    };
  });
}


function getEdgesFromTriangulation(cores) {
  const delaunay = d3.Delaunay.from(cores.map((core) => [core.x, core.y]));
  const triangles = delaunay.triangles;
  const edges = new Set();

  for (let i = 0; i < triangles.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const index1 = triangles[i + j];
      const index2 = triangles[i + ((j + 1) % 3)];
      const edge = [Math.min(index1, index2), Math.max(index1, index2)]; // Ensuring smaller index comes first
      edges.add(edge.join(","));
    }
  }

  return Array.from(edges).map((edge) => edge.split(",").map(Number));
}

function calculateEdgeLengths(edges, coordinates) {
  return edges.map(([start, end]) => {
    const dx = coordinates[end].x - coordinates[start].x;
    const dy = coordinates[end].y - coordinates[start].y;
    return Math.sqrt(dx * dx + dy * dy);
  });
}
function orderEdgesToPointRight(filteredEdges, coordinates) {
  return filteredEdges.map(([start, end]) => {
    return coordinates[start].x > coordinates[end].x
      ? [end, start]
      : [start, end];
  });
}
function filterEdgesByLength(edges, coordinates, thresholdMultiplier = 1.5) {
  const edgeLengths = calculateEdgeLengths(edges, coordinates);
  const median = math.median(edgeLengths);
  const mad = math.median(edgeLengths.map((len) => Math.abs(len - median)));
  const lowerBound = median - thresholdMultiplier * mad;
  const upperBound = median + thresholdMultiplier * mad;

  const filteredEdges = edges.filter((edge, index) => {
    const length = edgeLengths[index];
    return length <= upperBound;
  });

  return orderEdgesToPointRight(filteredEdges, coordinates);
}
function angleWithXAxis(startCoord, endCoord) {
  const dx = endCoord.x - startCoord.x;
  const dy = endCoord.y - startCoord.y;
  const angleRadians = Math.atan2(dy, dx);
  return angleRadians * (180 / Math.PI);
}

function filterEdgesByAngle(edges, coordinates, thresholdAngle, originAngle) {
  return edges.filter(([start, end]) => {
    const startCoord = coordinates[start];
    const endCoord = coordinates[end];
    const angle = angleWithXAxis(startCoord, endCoord);

    // Normalize angles to be within -180 to 180 degrees
    let normalizedAngle = normalizeAngleDegrees(angle);

    // Check if the edge angle is within the threshold from the origin angle
    return (
      normalizedAngle <= originAngle + thresholdAngle &&
      normalizedAngle >= originAngle - thresholdAngle
    );
  });
}

function limitConnections(edges, coordinates) {
  // Step 1: Calculate distances for all connections
  let allConnections = {};
  edges.forEach((edge) => {
    const [pointA, pointB] = edge;
    const dx = coordinates[pointB].x - coordinates[pointA].x;
    const dy = coordinates[pointB].y - coordinates[pointA].y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    allConnections[pointA] = allConnections[pointA] || [];
    allConnections[pointB] = allConnections[pointB] || [];
    allConnections[pointA].push({ point: pointB, distance: distance });
    allConnections[pointB].push({ point: pointA, distance: distance });
  });

  // Step 2: Sort connections for each point
  Object.keys(allConnections).forEach((point) => {
    allConnections[point].sort((a, b) => a.distance - b.distance);
  });

  // Step 3: Select the closest point in each direction mutually
  let mutualConnections = {};
  Object.keys(allConnections).forEach((point) => {
    allConnections[point].forEach((connection) => {
      const connectedPoint = connection.point;
      if (coordinates[connectedPoint].x < coordinates[point].x) {
        // Connected point is to the left
        if (
          !mutualConnections[point] ||
          !mutualConnections[point].left ||
          connection.distance < mutualConnections[point].left.distance
        ) {
          mutualConnections[point] = mutualConnections[point] || {};
          mutualConnections[point].left = {
            point: connectedPoint,
            distance: connection.distance,
          };
        }
      } else if (coordinates[connectedPoint].x > coordinates[point].x) {
        // Connected point is to the right
        if (
          !mutualConnections[point] ||
          !mutualConnections[point].right ||
          connection.distance < mutualConnections[point].right.distance
        ) {
          mutualConnections[point] = mutualConnections[point] || {};
          mutualConnections[point].right = {
            point: connectedPoint,
            distance: connection.distance,
          };
        }
      }
    });
  });

  // Step 4: Confirm the directionality is mutual
  let finalEdges = new Set();
  Object.keys(mutualConnections).forEach((point) => {
    const directions = mutualConnections[point];
    Object.keys(directions).forEach((direction) => {
      const connectedPoint = directions[direction].point;
      const oppositeDirection = direction === "right" ? "left" : "right";
      if (
        mutualConnections[connectedPoint] &&
        mutualConnections[connectedPoint][oppositeDirection] &&
        mutualConnections[connectedPoint][oppositeDirection].point == point
      ) {
        finalEdges.add(
          JSON.stringify(
            [
              Math.min(point, connectedPoint),
              Math.max(point, connectedPoint),
            ].sort()
          )
        );
      }
    });
  });

  // Return the list of final edges
  return Array.from(finalEdges).map((edge) => JSON.parse(edge));
}

function visualizeCores(cores, svgId) {
  const svg = d3.select(svgId);
  svg
    .selectAll("circle")
    .data(cores)
    .enter()
    .append("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", 3)
    .attr("fill", "blue");
}

function visualizeEdges(edges, coordinates, svgId, color = "black") {
  const svg = d3.select(svgId);
  edges.forEach((edge) => {
    const [start, end] = edge;
    svg
      .append("line")
      .attr("x1", coordinates[start].x)
      .attr("y1", coordinates[start].y)
      .attr("x2", coordinates[end].x)
      .attr("y2", coordinates[end].y)
      .attr("stroke", color)
      .attr("stroke-width", 1);
  });
}

// Helper function to calculate distance between two points
function calculateDistance(p1, p2) {
  return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}

// Helper function to normalize an angle between 0 and 360 degrees
function normalizeAngleDegrees(angle) {
  return angle % 360;
}




function traveling_algorithm(
  segments,
  imageWidth,
  distance,
  gamma,
  phi = 180,
  originAngle = 0,
  radiusMultiplier = 0.5
) {
  let rows = [];
  let radius = radiusMultiplier * distance;
  let imaginaryIndex = -1;

  segments = initializeSegments(segments);

  while (segments.length > 0) {
    let { startPoint, row } = findStartVectorAndRow(segments, originAngle);
    let endPoint = startPoint.end;
    let isEndPointReal = true;
    segments = segments.filter(segment => segment.index !== startPoint.index);

    while (true) {
      let nextVector = findNextVector(segments, endPoint);

      if (nextVector) {
        row.push(nextVector);
        endPoint = nextVector.end;
        segments = segments.filter(v => v.index !== nextVector.index);
        isEndPointReal = !nextVector.isImaginary;
      } else {
        if (!isCloseToImageWidth(endPoint, imageWidth, gamma, originAngle)) {
          let candidate = findCandidateInSector(segments, endPoint, radius, phi, originAngle);
          if (candidate) {
            row.push(candidate);

            // Update the candidate's start point when the last endpoint was real. This ensures the last endpoint isn't overlooked.
            // This update is only necessary for isolated points, where the start and end points are the same.
            if (isEndPointReal && calculateDistance(candidate.start[0], candidate.end[0]) < 1e-1) {
              candidate.start = endPoint; // Update the start point if the endpoint was real
            }

            // When there are two two point segments that are next to each other, the end point of the first segment will be missed, so we need to add it in manually
            if (isEndPointReal && endPoint !== candidate.start) { 
              row.push({
                start: endPoint,
                end: candidate.start,
                index: imaginaryIndex,
                isImaginary: false,
              });
              imaginaryIndex--;
            }

            endPoint = candidate.end;
            segments = segments.filter(v => v.index !== candidate.index);
            isEndPointReal = !candidate.isImaginary;
          } else {
            let imaginaryVector = createImaginaryVector(endPoint, distance, originAngle, imaginaryIndex);
            if (isEndPointReal) {
              imaginaryVector.isImaginary = false; // Mark as not imaginary if the endpoint was real
            }
            imaginaryIndex--;
            row.push(imaginaryVector);
            endPoint = imaginaryVector.end;
            isEndPointReal = false;
            checkImaginaryPointsLimit(row);
          }
        } else {
          let sortedRow = sortRowByRotatedX(row, originAngle);
          let uniqueRow = filterUniquePoints(sortedRow);
          rows.push(uniqueRow);
          break;
        }
      }
    }
  }
  return rows;
}

function sortRowByRotatedX(row, originAngle) {
  const angleRad = originAngle * Math.PI / 180 * -1;
  return row.sort((a, b) => {
    let rotatedAX = a.start[0] * Math.cos(angleRad) - a.start[1] * Math.sin(angleRad);
    let rotatedBX = b.start[0] * Math.cos(angleRad) - b.start[1] * Math.sin(angleRad);
    return rotatedAX - rotatedBX;
  });
}



function initializeSegments(segments) {
  return segments.map((v, i) => ({
    start: v[0],
    end: v[1],
    index: i,
    isImaginary: false,
  }));
}
function findStartVectorAndRow(segments, originAngle) {

  let startVector = segments.reduce((prev, curr) => 
    rotatePoint(prev.start,-originAngle)[0] < rotatePoint(curr.start,-originAngle)[0] ? prev : curr
  );

  let row = [startVector];
  return { startPoint: startVector, row: row };
}
function findNextVector(segments, endPoint) {
  return segments.find(v => calculateDistance(v.start, endPoint) < 1e-1);
}

function findCandidateInSector(segments, endPoint, radius, phi, originAngle) {


  let candidates = segments.filter(v => 
    pointInSector(v.start, endPoint, radius, phi, originAngle)
  );
  if (candidates.length > 0) {
    return candidates.reduce((prev, curr) =>
      calculateDistance(curr.end, endPoint) < calculateDistance(prev.end, endPoint)
        ? curr
        : prev
    );
  }
  return null;
}
function createImaginaryVector(startPoint, distance, originAngle, index) {
  let deltaRad = originAngle * (Math.PI / 180);
  let endPoint = [
    startPoint[0] + distance * Math.cos(deltaRad),
    startPoint[1] + distance * Math.sin(deltaRad),
  ];
  return {
    start: startPoint,
    end: endPoint,
    index: index,
    isImaginary: true
  };
}

function filterUniquePoints(row) {
  return row.map(vec => ({
    point: vec.start,
    index: vec.index,
    isImaginary: vec.isImaginary,
  })).filter((v, i, self) => 
    self.findIndex(t => t.point[0] === v.point[0] && t.point[1] === v.point[1]) === i
  );
}

function pointInSector(V_prime, Vj, radius, phi, originAngle) {
  // Calculate the distance between V_prime and Vj
  const dx = V_prime[0] - Vj[0];
  const dy = V_prime[1] - Vj[1];
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Check if the point is within the radius
  if (distance > radius) {
      return false;
  } else{
      return true;
  }
}


function isCloseToImageWidth(point, imageWidth, gamma, originAngle) {

  return imageWidth - point[0] < gamma;
}
function checkImaginaryPointsLimit(row) {
  let consecutiveImaginaryPoints = row.reduce((count, vec) => {
    return vec.isImaginary ? count + 1 : 0;
  }, 0);

  if (consecutiveImaginaryPoints > 50) {
    alert("Invalid hyperparameters: too many consecutive imaginary points.");
    throw new Error("Invalid parameters: too many consecutive imaginary points.");
  }
}


function isPointInList(pointIndex, edgeList) {
  return edgeList.some(
    (edge) => edge[0] === pointIndex || edge[1] === pointIndex
  );
}

function sortEdgesAndAddIsolatedPoints(bestEdgeSet, normalizedCoordinates) {
  // Sort edges so that the point with the smaller x-coordinate comes first
  let sortedEdges = bestEdgeSet.map((edge) => {
    const [start, end] = edge;
    return normalizedCoordinates[start].x <= normalizedCoordinates[end].x
      ? [start, end]
      : [end, start];
  });

  // Find all indices that are not included in any edge
  let isolatedIndices = normalizedCoordinates
    .map((_, index) => index)
    .filter((index) => !isPointInList(index, sortedEdges));

  // Create edges for isolated points (self-referential)
  let isolatedPointsInput = isolatedIndices.map((index) => [index, index]);

  // Combine sorted edges with isolated points
  let bestEdgeSetIndices = sortedEdges.concat(isolatedPointsInput);

  return bestEdgeSetIndices;
}

function medianEdgeLength(vectors) {
  // Create a map to store the connections
  const pointsMap = new Map();

  // Populate the map with vector connections
  vectors.forEach(([start, end]) => {
    if (!pointsMap.has(start)) pointsMap.set(start, new Set());
    if (!pointsMap.has(end)) pointsMap.set(end, new Set());

    pointsMap.get(start).add(end);
    pointsMap.get(end).add(start);
  });

  // Recursive function to build edges
  function buildEdge(start, visited) {
    const edge = [start];
    pointsMap.get(start).forEach((end) => {
      if (!visited.has(end)) {
        visited.add(end);
        edge.push(...buildEdge(end, visited));
      }
    });
    return edge;
  }

  // Find all unique edges
  const allEdges = [];
  const visited = new Set();
  pointsMap.forEach((_, start) => {
    if (!visited.has(start)) {
      visited.add(start);
      const edge = buildEdge(start, visited);
      // Filter duplicates and maintain order
      const orderedEdge = Array.from(new Set(edge));
      if (
        orderedEdge.length > 1 ||
        orderedEdge[0] === orderedEdge[orderedEdge.length - 1]
      ) {
        allEdges.push(orderedEdge);
      }
    }
  });

  // Filter to keep only the longest edges
  const finalEdges = allEdges.filter((edge) => {
    return !allEdges.some((existingEdge) => {
      const isSubset = edge.every((val) => existingEdge.includes(val));
      return isSubset && existingEdge.length > edge.length;
    });
  });

  // Get the lengths of the edges
  const lengths = finalEdges.map(edge => edge.length);

  // Sort the lengths
  lengths.sort((a, b) => a - b);

  // Calculate the median
  const middle = Math.floor(lengths.length / 2);
  const medianLength = lengths.length % 2 !== 0 
    ? lengths[middle] 
    : (lengths[middle - 1] + lengths[middle]) / 2;

  return isNaN(medianLength) ? 0 : medianLength;
}


function averageEdgeLength(vectors) {
  // Create a map to store the connections
  const pointsMap = new Map();

  // Populate the map with vector connections
  vectors.forEach(([start, end]) => {
    if (!pointsMap.has(start)) pointsMap.set(start, new Set());
    if (!pointsMap.has(end)) pointsMap.set(end, new Set());

    pointsMap.get(start).add(end);
    pointsMap.get(end).add(start);
  });

  // Recursive function to build edges
  function buildEdge(start, visited) {
    const edge = [start];
    pointsMap.get(start).forEach((end) => {
      if (!visited.has(end)) {
        visited.add(end);
        edge.push(...buildEdge(end, visited));
      }
    });
    return edge;
  }

  // Find all unique edges
  const allEdges = [];
  const visited = new Set();
  pointsMap.forEach((_, start) => {
    if (!visited.has(start)) {
      visited.add(start);
      const edge = buildEdge(start, visited);
      // Filter duplicates and maintain order
      const orderedEdge = Array.from(new Set(edge));
      if (
        orderedEdge.length > 1 ||
        orderedEdge[0] === orderedEdge[orderedEdge.length - 1]
      ) {
        allEdges.push(orderedEdge);
      }
    }
  });

  // Filter to keep only the longest edges
  const finalEdges = allEdges.filter((edge) => {
    return !allEdges.some((existingEdge) => {
      const isSubset = edge.every((val) => existingEdge.includes(val));
      return isSubset && existingEdge.length > edge.length;
    });
  });

  // Calculate the average edge length
  const averageLength =
    finalEdges.reduce((acc, edge) => acc + edge.length, 0) / finalEdges.length;
  return isNaN(averageLength) ? 0 : averageLength;
}

async function determineImageRotation(
  normalizedCoordinates,
  length_filtered_edges,
  minAngle,
  maxAngle,
  angleStepSize,
  angleThreshold
) {
  // Assuming `readJson` is an async function to read and parse JSON data from a file
  let bestEdgeSet = null;
  let bestEdgeSetLength = 0;
  let optimalAngle = minAngle;

  for (let i = minAngle; i < maxAngle; i += angleStepSize) {
    let edgesSet = filterEdgesByAngle(
      length_filtered_edges,
      normalizedCoordinates,
      angleThreshold,
      i
    );
    edgesSet = limitConnections(edgesSet, normalizedCoordinates);
    edgesSet = sortEdgesAndAddIsolatedPoints(edgesSet, normalizedCoordinates);
    let setLength = medianEdgeLength(edgesSet);
    if (setLength > bestEdgeSetLength) {
      bestEdgeSetLength = setLength;
      bestEdgeSet = edgesSet;
      optimalAngle = i;
    }
  }

  return [bestEdgeSet, bestEdgeSetLength, optimalAngle];
}
function calculateGridWidth(centers, d, multiplier) {
  let maxX = Math.max(...centers.map((center) => center.x));
  return maxX + multiplier * d;
}

function calculateAverageDistance(coordinatesInput) {
  let averageDistances = [];
  for (let edge of coordinatesInput) {
    let start = edge[0],
      end = edge[1];
    let distance = Math.sqrt(
      Math.pow(start[0] - end[0], 2) + Math.pow(start[1] - end[1], 2)
    );
    averageDistances.push(distance);
  }

  return math.median(averageDistances); // Assuming median is a function you have defined or imported
}

export {
  preprocessCores,
  getEdgesFromTriangulation,
  filterEdgesByAngle,
  filterEdgesByLength,
  limitConnections,
  visualizeCores,
  visualizeEdges,
  calculateGridWidth,
  calculateAverageDistance,
  determineImageRotation,
  traveling_algorithm,
  sortEdgesAndAddIsolatedPoints,
};
// Call the function to load data and visualize
// loadDataAndVisualize().catch(error => console.error('An error occurred:', error));
