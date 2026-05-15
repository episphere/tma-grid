// Load the model from the web server where the model.json and group1-shard1of1.bin files are located

import * as tf from "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/+esm";

import { visualizeSegmentationResults } from "./drawCanvas.js";

function loadOpenCV() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.2/dist/opencv.min.js";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (cv.getBuildInformation) {
        console.log("OpenCV.js is ready.");
        resolve("OpenCV Loaded");
      } else {
        // reject("OpenCV.js is loaded but not ready to use.");
      }
    };

    script.onerror = () => {
      reject("Failed to load OpenCV.js");
    };

    document.body.appendChild(script);
  });
}

async function loadModel(modelUrl) {
  try {
    const model = await tf.loadLayersModel(modelUrl);
    console.log("Model loaded successfully");

    return model;
    // You can now use the `model` object to make predictions, evaluate the model, etc.
  } catch (error) {
    console.error("Error loading the model", error);
  }
}

function getMaxValue(mat) {
  let maxVal = 0;
  for (let i = 0; i < mat.rows; i++) {
    for (let j = 0; j < mat.cols; j++) {
      let val = mat.floatPtr(i, j)[0];
      if (val > maxVal) {
        maxVal = val;
      }
    }
  }
  return maxVal;
}

function visualizeMarkers(distTransform, imgElementId) {
  // return;

  // Normalize the distance transform image to be in the range of 0-255 for visualization
  let normalized = new cv.Mat();
  cv.normalize(distTransform, normalized, 0, 255, cv.NORM_MINMAX, cv.CV_8UC1);

  // Convert the normalized image to BGR for display purposes
  let colored = new cv.Mat();
  cv.cvtColor(normalized, colored, cv.COLOR_GRAY2BGR);

  // Now, we don't need to assign colors since it's a gradient image
  // The rest of the code can remain the same

  // Display the image in the browser
  displayImage(colored, imgElementId);

  // Cleanup
  normalized.delete();
  colored.delete();
}

function displayImage(image, filename) {
  // Create a canvas element
  let canvas = document.createElement("canvas");

  // Ensure the canvas size matches the OpenCV image
  canvas.width = 1024;
  canvas.height = 1024;

  // Draw the image onto the canvas using OpenCV
  cv.imshow(canvas, image);

  // Convert the canvas to a data URL
  let dataURL = canvas.toDataURL();

  // Create a temporary link element for downloading the image
  let downloadLink = document.createElement("a");
  downloadLink.href = dataURL;
  downloadLink.download = filename;

  // Append the link to the document, trigger the download, and then remove the link
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// // https://docs.opencv.org/4.x/d3/db4/tutorial_py_watershed.html

// Convert to grayscale if the image is not already
const toGrayscale = (data) => {
  let gray = new cv.Mat();
  if (data.channels() === 3 || data.channels() === 4) {
    cv.cvtColor(data, gray, cv.COLOR_RGBA2GRAY, 0);
  } else {
    gray = data.clone();
  }
  return gray;
};

// Convert to binary image using threshold
const toBinary = (gray) => {
  let binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
  return binary;
};

// Noise removal with opening
const applyOpening = (binary) => {
  let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  let opening = new cv.Mat();
  cv.morphologyEx(binary, opening, cv.MORPH_OPEN, kernel);
  kernel.delete();
  return opening;
};

// Dilate to identify all potential holes
const applyDilation = (opening) => {
  let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  let dilated = new cv.Mat();
  cv.dilate(opening, dilated, kernel, new cv.Point(-1, -1), 1);
  kernel.delete();
  return dilated;
};

function getSmallHoleThreshold(
  areas,
  percentAreaTolerance = 0.1,
  percentThreshold = 0.8
) {
  // Step 1: Sort the areas to facilitate clustering
  areas.sort((a, b) => a - b);

  // Step 2: Cluster areas that are within 10% of each other
  let clusters = [];
  let tolerance = percentAreaTolerance;

  for (let area of areas) {
    let added = false;
    for (let cluster of clusters) {
      // Check if the area is within 10% of any cluster's range
      if (cluster.some((a) => Math.abs(a - area) / area <= tolerance)) {
        cluster.push(area);
        added = true;
        break;
      }
    }
    // If the area doesn't fit into any cluster, create a new one
    if (!added) clusters.push([area]);
  }

  // Step 3: Find the cluster with the highest frequency (mode)
  let modeCluster = clusters.reduce((prev, current) =>
    prev.length > current.length ? prev : current
  );

  // Calculate the mode area within the most frequent cluster
  // Since areas within a cluster are considered the same, just pick the first one
  let modeArea = modeCluster[0];

  // Step 4: Determine the small hole size threshold as percentThreshold times the mode area
  let smallHoleThreshold = modeArea * percentThreshold;

  // Output the threshold
  return smallHoleThreshold;
}
// Find and fill small holes
const fillSmallHoles = (opening, dilated) => {
  let holes = new cv.Mat();
  cv.subtract(dilated, opening, holes);
  let labels = new cv.Mat();
  let stats = new cv.Mat();
  let centroids = new cv.Mat();
  cv.connectedComponentsWithStats(holes, labels, stats, centroids);

  // visualizeMarkers(holes, "00 - holes.png");
  // Assuming a threshold calculation step here, similar to the original logic
  let smallHolesMask = cv.Mat.zeros(holes.rows, holes.cols, cv.CV_8UC1);

  // Collect all hole areas
  let areas = [];
  for (let i = 1; i < stats.rows; i++) {
    let area = stats.intAt(i, cv.CC_STAT_AREA);
    areas.push(area);
  }

  if (areas.length === 0) {
    holes.delete();
    labels.delete();
    stats.delete();
    centroids.delete();
    smallHolesMask.delete();
    return opening;
  }

  const smallHoleThreshold = getSmallHoleThreshold(areas, 0.1, 0.5);

  // This step was missing from the original correction, so it's reintroduced here
  for (let i = 1; i < stats.rows; i++) {
    let area = stats.intAt(i, cv.CC_STAT_AREA);
    // Define your smallHoleThreshold based on the median area or another criterion

    if (area < smallHoleThreshold) {
      let blobLabel = i;
      for (let r = 0; r < labels.rows; r++) {
        for (let c = 0; c < labels.cols; c++) {
          if (labels.intAt(r, c) === blobLabel) {
            smallHolesMask.ucharPtr(r, c)[0] = 255;
          }
        }
      }
    }
  }

  // visualizeMarkers(smallHolesMask, "00 - smallHolesMask.png");

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    smallHolesMask,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );
  cv.drawContours(
    opening,
    contours,
    -1,
    new cv.Scalar(255, 255, 255, 255),
    cv.FILLED
  );

  holes.delete();
  labels.delete();
  stats.delete();
  centroids.delete();
  smallHolesMask.delete();
  contours.delete();
  hierarchy.delete();

  return opening;
};

// Calculate properties for each region
const calculateRegionProperties = (image, minArea, maxArea) => {
  let labels = new cv.Mat();
  let stats = new cv.Mat();
  let centroids = new cv.Mat();
  cv.connectedComponentsWithStats(image, labels, stats, centroids);

  let centroidsFinal = [];
  for (let i = 1; i < stats.rows; i++) {
    let area = stats.intAt(i, cv.CC_STAT_AREA);
    let radius = Math.sqrt(area / Math.PI);
    if (area * 4 >= minArea && area * 4 <= maxArea) {
      let x = centroids.data64F[i * 2]; // X coordinate
      let y = centroids.data64F[i * 2 + 1]; // Y coordinate
      centroidsFinal.push({ x, y, area, radius });
    }
  }

  labels.delete();
  stats.delete();
  centroids.delete();

  return centroidsFinal;
};

function thresholdDistanceTransform(matrix, disTransformMultiplier) {
  //   // Finding sure foreground area
  let distTransform = new cv.Mat();
  cv.distanceTransform(matrix, distTransform, cv.DIST_L2, 5);

  let sureFg = new cv.Mat();
  // Then use it in your threshold call
  let maxVal = getMaxValue(distTransform);

  // The disTransformMultiplier is a factor that scales the threshold value used to decide which parts of the distance-transformed image are considered sure foreground.
  // Typically, the maximum value in the distance transform image is identified. This value represents the furthest distance any pixel has from the background.
  cv.threshold(distTransform, sureFg, disTransformMultiplier * maxVal, 255, 0);

  sureFg.convertTo(sureFg, cv.CV_8U);
  distTransform.delete();

  return sureFg;
}

function calculateMedianRadius(segmented, minArea, maxArea) {
  // Invert the colors: black to white, white to black
  let inverted = new cv.Mat();
  cv.bitwise_not(segmented, inverted);

  // Find contours of the circles
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    inverted,
    contours,
    hierarchy,
    cv.RETR_CCOMP,
    cv.CHAIN_APPROX_SIMPLE
  );

  // visualizeMarkers(inverted, "inverted.png");
  let circleProperties = [];
  // hierarchy is a Mat where each row contains these four values
  let data = hierarchy.data32S;
  for (let i = 0; i < contours.size(); ++i) {
    // Check if the contour has a parent, meaning it's a hole
    if (data[i * 4 + 3] != -1) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);
      let circle = cv.minEnclosingCircle(cnt);
      circleProperties.push({
        x: circle.center.x,
        y: circle.center.y,
        area: area,
        radius: circle.radius,
      });
      cnt.delete();
    }
  }

  const medianRadius = findMedian(circleProperties.map((x) => x.radius));
  // Cleanup
  inverted.delete();
  contours.delete();
  hierarchy.delete();

  return [medianRadius, circleProperties];
}
function findMedian(values) {
  if (!values || values.length === 0) {
    return undefined;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const midIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    // If even number of distances, median is the average of the two middle numbers
    return (sortedValues[midIndex - 1] + sortedValues[midIndex]) / 2;
  }
  // If odd, median is the middle number
  return sortedValues[midIndex];
}

function applyWatershed(data, markers) {
  // Apply watershed
  cv.watershed(data, markers);

  // Convert markers back to 8-bit to visualize or further process
  let segmented = new cv.Mat();
  markers.convertTo(segmented, cv.CV_8U, 255, 255); // Convert for visualization

  // Optionally, you might want to visualize or isolate specific segments here
  return segmented; // This Mat now contains the watershed result
}

// This function prepares markers for the watershed algorithm
function prepareMarkers(filledOpening, sureFg) {
  // Finding unknown region
  sureFg.convertTo(sureFg, cv.CV_8U);

  // Marker labelling
  let markers = new cv.Mat();
  cv.connectedComponents(sureFg, markers);

  return markers; // This will be used for segmentation
}

function preprocessImageForContours(segmented) {
  let kernel = cv.Mat.ones(3, 3, cv.CV_8U);

  let processed = segmented.clone(); // Ensure processed has the same size and type as segmented
  cv.morphologyEx(segmented, processed, cv.MORPH_CLOSE, kernel);
  // Threshold the image to ensure binary image
  cv.threshold(processed, processed, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
  // Apply morphological operations
  cv.morphologyEx(processed, processed, cv.MORPH_CLOSE, kernel);
  kernel.delete();
  return processed;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function sanitizeCoreProperties(properties) {
  const values = Array.isArray(properties)
    ? properties
    : Object.values(properties || {});

  return values
    .map((property) => {
      const areaFromProperty = Number.isFinite(property.area)
        ? property.area
        : null;
      const radiusFromArea =
        areaFromProperty && areaFromProperty > 0
          ? Math.sqrt(areaFromProperty / Math.PI)
          : null;
      const radius = Number.isFinite(property.radius) && property.radius > 0
        ? property.radius
        : radiusFromArea;
      const area = Number.isFinite(areaFromProperty) && areaFromProperty > 0
        ? areaFromProperty
        : radius * radius * Math.PI;

      return {
        ...property,
        area,
        radius,
      };
    })
    .filter(
      (property) =>
        Number.isFinite(property.x) &&
        Number.isFinite(property.y) &&
        Number.isFinite(property.radius) &&
        Number.isFinite(property.area) &&
        property.radius > 0 &&
        property.area > 0
    );
}

function getDetectionMedianRadius(properties, fallbackRadius = null) {
  return (
    calculateMedianNumber(
      sanitizeCoreProperties(properties).map((property) => property.radius)
    ) ||
    fallbackRadius ||
    1
  );
}

function getCoreDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getNearestNeighborDistances(properties) {
  const sanitizedProperties = sanitizeCoreProperties(properties);
  if (sanitizedProperties.length < 2) {
    return [];
  }

  return sanitizedProperties.map((property, propertyIndex) => {
    let nearestDistance = Infinity;
    sanitizedProperties.forEach((candidate, candidateIndex) => {
      if (propertyIndex === candidateIndex) {
        return;
      }

      nearestDistance = Math.min(
        nearestDistance,
        getCoreDistance(property, candidate)
      );
    });
    return nearestDistance;
  });
}

function getTypicalCoreSpacing(properties, fallbackRadius) {
  const typicalRadius = fallbackRadius || getDetectionMedianRadius(properties);
  const nearestDistances = getNearestNeighborDistances(properties).filter(
    (distance) => distance > typicalRadius * 1.2
  );

  return calculateMedianNumber(nearestDistances) || typicalRadius * 3.2;
}

function isDuplicateDetection(property, existingProperties, threshold) {
  return existingProperties.some(
    (existingProperty) => getCoreDistance(property, existingProperty) < threshold
  );
}

function isPointInsideComponent(point, component, padding = 0) {
  return (
    Number.isFinite(component.left) &&
    Number.isFinite(component.top) &&
    Number.isFinite(component.width) &&
    Number.isFinite(component.height) &&
    point.x >= component.left - padding &&
    point.x <= component.left + component.width + padding &&
    point.y >= component.top - padding &&
    point.y <= component.top + component.height + padding
  );
}

function componentHasExistingDetection(component, existingProperties, padding) {
  return existingProperties.some((property) =>
    isPointInsideComponent(property, component, padding)
  );
}

function isLikelyBridgeBetweenExistingCores(
  property,
  existingProperties,
  typicalRadius
) {
  const nearbyExisting = existingProperties
    .map((existingProperty) => ({
      property: existingProperty,
      distance: getCoreDistance(property, existingProperty),
    }))
    .filter(({ distance }) => distance < Math.max(typicalRadius * 1.85, 4))
    .sort((a, b) => a.distance - b.distance);

  if (nearbyExisting.length < 2) {
    return false;
  }

  const first = nearbyExisting[0].property;
  const second = nearbyExisting[1].property;
  const midpoint = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
  const midpointDistance = getCoreDistance(property, midpoint);

  return midpointDistance < Math.max(typicalRadius * 0.65, 3);
}

function dedupeCoreProperties(properties, typicalRadius) {
  const duplicateDistance = Math.max((typicalRadius || 1) * 0.8, 3);
  return sanitizeCoreProperties(properties)
    .sort((a, b) => {
      const confidenceA = Number.isFinite(a.confidence) ? a.confidence : 1;
      const confidenceB = Number.isFinite(b.confidence) ? b.confidence : 1;
      return confidenceB - confidenceA;
    })
    .reduce((deduped, property) => {
      if (!isDuplicateDetection(property, deduped, duplicateDistance)) {
        deduped.push(property);
      }
      return deduped;
    }, [])
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function filterIsolatedEdgeArtifacts(properties, imageWidth, imageHeight, typicalRadius) {
  const sanitizedProperties = sanitizeCoreProperties(properties);
  const typicalSpacing = getTypicalCoreSpacing(sanitizedProperties, typicalRadius);
  const neighborDistance = Math.max(typicalSpacing * 1.35, typicalRadius * 4);
  const edgeMargin = Math.max(typicalSpacing * 0.9, typicalRadius * 4);

  return sanitizedProperties.filter((property) => {
    const neighborCount = sanitizedProperties.filter(
      (candidate) =>
        candidate !== property &&
        getCoreDistance(property, candidate) <= neighborDistance
    ).length;
    const isNearEdge =
      property.x < edgeMargin ||
      property.y < edgeMargin ||
      property.x > imageWidth - edgeMargin ||
      property.y > imageHeight - edgeMargin;

    return !(isNearEdge && neighborCount === 0);
  });
}

function calculateMaskComponentProperties(image, minArea, maxArea, options = {}) {
  const minAreaScale = options.minAreaScale || 0.55;
  const maxAreaScale = options.maxAreaScale || 1.25;
  const maxAspectRatio = options.maxAspectRatio || 2.7;
  const minFillRatio = options.minFillRatio || 0.18;
  let labels = new cv.Mat();
  let stats = new cv.Mat();
  let centroids = new cv.Mat();
  cv.connectedComponentsWithStats(image, labels, stats, centroids);

  const properties = [];
  for (let i = 1; i < stats.rows; i++) {
    const area = stats.intAt(i, cv.CC_STAT_AREA);
    const scaledArea = area * 4;

    if (scaledArea < minArea * minAreaScale || scaledArea > maxArea * maxAreaScale) {
      continue;
    }

    const left = stats.intAt(i, cv.CC_STAT_LEFT);
    const top = stats.intAt(i, cv.CC_STAT_TOP);
    const width = stats.intAt(i, cv.CC_STAT_WIDTH);
    const height = stats.intAt(i, cv.CC_STAT_HEIGHT);
    const aspectRatio = Math.max(
      width / Math.max(height, 1),
      height / Math.max(width, 1)
    );
    const fillRatio = area / Math.max(width * height, 1);

    if (aspectRatio > maxAspectRatio || fillRatio < minFillRatio) {
      continue;
    }

    const radius = Math.sqrt(area / Math.PI);
    properties.push({
      x: centroids.data64F[i * 2],
      y: centroids.data64F[i * 2 + 1],
      area,
      radius,
      aspectRatio,
      fillRatio,
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    });
  }

  labels.delete();
  stats.delete();
  centroids.delete();

  return properties;
}

function getContourPoints(contour) {
  const points = [];
  const data = contour.data32S;

  if (!data) {
    return points;
  }

  for (let index = 0; index < data.length; index += 2) {
    points.push({
      x: data[index],
      y: data[index + 1],
    });
  }

  return points;
}

function fitCircleFromPoints(points) {
  if (!points.length) {
    return null;
  }

  const pointMatType = cv.CV_32FC2 || cv.CV_32SC2;
  if (typeof cv.matFromArray !== "function" || !Number.isFinite(pointMatType)) {
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const radius = Math.max(
      ...points.map((point) => Math.hypot(point.x - x, point.y - y))
    );
    return { x, y, radius };
  }

  const pointData = [];
  points.forEach((point) => {
    pointData.push(point.x, point.y);
  });

  const pointMat = cv.matFromArray(points.length, 1, pointMatType, pointData);
  const circle = cv.minEnclosingCircle(pointMat);
  pointMat.delete();

  return {
    x: circle.center.x,
    y: circle.center.y,
    radius: circle.radius,
  };
}

function solveLinearSystem3x3(matrix, values) {
  const m = matrix.map((row) => [...row]);
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

function fitLeastSquaresCircle(points) {
  if (points.length < 3) {
    return null;
  }

  const normalMatrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const normalValues = [0, 0, 0];

  points.forEach((point) => {
    const features = [point.x, point.y, 1];
    const target = -(point.x * point.x + point.y * point.y);

    for (let i = 0; i < 3; i++) {
      normalValues[i] += features[i] * target;
      for (let j = 0; j < 3; j++) {
        normalMatrix[i][j] += features[i] * features[j];
      }
    }
  });

  const coefficients = solveLinearSystem3x3(normalMatrix, normalValues);
  if (!coefficients) {
    return null;
  }

  const [a, b, c] = coefficients;
  const x = -a / 2;
  const y = -b / 2;
  const radiusSquared = x * x + y * y - c;

  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) {
    return null;
  }

  return {
    x,
    y,
    radius: Math.sqrt(radiusSquared),
  };
}

function getPointDistancesFromCenter(points, center) {
  return points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
}

function getMaximumPointDistance(points, center) {
  return points.reduce(
    (maxDistance, point) =>
      Math.max(maxDistance, Math.hypot(point.x - center.x, point.y - center.y)),
    0
  );
}

function getRobustCircleBoundaryPoints(points, seedCircle, typicalRadius) {
  if (!seedCircle || points.length < 8) {
    return points;
  }

  let activePoints = points;
  let circle = seedCircle;

  for (let iteration = 0; iteration < 4; iteration++) {
    const distances = getPointDistancesFromCenter(points, circle);
    const medianRadius = calculateMedianNumber(distances) || circle.radius;
    const residuals = distances.map((distance) =>
      Math.abs(distance - medianRadius)
    );
    const residualMad = calculateMedianNumber(residuals) || 0;
    const residualLimit = Math.max(typicalRadius * 0.18, residualMad * 3, 1.5);
    const radiusLimit = Math.max(typicalRadius * 1.85, medianRadius * 1.45);
    const nextPoints = points.filter((point, index) => {
      const distance = distances[index];
      return (
        Math.abs(distance - medianRadius) <= residualLimit &&
        distance <= radiusLimit
      );
    });
    const minSupport = Math.max(8, Math.floor(points.length * 0.45));

    if (nextPoints.length < minSupport) {
      break;
    }

    const nextCircle = fitLeastSquaresCircle(nextPoints);
    if (!nextCircle) {
      break;
    }

    activePoints = nextPoints;
    circle = nextCircle;
  }

  return activePoints;
}

function optimizeCircleCenterForPoints(points, seedCenter, anchorPoint, typicalRadius) {
  if (!points.length || !seedCenter) {
    return null;
  }

  const maxCenterShift = Math.max(typicalRadius * 1.15, 3);
  const centerPenalty = 0.015;
  const initialCenter =
    getCoreDistance(seedCenter, anchorPoint) <= maxCenterShift
      ? seedCenter
      : anchorPoint;
  let step = Math.max(typicalRadius * 0.22, 2);
  let best = {
    x: initialCenter.x,
    y: initialCenter.y,
    radius: getMaximumPointDistance(points, initialCenter),
  };
  let bestCost =
    best.radius + getCoreDistance(best, anchorPoint) * centerPenalty;

  for (let iteration = 0; iteration < 8; iteration++) {
    let improved = false;

    [-step, 0, step].forEach((dy) => {
      [-step, 0, step].forEach((dx) => {
        if (dx === 0 && dy === 0) {
          return;
        }

        const candidate = {
          x: best.x + dx,
          y: best.y + dy,
        };

        if (getCoreDistance(candidate, anchorPoint) > maxCenterShift) {
          return;
        }

        const radius = getMaximumPointDistance(points, candidate);
        const cost = radius + getCoreDistance(candidate, anchorPoint) * centerPenalty;

        if (cost < bestCost) {
          best = {
            ...candidate,
            radius,
          };
          bestCost = cost;
          improved = true;
        }
      });
    });

    if (!improved) {
      step /= 2;
    }

    if (step < 0.2) {
      break;
    }
  }

  return best;
}

function fitPositionOptimizedCircle(points, property, typicalRadius) {
  if (!points.length) {
    return null;
  }

  const enclosingCircle = fitCircleFromPoints(points);
  const leastSquaresCircle = fitLeastSquaresCircle(points) || enclosingCircle;
  const boundaryPoints = getRobustCircleBoundaryPoints(
    points,
    leastSquaresCircle,
    typicalRadius
  );
  const refinedSeed = fitLeastSquaresCircle(boundaryPoints) || leastSquaresCircle;
  const optimizedCircle =
    optimizeCircleCenterForPoints(
      boundaryPoints,
      refinedSeed,
      property,
      typicalRadius
    ) || enclosingCircle;

  if (!optimizedCircle) {
    return null;
  }

  return {
    ...optimizedCircle,
    radius: optimizedCircle.radius + 0.75,
    boundarySupport: boundaryPoints.length,
    totalBoundaryPoints: points.length,
  };
}

function calculateContourComponentProperties(image, minArea, maxArea, options = {}) {
  const minAreaScale = options.minAreaScale || 0.08;
  const maxAreaScale = options.maxAreaScale || 2.6;
  const maxAspectRatio = options.maxAspectRatio || 3.2;
  const minFillRatio = options.minFillRatio || 0.04;
  const source = image.clone();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const properties = [];

  cv.findContours(
    source,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE
  );

  for (let index = 0; index < contours.size(); index++) {
    const contour = contours.get(index);
    const area = cv.contourArea(contour);
    const scaledArea = area * 4;

    if (scaledArea < minArea * minAreaScale || scaledArea > maxArea * maxAreaScale) {
      contour.delete();
      continue;
    }

    const rect = cv.boundingRect(contour);
    const aspectRatio = Math.max(
      rect.width / Math.max(rect.height, 1),
      rect.height / Math.max(rect.width, 1)
    );
    const fillRatio = area / Math.max(rect.width * rect.height, 1);

    if (aspectRatio > maxAspectRatio || fillRatio < minFillRatio) {
      contour.delete();
      continue;
    }

    const points = getContourPoints(contour);
    const circle = fitCircleFromPoints(points);
    const moments = cv.moments(contour);
    const x =
      Math.abs(moments.m00) > 1e-9
        ? moments.m10 / moments.m00
        : rect.x + rect.width / 2;
    const y =
      Math.abs(moments.m00) > 1e-9
        ? moments.m01 / moments.m00
        : rect.y + rect.height / 2;

    if (circle) {
      properties.push({
        x,
        y,
        area,
        radius: circle.radius,
        aspectRatio,
        fillRatio,
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        centerX: rect.x + rect.width / 2,
        centerY: rect.y + rect.height / 2,
        enclosingCircle: circle,
        points,
      });
    }

    contour.delete();
  }

  source.delete();
  contours.delete();
  hierarchy.delete();

  return properties;
}

function getRescueProperties(candidateProperties, existingProperties, options = {}) {
  const existing = sanitizeCoreProperties(existingProperties);
  const typicalRadius = getDetectionMedianRadius(
    existing,
    options.fallbackRadius
  );
  const duplicateThreshold = Math.max(
    typicalRadius * (options.duplicateRadiusRatio || 0.95),
    3
  );
  const radiusFloor = typicalRadius * (options.minRadiusRatio || 0.42);
  const radiusCeiling = typicalRadius * (options.maxRadiusRatio || 1.95);
  const componentPadding = typicalRadius * 0.25;

  return sanitizeCoreProperties(candidateProperties)
    .filter((property) => {
      if (property.radius < radiusFloor || property.radius > radiusCeiling) {
        return false;
      }

      if (isDuplicateDetection(property, existing, duplicateThreshold)) {
        return false;
      }

      if (
        options.rejectComponentsWithExisting === true &&
        componentHasExistingDetection(property, existing, componentPadding)
      ) {
        return false;
      }

      if (
        options.rejectBridgeCandidates === true &&
        isLikelyBridgeBetweenExistingCores(property, existing, typicalRadius)
      ) {
        return false;
      }

      return true;
    })
    .map((property) => {
      const radius = typicalRadius || property.radius;
      return {
        x: property.x,
        y: property.y,
        radius,
        area: radius * radius * Math.PI,
        detectionMethod: options.method || "fast-rescue",
        confidence: options.confidence || 0.58,
      };
    });
}

function getPropertiesInsideComponent(component, properties, padding = 0) {
  return sanitizeCoreProperties(properties).filter((property) =>
    isPointInsideComponent(property, component, padding)
  );
}

function getComponentDistanceToPoint(component, point) {
  const right = component.left + component.width;
  const bottom = component.top + component.height;
  const dx = Math.max(component.left - point.x, 0, point.x - right);
  const dy = Math.max(component.top - point.y, 0, point.y - bottom);
  return Math.hypot(dx, dy);
}

function getComponentEnvelope(components) {
  if (!components.length) {
    return null;
  }

  const left = Math.min(...components.map((component) => component.left));
  const top = Math.min(...components.map((component) => component.top));
  const right = Math.max(
    ...components.map((component) => component.left + component.width)
  );
  const bottom = Math.max(
    ...components.map((component) => component.top + component.height)
  );
  const width = right - left;
  const height = bottom - top;
  const area = components.reduce((sum, component) => sum + component.area, 0);
  const aspectRatio = Math.max(
    width / Math.max(height, 1),
    height / Math.max(width, 1)
  );

  return {
    left,
    top,
    width,
    height,
    area,
    aspectRatio,
    fillRatio: area / Math.max(width * height, 1),
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function getFragmentEnvelopeForDamagedCore(
  property,
  existingProperties,
  fragmentProperties,
  typicalRadius,
  typicalSpacing
) {
  const searchDistance = Math.max(typicalRadius * 1.8, typicalSpacing * 0.48);
  const nearbyFragments = fragmentProperties
    .map((component) => ({
      component,
      distance: getComponentDistanceToPoint(component, property),
    }))
    .filter(({ distance }) => distance <= searchDistance)
    .sort((a, b) => a.distance - b.distance);
  const maxEnvelopeSize = typicalSpacing * 0.95;

  const containingFragments = nearbyFragments
    .map(({ component }) => component)
    .filter((component) =>
      isPointInsideComponent(property, component, typicalRadius * 0.35)
    );

  if (containingFragments.length === 0) {
    return null;
  }

  const selectedFragments = [...containingFragments];
  nearbyFragments.forEach(({ component }) => {
    if (selectedFragments.includes(component)) {
      return;
    }

    const candidateEnvelope = getComponentEnvelope([
      ...selectedFragments,
      component,
    ]);
    const maxDimension = Math.max(
      candidateEnvelope.width,
      candidateEnvelope.height
    );

    if (
      maxDimension <= maxEnvelopeSize &&
      candidateEnvelope.aspectRatio <= 2.05
    ) {
      selectedFragments.push(component);
    }
  });

  const envelope = getComponentEnvelope(selectedFragments);
  if (!envelope) {
    return null;
  }

  const propertiesInEnvelope = getPropertiesInsideComponent(
    envelope,
    existingProperties,
    typicalRadius * 0.25
  );

  if (propertiesInEnvelope.length !== 1) {
    return null;
  }

  return envelope;
}

function recenterDamagedSingleCoreDetections(
  properties,
  maskProperties,
  fragmentProperties,
  typicalRadius
) {
  const existingProperties = sanitizeCoreProperties(properties);
  const typicalSpacing = getTypicalCoreSpacing(existingProperties, typicalRadius);
  const minEnvelopeSize = typicalRadius * 1.35;
  const maxEnvelopeSize = typicalSpacing * 0.95;
  const centerOffsetThreshold = Math.max(typicalRadius * 0.45, typicalSpacing * 0.08);
  let recenteredCount = 0;

  const adjustedProperties = existingProperties.map((property) => {
    const singleComponent = maskProperties.find((candidateComponent) => {
      const propertiesInComponent = getPropertiesInsideComponent(
        candidateComponent,
        existingProperties,
        typicalRadius * 0.3
      );

      return (
        propertiesInComponent.length === 1 &&
        isPointInsideComponent(property, candidateComponent, typicalRadius * 0.3)
      );
    });
    const fragmentEnvelope = getFragmentEnvelopeForDamagedCore(
      property,
      existingProperties,
      fragmentProperties,
      typicalRadius,
      typicalSpacing
    );
    const component = fragmentEnvelope || singleComponent;

    if (!component) {
      return property;
    }

    const minDimension = Math.min(component.width, component.height);
    const maxDimension = Math.max(component.width, component.height);
    if (
      minDimension < minEnvelopeSize ||
      maxDimension > maxEnvelopeSize ||
      component.aspectRatio > 1.9
    ) {
      return property;
    }

    const envelopeCenter = {
      x: component.centerX,
      y: component.centerY,
    };
    const centerOffset = getCoreDistance(property, envelopeCenter);
    if (centerOffset < centerOffsetThreshold) {
      return property;
    }

    const support = getExpectedAxisSupport(
      envelopeCenter,
      existingProperties,
      typicalRadius,
      typicalSpacing
    );
    const hasGridSupport = support.rowSupport > 0 || support.colSupport > 0;
    const hasDamagedEnvelope =
      component.fillRatio < 0.66 || centerOffset > typicalRadius * 0.65;

    if (!hasDamagedEnvelope && !hasGridSupport) {
      return property;
    }

    recenteredCount += 1;
    return {
      ...property,
      x: envelopeCenter.x,
      y: envelopeCenter.y,
      centerAdjusted: true,
      centerAdjustmentMethod: "single-core-envelope",
      confidence: Number.isFinite(property.confidence)
        ? Math.min(property.confidence, 0.92)
        : 0.86,
    };
  });

  return {
    properties: adjustedProperties,
    recenteredCount,
  };
}

function getMergedComponentSplit(properties, maskProperties, typicalRadius) {
  const existingProperties = sanitizeCoreProperties(properties);
  const typicalSpacing = getTypicalCoreSpacing(existingProperties, typicalRadius);
  const typicalArea = Math.PI * typicalRadius * typicalRadius;
  const splitProperties = [];
  const replacedProperties = new Set();

  maskProperties.forEach((component) => {
    const existingInComponent = getPropertiesInsideComponent(
      component,
      existingProperties,
      typicalRadius * 0.2
    );

    if (existingInComponent.length !== 1) {
      return;
    }

    const areaUnits = component.area / Math.max(typicalArea, 1);
    const widthUnits = component.width / Math.max(typicalSpacing, 1);
    const heightUnits = component.height / Math.max(typicalSpacing, 1);
    const elongated = component.aspectRatio >= 1.35;
    const largeEnough = areaUnits >= 1.55 || widthUnits >= 1.25 || heightUnits >= 1.25;

    if (!largeEnough || (!elongated && areaUnits < 1.85)) {
      return;
    }

    const splitCount = clampNumber(
      Math.round(Math.max(areaUnits, widthUnits, heightUnits)),
      2,
      3
    );

    if (splitCount <= existingInComponent.length) {
      return;
    }

    const splitHorizontally = component.width >= component.height;
    const componentIsTooWide =
      component.width > typicalSpacing * 3.5 ||
      component.height > typicalSpacing * 3.5;

    if (componentIsTooWide) {
      return;
    }

    existingInComponent.forEach((property) => replacedProperties.add(property));

    for (let index = 0; index < splitCount; index++) {
      const fraction = (index + 0.5) / splitCount;
      const x = splitHorizontally
        ? component.left + component.width * fraction
        : component.x;
      const y = splitHorizontally
        ? component.y
        : component.top + component.height * fraction;

      splitProperties.push({
        x,
        y,
        radius: typicalRadius,
        area: typicalRadius * typicalRadius * Math.PI,
        detectionMethod: "merged-component-split",
        confidence: 0.74,
      });
    }
  });

  return {
    splitProperties,
    propertiesToKeep: existingProperties.filter(
      (property) => !replacedProperties.has(property)
    ),
    splitCount: splitProperties.length,
  };
}

function clusterCoordinateValues(properties, key, tolerance) {
  const sortedValues = sanitizeCoreProperties(properties)
    .map((property) => property[key])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const clusters = [];

  sortedValues.forEach((value) => {
    const currentCluster = clusters[clusters.length - 1];
    if (
      currentCluster &&
      Math.abs(value - currentCluster.values[currentCluster.values.length - 1]) <= tolerance
    ) {
      currentCluster.values.push(value);
      return;
    }

    clusters.push({ values: [value] });
  });

  return clusters.map((cluster) => ({
    value: calculateMedianNumber(cluster.values),
    support: cluster.values.length,
  }));
}

function getMaskEvidenceAtPoint(mask, x, y, radius) {
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(mask.cols - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(mask.rows - 1, Math.ceil(y + radius));
  let foregroundPixels = 0;
  let sampledPixels = 0;
  const radiusSquared = radius * radius;

  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      const dx = col - x;
      const dy = row - y;

      if (dx * dx + dy * dy > radiusSquared) {
        continue;
      }

      sampledPixels += 1;
      if (mask.ucharPtr(row, col)[0] > 0) {
        foregroundPixels += 1;
      }
    }
  }

  return {
    foregroundPixels,
    sampledPixels,
    ratio: sampledPixels > 0 ? foregroundPixels / sampledPixels : 0,
  };
}

function hasGridNeighborSupport(candidate, existingProperties, typicalRadius, typicalSpacing) {
  const rowTolerance = Math.max(typicalRadius * 0.95, typicalSpacing * 0.28);
  const colTolerance = rowTolerance;
  const minGap = typicalRadius * 1.2;
  const maxGap = typicalSpacing * 1.7;
  let rowNeighborCount = 0;
  let colNeighborCount = 0;

  existingProperties.forEach((property) => {
    const dx = Math.abs(property.x - candidate.x);
    const dy = Math.abs(property.y - candidate.y);

    if (dy <= rowTolerance && dx >= minGap && dx <= maxGap) {
      rowNeighborCount += 1;
    }

    if (dx <= colTolerance && dy >= minGap && dy <= maxGap) {
      colNeighborCount += 1;
    }
  });

  return rowNeighborCount >= 1 && colNeighborCount >= 1;
}

function getExpectedAxisSupport(property, properties, typicalRadius, typicalSpacing) {
  const axisTolerance = Math.max(typicalRadius * 0.75, typicalSpacing * 0.18);
  const minExpectedGap = Math.max(typicalRadius * 1.35, typicalSpacing * 0.55);
  const maxExpectedGap = typicalSpacing * 1.45;
  let rowSupport = 0;
  let colSupport = 0;

  properties.forEach((candidate) => {
    if (candidate === property) {
      return;
    }

    const dx = Math.abs(candidate.x - property.x);
    const dy = Math.abs(candidate.y - property.y);

    if (dy <= axisTolerance && dx >= minExpectedGap && dx <= maxExpectedGap) {
      rowSupport += 1;
    }

    if (dx <= axisTolerance && dy >= minExpectedGap && dy <= maxExpectedGap) {
      colSupport += 1;
    }
  });

  return { rowSupport, colSupport };
}

function getBetweenCloseNeighborPair(property, properties, typicalRadius, typicalSpacing) {
  const closeNeighborDistance = Math.max(typicalRadius * 2.2, typicalSpacing * 0.72);
  const minPairDistance = Math.max(typicalRadius * 1.55, typicalSpacing * 0.45);
  const maxPairDistance = typicalSpacing * 1.35;
  const midpointTolerance = Math.max(typicalRadius * 0.75, typicalSpacing * 0.18);
  const closeNeighbors = properties
    .filter((candidate) => candidate !== property)
    .map((candidate) => ({
      property: candidate,
      distance: getCoreDistance(property, candidate),
      dx: candidate.x - property.x,
      dy: candidate.y - property.y,
    }))
    .filter(({ distance }) => distance > 0 && distance <= closeNeighborDistance);

  for (let firstIndex = 0; firstIndex < closeNeighbors.length; firstIndex++) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < closeNeighbors.length;
      secondIndex++
    ) {
      const first = closeNeighbors[firstIndex];
      const second = closeNeighbors[secondIndex];
      const dotProduct =
        (first.dx * second.dx + first.dy * second.dy) /
        Math.max(first.distance * second.distance, 1);

      if (dotProduct > -0.62) {
        continue;
      }

      const pairDistance = getCoreDistance(first.property, second.property);
      if (pairDistance < minPairDistance || pairDistance > maxPairDistance) {
        continue;
      }

      const midpoint = {
        x: (first.property.x + second.property.x) / 2,
        y: (first.property.y + second.property.y) / 2,
      };

      if (getCoreDistance(property, midpoint) > midpointTolerance) {
        continue;
      }

      return {
        orientation:
          Math.abs(first.property.x - second.property.x) >=
          Math.abs(first.property.y - second.property.y)
            ? "horizontal"
            : "vertical",
      };
    }
  }

  return null;
}

function filterCrowdedBridgeArtifacts(properties, typicalRadius) {
  const sanitizedProperties = sanitizeCoreProperties(properties);
  if (sanitizedProperties.length < 3) {
    return sanitizedProperties;
  }

  const typicalSpacing = getTypicalCoreSpacing(sanitizedProperties, typicalRadius);

  return sanitizedProperties.filter((property) => {
    const bridgePair = getBetweenCloseNeighborPair(
      property,
      sanitizedProperties,
      typicalRadius,
      typicalSpacing
    );

    if (!bridgePair) {
      return true;
    }

    const support = getExpectedAxisSupport(
      property,
      sanitizedProperties,
      typicalRadius,
      typicalSpacing
    );
    const perpendicularSupport =
      bridgePair.orientation === "horizontal"
        ? support.colSupport
        : support.rowSupport;

    return perpendicularSupport > 0;
  });
}

function getGridMaskRescueProperties(mask, existingProperties, typicalRadius) {
  const existing = sanitizeCoreProperties(existingProperties);
  if (existing.length < 12) {
    return [];
  }

  const typicalSpacing = getTypicalCoreSpacing(existing, typicalRadius);
  const clusterTolerance = Math.max(typicalRadius * 0.85, typicalSpacing * 0.25);
  const rows = clusterCoordinateValues(existing, "y", clusterTolerance).filter(
    (row) => row.support >= 4
  );
  const cols = clusterCoordinateValues(existing, "x", clusterTolerance).filter(
    (col) => col.support >= 3
  );
  const rescues = [];
  const duplicateThreshold = Math.max(typicalRadius * 1.2, 4);

  rows.forEach((row) => {
    cols.forEach((col) => {
      const candidate = {
        x: col.value,
        y: row.value,
        radius: typicalRadius,
        area: typicalRadius * typicalRadius * Math.PI,
      };

      if (
        isDuplicateDetection(candidate, existing, duplicateThreshold) ||
        isDuplicateDetection(candidate, rescues, duplicateThreshold)
      ) {
        return;
      }

      if (!hasGridNeighborSupport(candidate, existing, typicalRadius, typicalSpacing)) {
        return;
      }

      const evidence = getMaskEvidenceAtPoint(mask, candidate.x, candidate.y, typicalRadius * 1.05);
      if (evidence.ratio < 0.18 || evidence.foregroundPixels < typicalRadius * typicalRadius * 0.45) {
        return;
      }

      rescues.push({
        ...candidate,
        detectionMethod: "grid-mask-rescue",
        confidence: clampNumber(0.48 + evidence.ratio * 0.45, 0.5, 0.82),
        maskEvidence: Number(evidence.ratio.toFixed(3)),
      });
    });
  });

  return rescues;
}

function getCircleCandidateComponents(
  property,
  contourComponents,
  existingProperties,
  typicalRadius,
  typicalSpacing
) {
  const searchDistance = Math.max(typicalRadius * 1.65, typicalSpacing * 0.42);
  const maxEnvelopeDimension = Math.max(typicalRadius * 2.8, typicalSpacing * 0.92);
  const minComponentArea = Math.max(4, typicalRadius * typicalRadius * 0.012);
  const candidates = contourComponents
    .map((component) => ({
      component,
      distance: getComponentDistanceToPoint(component, property),
    }))
    .filter(
      ({ component, distance }) =>
        component.area >= minComponentArea &&
        distance <= searchDistance &&
        component.points?.length
    )
    .sort((a, b) => a.distance - b.distance);

  const anchors = candidates.filter(
    ({ component, distance }) =>
      distance <= typicalRadius * 0.6 ||
      isPointInsideComponent(property, component, typicalRadius * 0.35)
  );

  if (!anchors.length) {
    return [];
  }

  const selectedComponents = [];
  const otherProperties = existingProperties.filter(
    (existingProperty) => existingProperty !== property
  );

  candidates.forEach(({ component }) => {
    const shouldSeed = anchors.some((anchor) => anchor.component === component);
    if (!shouldSeed && selectedComponents.length === 0) {
      return;
    }

    const envelope = getComponentEnvelope([...selectedComponents, component]);
    if (!envelope) {
      return;
    }

    const maxDimension = Math.max(envelope.width, envelope.height);
    const overlapsOtherCore = otherProperties.some((otherProperty) =>
      isPointInsideComponent(otherProperty, envelope, typicalRadius * 0.15)
    );

    if (
      maxDimension <= maxEnvelopeDimension &&
      envelope.aspectRatio <= 2.8 &&
      !overlapsOtherCore
    ) {
      selectedComponents.push(component);
    }
  });

  return selectedComponents;
}

function fitCircleForComponents(components, property, typicalRadius) {
  const points = components.flatMap((component) => component.points || []);
  return fitPositionOptimizedCircle(points, property, typicalRadius);
}

function shouldUseOptimizedCircle(circle, property, typicalRadius, typicalSpacing) {
  if (!circle || !Number.isFinite(circle.radius) || circle.radius <= 0) {
    return false;
  }

  const minimumRadius = Math.max(2, typicalRadius * 0.22);
  const maximumRadius = Math.max(typicalRadius * 2.35, typicalSpacing * 0.62);
  const maximumCenterShift = Math.max(typicalRadius * 1.2, typicalSpacing * 0.34);
  const centerShift = getCoreDistance(property, circle);

  return (
    circle.radius >= minimumRadius &&
    circle.radius <= maximumRadius &&
    centerShift <= maximumCenterShift
  );
}

function optimizeCoreCirclesAgainstMask(properties, contourComponents, typicalRadius) {
  const existingProperties = sanitizeCoreProperties(properties);

  if (!contourComponents.length || !existingProperties.length) {
    return {
      properties: existingProperties,
      adjustedCount: 0,
    };
  }

  const typicalSpacing = getTypicalCoreSpacing(existingProperties, typicalRadius);
  let adjustedCount = 0;

  const optimizedProperties = existingProperties.map((property) => {
    const components = getCircleCandidateComponents(
      property,
      contourComponents,
      existingProperties,
      typicalRadius,
      typicalSpacing
    );
    const fittedCircle = fitCircleForComponents(
      components,
      property,
      typicalRadius
    );

    if (
      !shouldUseOptimizedCircle(
        fittedCircle,
        property,
        typicalRadius,
        typicalSpacing
      )
    ) {
      return property;
    }

    const radius = fittedCircle.radius;
    const moved =
      getCoreDistance(property, fittedCircle) > 0.5 ||
      Math.abs(property.radius - radius) > 0.5;

    if (moved) {
      adjustedCount += 1;
    }

    return {
      ...property,
      x: fittedCircle.x,
      y: fittedCircle.y,
      radius,
      area: radius * radius * Math.PI,
      circleAdjusted: true,
      circleAdjustmentMethod: "position-optimized-mask-circle",
      circleBoundarySupport: fittedCircle.boundarySupport,
      circleBoundaryPoints: fittedCircle.totalBoundaryPoints,
    };
  });

  return {
    properties: optimizedProperties,
    adjustedCount,
  };
}

function getRelaxedDistanceTransformRescues(
  filledOpening,
  existingProperties,
  minArea,
  maxArea,
  disTransformMultiplier,
  fallbackRadius
) {
  const relaxedMultiplier = clampNumber(
    disTransformMultiplier * 0.72,
    0.18,
    0.85
  );

  if (Math.abs(relaxedMultiplier - disTransformMultiplier) < 0.02) {
    return [];
  }

  const relaxedSureFg = thresholdDistanceTransform(
    filledOpening,
    relaxedMultiplier
  );
  const relaxedProperties = calculateRegionProperties(
    relaxedSureFg,
    Math.max(1, minArea * 0.45),
    maxArea
  );
  const rescues = getRescueProperties(relaxedProperties, existingProperties, {
    fallbackRadius,
    method: "relaxed-distance-rescue",
    confidence: 0.52,
    duplicateRadiusRatio: 1.25,
    minRadiusRatio: 0.35,
    maxRadiusRatio: 1.55,
    rejectBridgeCandidates: true,
  });
  relaxedSureFg.delete();

  return rescues;
}

// Modified segmentationAlgorithm to include watershed and statistics extraction
function segmentationAlgorithm(
  data,
  minArea,
  maxArea,
  disTransformMultiplier = 0.6
) {
  const gray = toGrayscale(data);
  const binary = toBinary(gray);
  const opening = applyOpening(binary);
  const dilated = applyDilation(opening);
  const filledOpening = fillSmallHoles(opening, dilated);
  const sureFg = thresholdDistanceTransform(
    filledOpening,
    disTransformMultiplier
  );

  // Prepare markers and apply watershed
  const markers = prepareMarkers(filledOpening, sureFg);
  const segmented = applyWatershed(data, markers); 

  // Now, you might need to process 'segmented' to extract centroids and areas
  // For example, using connectedComponentsWithStats on the result of watershed to find centroids and areas
  const [medianRadius, waterShedAreas] = calculateMedianRadius(
    segmented,
    minArea,
    maxArea
  ); // This function might need adjustment to work with watershed output

  const centroidsFinal = calculateRegionProperties(sureFg, minArea, maxArea);
  const watershedRadius =
    Number.isFinite(medianRadius) && medianRadius > 1
      ? medianRadius - 1
      : null;

  centroidsFinal.forEach((centroid) => {
    centroid.radius = watershedRadius || centroid.radius;
    centroid.area = centroid.radius * centroid.radius * Math.PI;
    centroid.confidence = 1;
  });

  const maskProperties = calculateMaskComponentProperties(
    filledOpening,
    minArea,
    maxArea
  );
  const fragmentComponentProperties = calculateMaskComponentProperties(
    filledOpening,
    minArea,
    maxArea,
    {
      minAreaScale: 0.12,
      maxAreaScale: 1.45,
      maxAspectRatio: 3.4,
      minFillRatio: 0.08,
    }
  );
  const mergedComponentProperties = calculateMaskComponentProperties(
    filledOpening,
    minArea,
    maxArea,
    {
      maxAreaScale: 3.2,
      maxAspectRatio: 3.2,
      minFillRatio: 0.16,
    }
  );
  const contourComponentProperties = calculateContourComponentProperties(
    filledOpening,
    minArea,
    maxArea
  );
  const maskRescues = getRescueProperties(maskProperties, centroidsFinal, {
    fallbackRadius: watershedRadius,
    method: "mask-component-rescue",
    confidence: 0.56,
    duplicateRadiusRatio: 1.2,
    minRadiusRatio: 0.4,
    maxRadiusRatio: 1.85,
    rejectComponentsWithExisting: true,
  });
  const relaxedRescues = getRelaxedDistanceTransformRescues(
    filledOpening,
    [...centroidsFinal, ...maskRescues],
    minArea,
    maxArea,
    disTransformMultiplier,
    watershedRadius
  );
  const typicalRadius = getDetectionMedianRadius(centroidsFinal, watershedRadius);
  const mergedSplit = getMergedComponentSplit(
    [...centroidsFinal, ...maskRescues, ...relaxedRescues],
    mergedComponentProperties,
    typicalRadius
  );
  const baseProperties = [
    ...mergedSplit.propertiesToKeep,
    ...mergedSplit.splitProperties,
  ];
  const recenteredBase = recenterDamagedSingleCoreDetections(
    baseProperties,
    maskProperties,
    fragmentComponentProperties,
    typicalRadius
  );
  const bridgeFilteredBaseProperties = filterCrowdedBridgeArtifacts(
    recenteredBase.properties,
    typicalRadius
  );
  const gridRescues = getGridMaskRescueProperties(
    filledOpening,
    bridgeFilteredBaseProperties,
    typicalRadius
  );
  const dedupedProperties = dedupeCoreProperties(
    [...bridgeFilteredBaseProperties, ...gridRescues],
    typicalRadius
  );
  const bridgeFilteredProperties = filterCrowdedBridgeArtifacts(
    dedupedProperties,
    typicalRadius
  );
  const finalProperties = filterIsolatedEdgeArtifacts(
    bridgeFilteredProperties,
    filledOpening.cols,
    filledOpening.rows,
    typicalRadius
  );
  const optimizedCircles = optimizeCoreCirclesAgainstMask(
    finalProperties,
    contourComponentProperties,
    typicalRadius
  );
  window.coreDetectionRescueStats = {
    maskRescued: maskRescues.length,
    relaxedRescued: relaxedRescues.length,
    mergedSplit: mergedSplit.splitProperties.length,
    recentered: recenteredBase.recenteredCount,
    gridRescued: gridRescues.length,
    bridgeRemoved:
      recenteredBase.properties.length -
      bridgeFilteredBaseProperties.length +
      dedupedProperties.length -
      bridgeFilteredProperties.length,
    isolatedRemoved: bridgeFilteredProperties.length - finalProperties.length,
    circleAdjusted: optimizedCircles.adjustedCount,
  };

  // Cleanup
  gray.delete();
  binary.delete();
  opening.delete();
  dilated.delete();
  sureFg.delete();
  markers.delete();
  segmented.delete();

  return optimizedCircles.properties;
}

async function preprocessAndPredict(imageElement, model) {
  // Function to crop the image if it's larger than 1024x1024
  function cropImageIfNecessary(imgElement) {
    const maxWidth = 1024;
    const maxHeight = 1024;
    let [cropWidth, cropHeight] = [imgElement.width, imgElement.height];
    let [startX, startY] = [0, 0];

    if (cropWidth > maxWidth || cropHeight > maxHeight) {
      startX = cropWidth > maxWidth ? (cropWidth - maxWidth) / 2 : 0;
      startY = cropHeight > maxHeight ? (cropHeight - maxHeight) / 2 : 0;
      cropWidth = Math.min(cropWidth, maxWidth);
      cropHeight = Math.min(cropHeight, maxHeight);
    }

    const canvasCrop = document.createElement("canvas");
    canvasCrop.width = cropWidth;
    canvasCrop.height = cropHeight;
    const ctxCrop = canvasCrop.getContext("2d");
    ctxCrop.drawImage(
      imgElement,
      startX,
      startY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    return canvasCrop;
  }

  // Function to pad the image to 1024x1024
  function padImageToSize(canvas, targetWidth, targetHeight) {
    const canvasPadded = document.createElement("canvas");
    canvasPadded.width = targetWidth;
    canvasPadded.height = targetHeight;
    const ctxPadded = canvasPadded.getContext("2d");
    ctxPadded.drawImage(canvas, 0, 0, canvas.width, canvas.height);
    return canvasPadded;
  }

  // Function to resize the image to 512x512
  function resizeImage(canvas, targetWidth, targetHeight) {
    const canvasResized = document.createElement("canvas");
    canvasResized.width = targetWidth;
    canvasResized.height = targetHeight;
    const ctxResized = canvasResized.getContext("2d");
    ctxResized.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    return canvasResized;
  }

  // Function to convert canvas to TensorFlow tensor
  function convertCanvasToTensor(canvas) {
    return tf.browser
      .fromPixels(canvas)
      .toFloat()
      .div(tf.scalar(255))
      .expandDims();
  }

  const croppedCanvas = cropImageIfNecessary(imageElement);
  const paddedCanvas = padImageToSize(croppedCanvas, 1024, 1024);
  const resizedCanvas = resizeImage(paddedCanvas, 512, 512);
  const tensor = convertCanvasToTensor(resizedCanvas);

  // Predict the mask from the model
  const predictions = await model.predict(tensor);

  // Dispose of the tensor to free memory
  tensor.dispose();

  return predictions;
}

// Function to apply the threshold to the predictions
function applyThreshold(predictions, threshold) {
  const safeThreshold = Number.isFinite(threshold) ? threshold : 0.5;
  return tf.tidy(() =>
    predictions.greaterEqual(tf.scalar(safeThreshold)).toFloat()
  );
}

function calculateMedianSpacing(points) {
  let distances = [];

  // Get all the distances between points and store them in an array
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      let dx = points[i].x - points[j].x;
      let dy = points[i].y - points[j].y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      distances.push(distance);
    }
  }

  // Sort the distances
  distances.sort((a, b) => a - b);

  // Calculate the median of the distances
  let median;
  const mid = Math.floor(distances.length / 2);

  if (distances.length % 2 === 0) {
    // If even number of distances, median is average of two central numbers
    median = (distances[mid - 1] + distances[mid]) / 2;
  } else {
    // If odd number of distances, median is the middle number
    median = distances[mid];
  }

  return median;
}

function tensorToCvMat(tensor) {
  // Squeeze the tensor to remove dimensions of size 1
  const squeezed = tensor.squeeze();
  const [height, width] = squeezed.shape;
  const data = squeezed.dataSync(); // Get tensor data
  const out = new cv.Mat(height, width, cv.CV_8UC1); // Create a new OpenCV Mat for grayscale image

  // Fill the OpenCV Mat with the tensor data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out.ucharPtr(y, x)[0] = data[y * width + x] * 255;
    }
  }

  // Clean up tensor
  squeezed.dispose();
  let srcMatRgb = new cv.Mat();
  cv.cvtColor(out, srcMatRgb, cv.COLOR_GRAY2RGB);
  out.delete();
  return srcMatRgb;
}

function scaleCorePropertiesToImage(properties, imageElement) {
  const originalWidth = imageElement.width;
  const originalHeight = imageElement.height;
  const scaleX = ((originalWidth / 512) * 1024) / originalWidth;
  const scaleY = ((originalHeight / 512) * 1024) / originalHeight;
  const scaledRadiusMultiplier = Math.sqrt(scaleX * scaleY);

  return sanitizeCoreProperties(properties)
    .map((property) => {
      const radiusPadding = property.circleAdjusted ? 1 : 0.95;
      return {
        ...property,
        x: property.x * scaleX,
        y: property.y * scaleY,
        radius: property.radius * scaledRadiusMultiplier * radiusPadding,
      };
    })
    .map((property) => ({
      ...property,
      area: property.radius * property.radius * Math.PI,
    }))
    .filter(
      (property) =>
        property.x >= 0 &&
        property.y >= 0 &&
        property.x <= originalWidth &&
        property.y <= originalHeight
    );
}

function getPixelAppearanceFeatures(red, green, blue) {
  const channelSum = red + green + blue || 1;
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

  return {
    redNorm: red / channelSum,
    greenNorm: green / channelSum,
    blueNorm: blue / channelSum,
    saturation,
    brightness: (red + green + blue) / 3,
  };
}

function isLikelySlideBackground(feature) {
  return feature.brightness > 232 && feature.saturation < 0.1;
}

function isDigitalAnnotationLikePixel(red, green, blue) {
  const feature = getPixelAppearanceFeatures(red, green, blue);
  const redAnnotation =
    red > 150 && red > green * 1.55 && red > blue * 1.35 && feature.saturation > 0.35;
  const greenAnnotation =
    green > 130 && green > red * 1.35 && green > blue * 1.35 && feature.saturation > 0.35;
  const blueAnnotation =
    blue > 130 && blue > red * 1.35 && blue > green * 1.15 && feature.saturation > 0.32;
  const neutralText = feature.brightness < 135 && feature.saturation < 0.18;

  return redAnnotation || greenAnnotation || blueAnnotation || neutralText;
}

function getCoreAppearanceFeatures(imageData, imageWidth, imageHeight, property) {
  const sampleRadius = clampNumber(property.radius * 0.85, 5, 42);
  const minX = Math.max(0, Math.floor(property.x - sampleRadius));
  const maxX = Math.min(imageWidth - 1, Math.ceil(property.x + sampleRadius));
  const minY = Math.max(0, Math.floor(property.y - sampleRadius));
  const maxY = Math.min(imageHeight - 1, Math.ceil(property.y + sampleRadius));
  const radiusSquared = sampleRadius * sampleRadius;
  const features = [];

  for (let row = minY; row <= maxY; row += 1) {
    for (let col = minX; col <= maxX; col += 1) {
      const dx = col - property.x;
      const dy = row - property.y;

      if (dx * dx + dy * dy > radiusSquared) {
        continue;
      }

      const offset = (row * imageWidth + col) * 4;
      const red = imageData[offset];
      const green = imageData[offset + 1];
      const blue = imageData[offset + 2];
      features.push({
        ...getPixelAppearanceFeatures(red, green, blue),
        annotationLike: isDigitalAnnotationLikePixel(red, green, blue),
      });
    }
  }

  return features;
}

function getAppearanceMedian(features, key) {
  return calculateMedianNumber(features.map((feature) => feature[key])) || 0;
}

function getAppearanceSpread(features, key, center, minimumSpread) {
  const medianAbsoluteDeviation =
    calculateMedianNumber(
      features.map((feature) => Math.abs(feature[key] - center))
    ) || 0;

  return Math.max(medianAbsoluteDeviation * 1.4826, minimumSpread);
}

function summarizeCoreAppearance(imageData, imageWidth, imageHeight, property) {
  const features = getCoreAppearanceFeatures(
    imageData,
    imageWidth,
    imageHeight,
    property
  );
  const informativeFeatures = features.filter(
    (feature) => !isLikelySlideBackground(feature)
  );
  const summaryFeatures =
    informativeFeatures.length >= Math.max(8, features.length * 0.04)
      ? informativeFeatures
      : features;

  return {
    property,
    features,
    summaryFeatures,
    sampledPixels: features.length,
    foregroundRatio: features.length > 0 ? informativeFeatures.length / features.length : 0,
    annotationRatio:
      features.length > 0
        ? features.filter((feature) => feature.annotationLike).length /
          features.length
        : 0,
    redNorm: getAppearanceMedian(summaryFeatures, "redNorm"),
    greenNorm: getAppearanceMedian(summaryFeatures, "greenNorm"),
    blueNorm: getAppearanceMedian(summaryFeatures, "blueNorm"),
    saturation: getAppearanceMedian(summaryFeatures, "saturation"),
    brightness: getAppearanceMedian(summaryFeatures, "brightness"),
  };
}

function getAppearanceDistance(feature, model) {
  const colorDistance =
    Math.abs(feature.redNorm - model.redNorm) / model.redSpread +
    Math.abs(feature.greenNorm - model.greenNorm) / model.greenSpread +
    Math.abs(feature.blueNorm - model.blueNorm) / model.blueSpread;
  const saturationDistance =
    Math.abs(feature.saturation - model.saturation) / model.saturationSpread;

  return colorDistance + saturationDistance * 0.35;
}

function buildAdaptiveTissueAppearanceModel(properties, summaries) {
  const sanitizedProperties = sanitizeCoreProperties(properties);
  if (sanitizedProperties.length < 6) {
    return null;
  }

  const typicalRadius = getDetectionMedianRadius(sanitizedProperties);
  const eligibleSummaries = summaries
    .filter((summary) => {
      const property = summary.property;
      return (
        property.radius >= typicalRadius * 0.45 &&
        property.radius <= typicalRadius * 1.9
      );
    })
    .filter((summary) => summary.sampledPixels > 0);

  if (eligibleSummaries.length < 6) {
    return null;
  }

  const medianForegroundRatio =
    calculateMedianNumber(
      eligibleSummaries.map((summary) => summary.foregroundRatio)
    ) ||
    0;
  const trainingSummaries = eligibleSummaries.filter(
    (summary) =>
      summary.foregroundRatio >= Math.max(0.06, medianForegroundRatio * 0.4)
  );
  const trainingSet =
    trainingSummaries.length >= Math.max(6, eligibleSummaries.length * 0.45)
      ? trainingSummaries
      : eligibleSummaries;
  const redNorm = getAppearanceMedian(trainingSet, "redNorm");
  const greenNorm = getAppearanceMedian(trainingSet, "greenNorm");
  const blueNorm = getAppearanceMedian(trainingSet, "blueNorm");
  const saturation = getAppearanceMedian(trainingSet, "saturation");
  const brightness = getAppearanceMedian(trainingSet, "brightness");

  return {
    redNorm,
    greenNorm,
    blueNorm,
    saturation,
    brightness,
    redSpread: getAppearanceSpread(trainingSet, "redNorm", redNorm, 0.018),
    greenSpread: getAppearanceSpread(trainingSet, "greenNorm", greenNorm, 0.018),
    blueSpread: getAppearanceSpread(trainingSet, "blueNorm", blueNorm, 0.018),
    saturationSpread: getAppearanceSpread(
      trainingSet,
      "saturation",
      saturation,
      0.055
    ),
    foregroundFloor: Math.max(0.045, medianForegroundRatio * 0.22),
    pixelDistanceThreshold: 4.8,
    summaryDistanceThreshold: 4.2,
  };
}

function getAdaptiveTissueEvidence(summary, model) {
  const foregroundFeatures = summary.features.filter(
    (feature) => !isLikelySlideBackground(feature)
  );
  const similarPixels = foregroundFeatures.filter(
    (feature) => getAppearanceDistance(feature, model) <= model.pixelDistanceThreshold
  ).length;
  const summaryDistance = getAppearanceDistance(summary, model);

  return {
    foregroundRatio: summary.foregroundRatio,
    annotationRatio: summary.annotationRatio,
    similarRatio:
      summary.features.length > 0 ? similarPixels / summary.features.length : 0,
    summaryDistance,
  };
}

function filterNonTissueCoreArtifacts(properties, imageElement) {
  const originalWidth = imageElement.width;
  const originalHeight = imageElement.height;
  const canvas = document.createElement("canvas");
  canvas.width = originalWidth;
  canvas.height = originalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return { properties, removedCount: 0 };
  }

  try {
    context.drawImage(imageElement, 0, 0, originalWidth, originalHeight);
    const imageData = context.getImageData(0, 0, originalWidth, originalHeight)
      .data;
    const summaries = properties.map((property) =>
      summarizeCoreAppearance(
        imageData,
        originalWidth,
        originalHeight,
        property
      )
    );
    const appearanceModel = buildAdaptiveTissueAppearanceModel(
      properties,
      summaries
    );

    if (!appearanceModel) {
      return { properties, removedCount: 0 };
    }

    const filteredProperties = summaries.filter((summary) => {
      const evidence = getAdaptiveTissueEvidence(summary, appearanceModel);
      const property = summary.property;
      const minSimilarRatio = property.detectionMethod ? 0.085 : 0.07;
      const appearanceMatches =
        evidence.similarRatio >= minSimilarRatio ||
        evidence.summaryDistance <= appearanceModel.summaryDistanceThreshold;
      const annotationDominated =
        evidence.annotationRatio > 0.18 &&
        evidence.annotationRatio > evidence.similarRatio * 1.35;

      return (
        evidence.foregroundRatio >= appearanceModel.foregroundFloor &&
        appearanceMatches &&
        !(annotationDominated && evidence.similarRatio < minSimilarRatio * 1.4)
      );
    }).map((summary) => summary.property);

    return {
      properties: filteredProperties,
      removedCount: properties.length - filteredProperties.length,
    };
  } catch (error) {
    console.warn("Skipping tissue appearance filter", error);
    return { properties, removedCount: 0 };
  }
}

// Main function to run the full prediction and visualization pipeline
async function runSegmentationAndObtainCoreProperties(
  imageElement,
  model,
  threshold,
  minArea,
  maxArea,
  disTransformMultiplier
) {
  // Preprocess the image and predict
  if (!window.neuralNetworkResult) {
    window.neuralNetworkResult = await preprocessAndPredict(
      imageElement,
      model
    );
  }
  const predictions = window.neuralNetworkResult;
  // Apply the threshold to the predictions
  const thresholdedPredictions = applyThreshold(predictions, threshold);
  // Convert the tensor to a format that OpenCV.js can work with
  const srcMat = tensorToCvMat(thresholdedPredictions);

  // Run the segmentation algorithm to find centers
  const properties = segmentationAlgorithm(
    srcMat,
    minArea,
    maxArea,
    disTransformMultiplier
  );
  const scaledProperties = scaleCorePropertiesToImage(properties, imageElement);
  const tissueFiltered = filterNonTissueCoreArtifacts(
    scaledProperties,
    imageElement
  );
  const finalProperties = tissueFiltered.properties;
  srcMat.delete();

  if (
    window.thresholdedPredictions &&
    window.thresholdedPredictions !== thresholdedPredictions &&
    typeof window.thresholdedPredictions.dispose === "function"
  ) {
    window.thresholdedPredictions.dispose();
  }

  window.coreDetectionRescueStats = {
    ...(window.coreDetectionRescueStats || {}),
    nonTissueRemoved: tissueFiltered.removedCount,
  };
  window.properties = finalProperties;
  window.thresholdedPredictions = thresholdedPredictions;
  window.coreDetectionDiagnostics = {
    mode: "fast",
    total: finalProperties.length,
    rescued: finalProperties.filter((property) => property.detectionMethod)
      .length,
    rescueStats: window.coreDetectionRescueStats || null,
  };

  return [finalProperties, thresholdedPredictions];
}

export {
  loadModel,
  segmentationAlgorithm,
  preprocessAndPredict,
  visualizeSegmentationResults,
  runSegmentationAndObtainCoreProperties,
  loadOpenCV,
};
