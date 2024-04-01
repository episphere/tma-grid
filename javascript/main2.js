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
} from "./drawCanvas.js";

import {
  loadModel,
  runSegmentationAndObtainCoreProperties,
  visualizeSegmentationResults,
} from "./core_detection.js";

import { getWSIInfo, getPNGFromWSI, getRegionFromWSI } from "./wsi.js";

const MAX_DIMENSION_FOR_DOWNSAMPLING = 1024;

// Initialize image elements
const originalImageContainer = document.getElementById("originalImage");
const processedImageCanvasID = "segmentationResultsCanvas";

// Load dependencies and return updated state
const loadDependencies = async () => ({
  model: await loadModel("./model/model.json"),
  // openCVLoaded: await loadOpenCV(),
});

// Pure function to get input values
const getInputValue = (inputId) => document.getElementById(inputId).value;

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
  const scalingFactor = Math.min(
    MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.width,
    MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.height
  );
  window.scalingFactor = scalingFactor;
  const wsiThumbnail = await getPNGFromWSI(
    file,
    MAX_DIMENSION_FOR_DOWNSAMPLING
  );
  let objectURL = URL.createObjectURL(await wsiThumbnail.blob());

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
    document.getElementById("loadingSpinner").style.display = "none";
  };
};

// Updated handleImageLoad function to support .svs files
const handleImageLoad = (file, processCallback) => {
  document.getElementById("imageUrlInput").value = null;
  document.getElementById("loadingSpinner").style.display = "block";

  if (file && file.type.startsWith("image/")) {
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

    window.uploadedImageFileType = file.type.split("/")[1]
  } else if (file && file.name.endsWith(".svs")) {
    updateImagePreview(
      originalImageContainer.src,
      originalImageContainer.width,
      originalImageContainer.height
    );

    handleSVSFile(file, processCallback);
    window.uploadedImageFileType = "svs";
  } else if (file && file.name.endsWith(".ndpi")) {
    updateImagePreview(
      originalImageContainer.src,
      originalImageContainer.width,
      originalImageContainer.height
    );

    handleSVSFile(file, processCallback);
    window.uploadedImageFileType = "ndpi";
  } 
  else if (file && file.name.endsWith(".tiff")) {
    updateImagePreview(
      originalImageContainer.src,
      originalImageContainer.width,
      originalImageContainer.height
    );

    handleSVSFile(file, processCallback);
    window.uploadedImageFileType = "tiff";
  } else {
    updateStatusMessage(
      "imageLoadStatus",
      "File loaded is not in a supported image format. Supported formats include .svs, .ndpi, .jpg, .jpeg, and .png.",
      "error-message"
    );
    console.error("File loaded is not an image.");
  }
};
// Main event handler, refactored to use functional programming
const handleImageInputChange = async (e, processCallback) => {
  resetApplication();
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
    ƒ;
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

  if (fileType == "csv") {
    window.userUploadedMetadata = [];

    let keys = [];
    data.forEach((row, index) => {
      if (index == 0) {
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
  document.getElementById("fileInput").value = null;
  // Show loading spinner
  document.getElementById("loadingSpinner").style.display = "block";

  // Add a cors proxy to the image URL
  // const corsProxy = "https://corsproxy.io/?";

  // Add the cors proxy to the image URL input

  // $("#imageUrlInput").val(corsProxy + $("#imageUrlInput").val());

  const checkImageType = async (url) => {
    const ac = new AbortController()
    const resp = await fetch(url, {
      'signal': ac.signal
    })
    ac.abort()
    
    const contentType = resp.headers.get("content-type")
    switch (contentType) {
      case 'image/png': 
      case 'image/jpeg':
      case 'image/tiff':
        return contentType.split("/")[1]
      
      case 'application/octet-stream':
        return "svs"
    }
  }

  const imageUrl = getInputValue("imageUrlInput");

  if (imageUrl) {
    let imageResp = undefined;
    let width, height;
    window.uploadedImageFileType = await checkImageType(imageUrl)

    if (window.uploadedImageFileType === "jpeg" || window.uploadedImageFileType === "png") {
      imageResp = fetch(imageUrl);
    } else {
      let imageInfo
      try {
        imageInfo = await getWSIInfo(imageUrl);
      } catch (e) {
        console.error(e)
        alert("Image unsupported! Please try with a different URL.")
        return;
      }
      console.log("imageInfo", imageInfo);
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

      imageResp = getPNGFromWSI(imageUrl, MAX_DIMENSION_FOR_DOWNSAMPLING);
    }

    imageResp
      .then((response) => {
        if (response.ok) {
          return response.blob();
        } else {
          updateStatusMessage(
            "imageLoadStatus",
            "Invalid image URL.",
            "error-message"
          );
          // Hide loading spinner
          document.getElementById("loadingSpinner").style.display = "none";
          throw new Error("Network response was not ok.");
        }
      })
      .then((blob) => {
        let objectURL = URL.createObjectURL(blob);
        originalImageContainer.crossOrigin = "anonymous";

        const img = new Image();
        img.src = objectURL;
        img.onload = async () => {
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

          const osdCanvasParent = document.getElementById("osdViewer");
          osdCanvasParent.style.width = `${Math.ceil(width * scalingFactor)}px`;
          osdCanvasParent.style.height = `${Math.ceil(
            height * scalingFactor
          )}px`;

          window.loadedImg = originalImageContainer;

          updateStatusMessage(
            "imageLoadStatus",
            "Image loaded successfully.",
            "success-message"
          );
          updateImagePreview(
            originalImageContainer.src,
            width * scalingFactor,
            height * scalingFactor
          );
          await segmentImage(true);
        };
      })
      .catch((error) => {
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
      });
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
        const coreRadius = window.preprocessedCores[0].radius;

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
      console.error("Error processing image:", error);
    } finally {
      // Visualize the predictions with the mask overlay and centroids
      await visualizeSegmentationResults(
        originalImageContainer,
        thresholdedPredictions,
        preprocessedCores,
        processedImageCanvasID,
        maskAlpha
      );
      // Hide loading spinner
      document.getElementById("loadingSpinner").style.display = "none";
    }
  }
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
      await ensureValidAccessToken() 
      accessToken = localStorage.accessToken
      refreshToken = localStorage.refreshToken
      accessTokenExpiry = localStorage.accessTokenExpiry
      initializeBoxPicker(localStorage.accessToken)
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
        
        let replaceURLPath = window.location.host.includes("localhost") ? "/" : "/Griddify"
        window.history.replaceState({}, "", `${replaceURLPath}`)
        
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
    extensions: ["png", "jpg", "jpeg", "svs"],
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
      console.log("Selected file is not available for download.");
    }
  });

  filePicker.addListener("cancel", () => {
    console.log("Box file selection was canceled.");
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
      if (window.uploadedImageFileType === "jpeg" || window.uploadedImageFileType === "png" || (window.ndpiScalingFactor)) {
        alert(
          "Full resolution downloads are not supported for .png/jpg images or locally uploaded .ndpi images."
        );
        return;
      }

      downloadAllCores(window.sortedCoresData);
    });

  document.querySelectorAll("input[type='number']").forEach((e) => {
    e.onwheel = (e) => {
      e.preventDefault();
    };
  });

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

      if (window.uploadedImageFileType === "jpeg" || window.uploadedImageFileType === "png") {
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
          path.endsWith(".png") ||
          path.endsWith(".jpg") ||
          path.endsWith(".jpeg") ||
          path.endsWith(".ndpi") ||
          path.endsWith(".tiff") ||
          path.endsWith(".svs");
        const imageInfo = {
          url: "",
          type: "",
          isSimpleImage: undefined,
          isOperable: false,
        };
        if (document.getElementById("fileInput").files[0]) {
          const localFile = document.getElementById("fileInput").files[0];
          if (checkExtension(localFile.name)) {
            imageInfo.type = localFile.name.split(".").slice(-1)[0];
            imageInfo.isSimpleImage = !localFile.name.endsWith(".svs");
            imageInfo.isOperable = true;

            // If the image is an ndpi, pass in the URL used by the originalImage image
            if (localFile.name.endsWith(".ndpi")) {
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
          imageInfo.type = "";
          imageInfo.isSimpleImage =
            url.endsWith(".png") ||
            url.endsWith(".jpg") ||
            url.endsWith(".jpeg");
          imageInfo.isOperable = true;
          imageInfo.url = url;
        } else if (window.boxFileInfo) {
          if (checkExtension(window.boxFileInfo.name)) {
            imageInfo.type = window.boxFileInfo.name.split(".").slice(-1)[0];
            imageInfo.isSimpleImage = !window.boxFileInfo.name.endsWith(".svs");
            imageInfo.isOperable = true;
            imageInfo.url = URL.createObjectURL(window.boxFile);
          }
        }

        return imageInfo;
      };
      document.getElementById("rawDataLoadingSpinner").style.display = "block";

      let tileSources = {};

      const imageInfo = await getImageInfo();
      if (imageInfo.isSimpleImage || (window.uploadedImageFileType === "ndpi" && window.ndpiScalingFactor != undefined)) {
        tileSources = {
          type: "image",
          url: imageInfo.url,
        };
      } else {
        tileSources = (
          await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(
            imageInfo.url,
            {
              logLatency: false,
              cache: true,
              slideOnly: true,
              pool: window.viewer?.world?.getItemAt(0)?.source?._pool,
            }
          )
        )[0];
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
        visibilityRatio: 1,
        minZoomImageRatio: 1,
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
        timeout: 60 * 1000,
      });
      // viewer.open(tileSources)

      const addCoreDiv = document.createElement("div");
      addCoreDiv.className = "osdViewerControlsParent";
      const addCoreBtn = document.createElement("button");
      addCoreBtn.className = "osdViewerControl";
      addCoreBtn.id = "osdViewerAddCoreBtn";
      addCoreBtn.innerText = "+ Add Core";
      addCoreDiv.appendChild(addCoreBtn);

      window.viewer.addControl(
        addCoreDiv,
        {
          anchor: OpenSeadragon.ControlAnchor["TOP_RIGHT"],
        },
        window.viewer.controls.topRight
      );

      window.viewer.addOnceHandler("open", () => {
        window.viewer.world
          .getItemAt(0)
          .addOnceHandler("fully-loaded-change", () => {
            document.getElementById("rawDataLoadingSpinner").style.display =
              "none";

            document.getElementById("rawDataTabButton").disabled = false;
            document.getElementById("rawDataTabButton").click();
            preprocessForTravelingAlgorithm();
          });
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
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    const files = dt.files;
    handleImageLoad(files[0], () => segmentImage(true));
  };
});



async function downloadAllCores(cores) {
  const svsImageURL = document.getElementById("imageUrlInput").value
    ? document.getElementById("imageUrlInput").value
    : document.getElementById("fileInput").files.length > 0
    ? document.getElementById("fileInput").files[0]
    : window.boxFileInfo
    ? URL.createObjectURL(window.boxFile)
    : "path/to/default/image.jpg";

  const JSZip = window.JSZip || require("jszip");
  const zip = new JSZip();

  // Show progress overlay
  const overlay = document.getElementById("progressOverlay");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  overlay.style.display = "flex";
  progressBar.style.width = "0%";
  progressText.innerText = "Starting download...";

  // Function to download a single core
  async function downloadCore(core, index) {
    const topLeftX = parseInt(core.x - core.currentRadius);
    const topLeftY = parseInt(core.y - core.currentRadius);
    const tileWidth = parseInt(core.currentRadius * 2); // Assuming the diameter as the width/height
    const tileHeight = parseInt(core.currentRadius * 2);

    if (window.uploadedImageFileType === "ndpi") {
      const apiURL = `https://imageboxv2-oxxe7c4jbq-uc.a.run.app/iiif/?format=ndpi&iiif=${svsImageURL}/${topLeftX},${topLeftY},${tileWidth},${tileHeight}/${Math.min(tileWidth, 3192)},/0/default.jpg`;

      const response = await fetch(apiURL);
      const blob = await response.blob();
      zip.file(`core_${index}.jpg`, blob);
    } else {
      // Adjust as per your getRegionFromWSI function's implementation
      const fullResTileParams = {
        tileX: topLeftX,
        tileY: topLeftY,
        tileWidth: tileWidth,
        tileHeight: tileHeight,
        tileSize: tileWidth, // or any other logic for tileSize
      };

      const fullSizeImageResp = await getRegionFromWSI(svsImageURL, fullResTileParams);
      const blob = await fullSizeImageResp.blob();
      zip.file(`core_${index}.png`, blob);
    }
  }

  // Function to handle concurrent downloads
  async function handleConcurrentDownloads() {
    const downloadPromises = [];

    for (let index = 0; index < cores.length; index++) {
      if (window.uploadedImageFileType === "ndpi") {
        downloadPromises.push(downloadCore(cores[index], index));

        if (downloadPromises.length === 10 || index === cores.length - 1) {
          await Promise.all(downloadPromises);
          downloadPromises.length = 0; // Reset the array for next batch

          // Update progress for NDPI cores
          const progress = ((index + 1) / cores.length) * 100;
          progressBar.style.width = `${progress}%`;
          progressText.innerText = `Downloading... (${index + 1}/${cores.length})`;
        }
      } else {
        // For SVS, process immediately without batching
        await downloadCore(cores[index], index);
        // Update progress for SVS cores
        const progress = ((index + 1) / cores.length) * 100;
        progressBar.style.width = `${progress}%`;
        progressText.innerText = `Downloading... (${index + 1}/${cores.length})`;
      }
    }
  }

  await handleConcurrentDownloads();

  progressText.innerText = `Finalizing export...`;


  // Generate the zip file
  zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }, // Highest compression
  }).then(function (content) {
    // Use a temporary link to download the zip file
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(content);
    downloadLink.download = "cores.zip";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Hide progress overlay and reset progress bar
    overlay.style.display = "none";
    progressBar.style.width = "0%";
    progressText.innerText = "Download complete!";
  });
}

// Main function that runs the application
const run = async () => {
  bindEventListeners();

  initSegmentation();
};

run();
