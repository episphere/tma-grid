// Load the model from the web server where the model.json and group1-shard1of1.bin files are located

import * as tf from "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/+esm";

import { visualizeSegmentationResults } from "./drawCanvas.js";

function loadOpenCV() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.min.js";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (cv.getBuildInformation) {
        console.log("OpenCV.js is ready.");
        resolve("OpenCV Loaded");
      } else {
        reject("OpenCV.js is loaded but not ready to use.");
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

function calculateCentroids(markers, minArea, maxArea) {
  let regions = {};

  // Iterate through each pixel in the markers matrix
  for (let i = 0; i < markers.rows; i++) {
    for (let j = 0; j < markers.cols; j++) {
      let label = markers.intPtr(i, j)[0];
      if (label === 0) continue; // Skip the background

      if (!(label in regions)) {
        regions[label] = { xSum: 0, ySum: 0, count: 0 };
      }

      regions[label].xSum += j;
      regions[label].ySum += i;
      regions[label].count += 1;
    }
  }

  let centroids = {};
  for (let label in regions) {
    let region = regions[label];
    let area = region.count;
    if (area >= minArea && area <= maxArea) {
      centroids[label] = {
        x: region.xSum / area,
        y: region.ySum / area,
        radius: Math.sqrt(area / Math.PI), // radius
      };
    }
  }

  return centroids;
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

// https://docs.opencv.org/4.x/d3/db4/tutorial_py_watershed.html
function segmentationAlgorithm(
  data,
  minArea,
  maxArea,
  disTransformMultiplier = 0.6
) {
  // Convert to grayscale if the image is not already
  let gray = new cv.Mat();
  if (data.channels() === 3 || data.channels() === 4) {
    cv.cvtColor(data, gray, cv.COLOR_RGBA2GRAY, 0);
  } else {
    gray = src.clone();
  }

  // Convert to binary image using the closed image
  let binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINAR_INV | cv.THRESH_OTSU);

  // Noise removal with opening
  let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  let opening = new cv.Mat();
  cv.morphologyEx(
    binary,
    opening,
    cv.MORPH_OPEN,
    kernel,
    new cv.Point(-1, -1),
    3
  );

  // Use morphological closing to fill the gaps
  let kernelCLose = cv.Mat.ones(3, 3, cv.CV_8U);
  let closing = new cv.Mat();
  cv.morphologyEx(opening, closing, cv.MORPH_CLOSE, kernelCLose, new cv.Point(-1, -1), 1);

  // // Find contours in the opening image
  // let contours = new cv.MatVector();
  // let hierarchy = new cv.Mat();
  // cv.findContours(opening, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

  // // Filter and fill the contours based on the area
  // for (let i = 0; i < contours.size(); ++i) {
  //   let cnt = contours.get(i);
  //   let area = cv.contourArea(cnt);
  //   if (area > minArea && area < maxArea) {
  //     cv.drawContours(opening, contours, i, new cv.Scalar(255, 255, 255, 255), -1);
  //   }
  // }

  // Sure background area
  let sureBg = new cv.Mat();
  cv.dilate(closing, sureBg, kernel, new cv.Point(-1, -1), 3);

  // Finding sure foreground area
  let distTransform = new cv.Mat();
  cv.distanceTransform(closing, distTransform, cv.DIST_L2, 5);

  let sureFg = new cv.Mat();
  // Then use it in your threshold call
  let maxVal = getMaxValue(distTransform);

  // The disTransformMultiplier is a factor that scales the threshold value used to decide which parts of the distance-transformed image are considered sure foreground.
  // Typically, the maximum value in the distance transform image is identified. This value represents the furthest distance any pixel has from the background.
  cv.threshold(distTransform, sureFg, disTransformMultiplier * maxVal, 255, 0);

  // Finding unknown region
  sureFg.convertTo(sureFg, cv.CV_8U);
  let unknown = new cv.Mat();
  cv.subtract(sureBg, sureFg, unknown);


  // Marker labelling
  let markers = new cv.Mat();
  cv.connectedComponents(sureFg, markers);

  // Add one to all labels so that sure background is not 0, but 1
  let markersAdjusted = new cv.Mat();
  cv.add(
    markers,
    new cv.Mat(markers.rows, markers.cols, markers.type(), new cv.Scalar(1)),
    markersAdjusted
  );

  // Now, mark the region of unknown with zero
  for (let i = 0; i < markersAdjusted.rows; i++) {
    for (let j = 0; j < markersAdjusted.cols; j++) {
      if (unknown.ucharAt(i, j) === 255) {
        markersAdjusted.ucharPtr(i, j)[0] = 0;
      }
    }
  }

  visualizeMarkers(markersAdjusted, "watershedInput07.png");
  // Watershed algorithm
  cv.watershed(data, markersAdjusted);
  visualizeMarkers(markersAdjusted, "watershedResults08.png");

  visualizeMarkers(gray, "grayScaleInput01.png");
  if (typeof closing !== 'undefined') visualizeMarkers(closing, "holeClosing03.png");
  visualizeMarkers(opening, "opening02.png");


  
  visualizeMarkers(sureBg, "sureBg04.png");

  visualizeMarkers(sureFg, "sureFg05.png");
  visualizeMarkers(unknown, "unknown06.png");

  visualizeMarkers(distTransform, "distTransform04.png");

  // Calculate properties for each region
  let properties = calculateCentroids(markersAdjusted, minArea, maxArea);

  // Cleanup
  opening.delete();
  sureBg.delete();
  distTransform.delete();
  sureFg.delete();
  unknown.delete();
  markers.delete();
  markersAdjusted.delete();
  // contours?.delete(); 
  // hierarchy?.delete();
  return properties;
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
  maskAlpha = 0.3
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

  // Original image dimensions
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

// Function to visualize centers
function visualizeCenters(properties, imageElement) {
  // Create a temporary canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Set canvas dimensions to match the image
  canvas.width = imageElement.width;
  canvas.height = imageElement.height;

  // Draw the image onto the canvas
  ctx.drawImage(imageElement, 0, 0, imageElement.width, imageElement.height);

  // Draw a red dot at each center
  Object.values(properties).forEach((prop) => {
    ctx.beginPath();
    ctx.arc(prop.x, prop.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "red";
    ctx.fill();
  });

  // Update the original image element if needed
  imageElement.src = canvas.toDataURL();

  // If you don't need to update the original img element, you could append the canvas to the DOM
  // document.body.appendChild(canvas); // Or append it to another element
}

export {
  loadModel,
  segmentationAlgorithm,
  preprocessAndPredict,
  visualizeSegmentationResults,
  runPipeline,
  visualizeCenters,
  loadOpenCV,
};
