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
        // debugger
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
  return;

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
// function segmentationAlgorithm(
//   data,
//   minArea,
//   maxArea,
//   disTransformMultiplier = 0.6
// ) {
//   // Convert to grayscale if the image is not already
//   let gray = new cv.Mat();
//   if (data.channels() === 3 || data.channels() === 4) {
//     cv.cvtColor(data, gray, cv.COLOR_RGBA2GRAY, 0);
//   } else {
//     gray = src.clone();
//   }

//   // Convert to binary image using the closed image
//   let binary = new cv.Mat();
//   cv.threshold(gray, binary, 0, 255, cv.THRESH_BINAR_INV | cv.THRESH_OTSU);

//   // Noise removal with opening
//   let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
//   let opening = new cv.Mat();
//   cv.morphologyEx(
//     binary,
//     opening,
//     cv.MORPH_OPEN,
//     kernel,
//     new cv.Point(-1, -1),
//     3
//   );

//   // Use morphological closing to fill the gaps
//   let kernelCLose = cv.Mat.ones(3, 3, cv.CV_8U);
//   let closing = new cv.Mat();
//   cv.morphologyEx(opening, closing, cv.MORPH_CLOSE, kernelCLose, new cv.Point(-1, -1), 1);

//   // Sure background area
//   let sureBg = new cv.Mat();
//   cv.dilate(closing, sureBg, kernel, new cv.Point(-1, -1), 3);

//   // Finding sure foreground area
//   let distTransform = new cv.Mat();
//   cv.distanceTransform(closing, distTransform, cv.DIST_L2, 5);

//   let sureFg = new cv.Mat();
//   // Then use it in your threshold call
//   let maxVal = getMaxValue(distTransform);

//   // The disTransformMultiplier is a factor that scales the threshold value used to decide which parts of the distance-transformed image are considered sure foreground.
//   // Typically, the maximum value in the distance transform image is identified. This value represents the furthest distance any pixel has from the background.
//   cv.threshold(distTransform, sureFg, disTransformMultiplier * maxVal, 255, 0);

//   // Finding unknown region
//   sureFg.convertTo(sureFg, cv.CV_8U);
//   let unknown = new cv.Mat();
//   cv.subtract(sureBg, sureFg, unknown);

//   // Marker labelling
//   let markers = new cv.Mat();
//   cv.connectedComponents(sureFg, markers);

//   // Add one to all labels so that sure background is not 0, but 1
//   let markersAdjusted = new cv.Mat();
//   cv.add(
//     markers,
//     new cv.Mat(markers.rows, markers.cols, markers.type(), new cv.Scalar(1)),
//     markersAdjusted
//   );

//   // Now, mark the region of unknown with zero
//   for (let i = 0; i < markersAdjusted.rows; i++) {
//     for (let j = 0; j < markersAdjusted.cols; j++) {
//       if (unknown.ucharAt(i, j) === 255) {
//         markersAdjusted.ucharPtr(i, j)[0] = 0;
//       }
//     }
//   }

//   visualizeMarkers(markersAdjusted, "watershedInput07.png");
//   // Watershed algorithm
//   cv.watershed(data, markersAdjusted);
//   visualizeMarkers(markersAdjusted, "watershedResults08.png");

//   visualizeMarkers(gray, "grayScaleInput01.png");
//   if (typeof closing !== 'undefined') visualizeMarkers(closing, "holeClosing03.png");

//   if (typeof closing !== 'undefined') visualizeMarkers(closing, "holeClosing03.png");

//   if (typeof closing !== 'undefined') visualizeMarkers(closing, "holeClosing03.png");

//   visualizeMarkers(opening, "opening02.png");

//   visualizeMarkers(sureBg, "sureBg04.png");

//   visualizeMarkers(sureFg, "sureFg05.png");
//   visualizeMarkers(unknown, "unknown06.png");

//   visualizeMarkers(distTransform, "distTransform04.png");

//   // Calculate properties for each region
//   let properties = calculateCentroids(markersAdjusted, minArea, maxArea);

//   // Cleanup
//   opening.delete();
//   sureBg.delete();
//   distTransform.delete();
//   sureFg.delete();
//   unknown.delete();
//   markers.delete();
//   markersAdjusted.delete();
//   // contours?.delete();
//   // hierarchy?.delete();
//   return properties;
// }

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
  return opening;
};

// Dilate to identify all potential holes
const applyDilation = (opening) => {
  let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  let dilated = new cv.Mat();
  cv.dilate(opening, dilated, kernel, new cv.Point(-1, -1), 1);
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

  visualizeMarkers(holes, "holes03.png");
  // Assuming a threshold calculation step here, similar to the original logic
  let smallHolesMask = cv.Mat.zeros(holes.rows, holes.cols, cv.CV_8UC1);

  // Collect all hole areas
  let areas = [];
  for (let i = 1; i < stats.rows; i++) {
    let area = stats.intAt(i, cv.CC_STAT_AREA);
    areas.push(area);
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

  visualizeMarkers(smallHolesMask, "smallHolesMask04.png");

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
    if (area >= minArea && area <= maxArea) {
      let x = centroids.data64F[i * 2]; // X coordinate
      let y = centroids.data64F[i * 2 + 1]; // Y coordinate
      centroidsFinal.push({ x, y, area });
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

  // Finding unknown region
  sureFg.convertTo(sureFg, cv.CV_8U);

  return sureFg;
}

// Main segmentation function
function segmentationAlgorithm(
  data,
  minArea,
  maxArea,
  disTransformMultiplier = 0.6
) {
  const gray = toGrayscale(data);
  const binary = toBinary(gray);
  const opening = applyOpening(binary);
  visualizeMarkers(opening, "opening03.png");

  const dilated = applyDilation(opening);
  const filledOpening = fillSmallHoles(opening, dilated);
  const sureFg = thresholdDistanceTransform(
    filledOpening,
    disTransformMultiplier
  );
  const centroidsFinal = calculateRegionProperties(sureFg, minArea, maxArea);

  // Visualize each step
  visualizeMarkers(gray, "grayScaleInput01.png");
  visualizeMarkers(binary, "binary02.png");
  visualizeMarkers(filledOpening, "filledOpening05.png");
  visualizeMarkers(sureFg, "sureFg06.png");

  // Cleanup
  gray.delete();
  binary.delete();
  opening.delete();
  dilated.delete();
  // filledOpening.delete(); // Ensure this is correct; may need to adjust based on actual use

  return centroidsFinal;
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
  return predictions.greaterEqual(tf.scalar(threshold)).toFloat();
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
  return srcMatRgb;
}

// Main function to run the full prediction and visualization pipeline
async function runPipeline(
  imageElement,
  model,
  threshold,
  minArea,
  maxArea,
  disTransformMultiplier,
  visualizationContainer,
  maskAlpha = 0.3,
  autoDetermineParameters = true
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

  if (autoDetermineParameters) {
    // const averageSpacing = calculateMedianSpacing(properties);
    // console.log(averageSpacing);
  }
  // debugger;
  // Original image dimensionsƒ
  const originalWidth = imageElement.width;
  const originalHeight = imageElement.height;

  // Scale centroids back to the original image size
  const scaleX = ((originalWidth / 512) * 1024) / originalWidth;
  const scaleY = ((originalHeight / 512) * 1024) / originalHeight;
  for (const prop in properties) {
    properties[prop].x *= scaleX;
    properties[prop].y *= scaleY;
    properties[prop].radius *= Math.sqrt(scaleX * scaleY); // Scale the radius appropriately
  }

  window.properties = Object.values(properties);
  window.thresholdedPredictions = thresholdedPredictions;

  // Visualize the predictions with the mask overlay and centroids
  await visualizeSegmentationResults(
    imageElement,
    thresholdedPredictions,
    properties,
    visualizationContainer,
    maskAlpha
  );
}

export {
  loadModel,
  segmentationAlgorithm,
  preprocessAndPredict,
  visualizeSegmentationResults,
  runPipeline,
  loadOpenCV,
};
