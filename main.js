import {
  showRawDataSidebar,
  showVirtualGridSidebar,
  highlightTab,
  showImageSegmentationSidebar,
  updateSliderUIText,
  updateStatusMessage,
  resetApplication,
  makeElementDraggable,
  showPopup,
  closePopup,
  getHyperparametersFromUI,
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

// Call this function to open the default tab
function openDefaultTab() {
  // Get the element with id="defaultOpen" and click on it
  document.getElementById("imageSegmentationTabButton").click();
}

// The openTab function as before
function openTab(evt, tabName) {
  var i, tabcontent, tablinks;
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.className += " active";
}

// When the window loads, open the default tab
window.onload = openDefaultTab;

// Function to switch to the gridding tab
function switchToGridding() {
  closePopup("popupSegmentation");
  document.getElementById("rawDataTabButton").click(); // Activate the gridding tab
  // Deactivate the segmentation tab if needed
}

function switchToVirtualGrid() {
  closePopup("popupGridding");
  document.getElementById("virtualGridTabButton").click(); // Activate the gridding tab
  // Deactivate the segmentation tab if needed
}

// Load dependencies and return updated state
const loadDependencies = async () => ({
  model: await loadModel("./tfjs_model/model.json"),
  // openCVLoaded: await loadOpenCV(),
});

// Pure function to get input values
const getInputValue = (inputId) => document.getElementById(inputId).value;

// Helper functions to abstract operations
const loadImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (event) => resolve(event.target.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const createImageElement = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.src = src;
  img.onload = () => resolve(img);
  img.onerror = reject;
});

const scaleImageIfNeeded = (img) => {
  const scalingFactor = img.width > MAX_DIMENSION_FOR_DOWNSAMPLING || img.height > MAX_DIMENSION_FOR_DOWNSAMPLING
    ? Math.min(MAX_DIMENSION_FOR_DOWNSAMPLING / img.width, MAX_DIMENSION_FOR_DOWNSAMPLING / img.height)
    : 1;

  if (scalingFactor === 1) {
    return { src: img.src, scalingFactor };
  }else{
    window.imageScalingFactor = scalingFactor;

  }

  const canvas = document.createElement('canvas');
  canvas.width = img.width * scalingFactor;
  canvas.height = img.height * scalingFactor;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { src: canvas.toDataURL(), scalingFactor };
};

const updateUIForScaledImage = (src, scalingFactor, imgDimensions) => {
  originalImageContainer.src = src;
  const osdCanvasParent = document.getElementById('osdViewer');
  osdCanvasParent.style.width = `${imgDimensions.width * scalingFactor}px`;
  osdCanvasParent.style.height = `${imgDimensions.height * scalingFactor}px`;
  document.getElementById("loadingSpinner").style.display = "none";
};

const handleSVSFile = async (file, processCallback) => {

  const imageInfo = await getWSIInfo(file);
  scalingFactor = Math.min(
    MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.width,
    MAX_DIMENSION_FOR_DOWNSAMPLING / imageInfo.height
  );

  const wsiThumbnail = await getPNGFromWSI(
    URL.createObjectURL(file),
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

    processCallback();

    window.loadedImg = originalImageContainer;
    document.getElementById("loadingSpinner").style.display = "none";
  };  
};

// Updated handleImageLoad function to support .svs files
const handleImageLoad = (file, processCallback) => {
  resetApplication();
  document.getElementById("imageUrlInput").value = null;
  document.getElementById("loadingSpinner").style.display = "block";

  if (file && file.type.startsWith('image/')) {
    loadImage(file)
      .then(createImageElement)
      .then(img => {
        const { src, scalingFactor } = scaleImageIfNeeded(img);
        originalImageContainer.onload = () => {
          updateStatusMessage('imageLoadStatus', 'Image loaded successfully.', 'success-message');
          processCallback();
          window.loadedImg = originalImageContainer;
          moveToCarouselItem("next");

        };
        originalImageContainer.onerror = () => {
          updateStatusMessage('imageLoadStatus', 'Image failed to load.', 'error-message');
          console.error('Image failed to load.');
        };
        updateUIForScaledImage(src, scalingFactor, { width: img.width, height: img.height });
      })
      .catch(() => {
        updateStatusMessage('imageLoadStatus', 'Image failed to load.', 'error-message');
        console.error('Image failed to load.');
      });
  } else if (file && file.name.endsWith('.svs')) {
    handleSVSFile(file, processCallback);
  } else {
    updateStatusMessage('imageLoadStatus', 'File loaded is not an image.', 'error-message');
    console.error('File loaded is not an image.');
  }

  document.getElementById("loadingSpinner").style.display = "none";
};
// Main event handler, refactored to use functional programming
const handleImageInputChange = async (e, processCallback) => {
  resetApplication();
  document.getElementById("imageUrlInput").value = null;
  document.getElementById("loadingSpinner").style.display = "block";

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
  window.userUploadedMetadata = data;

  updateStatusMessage(
    "metadataLoadStatus",
    "File successfully uploaded and validated.",
    "success-message"
  );
  moveToCarouselItem("next");
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
const handleLoadImageUrlClick = async (state) => {
  resetApplication();
  document.getElementById("fileInput").value = null;
  // Show loading spinner
  document.getElementById("loadingSpinner").style.display = "block";

  const imageUrl = getInputValue("imageUrlInput");

  if (imageUrl) {
    let imageResp = undefined;
    let width, height;
    if (imageUrl.endsWith(".png") || imageUrl.endsWith(".jpg")) {
      imageResp = fetch(imageUrl);
      window.scalingFactor = 1;
    } else {
      const imageInfo = await getWSIInfo(imageUrl);
      width = imageInfo.width;
      height = imageInfo.height;
      const scalingFactor = Math.min(
        MAX_DIMENSION_FOR_DOWNSAMPLING / width,
        MAX_DIMENSION_FOR_DOWNSAMPLING / height
      );
      // Store the scaling factor
      window.scalingFactor = scalingFactor;
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
          throw new Error("Network response was not ok.");
        }
      })
      .then((blob) => {
        let objectURL = URL.createObjectURL(blob);
        originalImageContainer.crossOrigin = "anonymous";

        const img = new Image();
        img.src = objectURL;
        img.onload = async () => {
          // Check if the image needs to be scaled down
          if (
            img.width > MAX_DIMENSION_FOR_DOWNSAMPLING ||
            img.height > MAX_DIMENSION_FOR_DOWNSAMPLING
          ) {
            scalingFactor = Math.min(
              MAX_DIMENSION_FOR_DOWNSAMPLING / img.width,
              MAX_DIMENSION_FOR_DOWNSAMPLING / img.height
            );

            window.imageScalingFactor = scalingFactor;
            // window.scalingFactor = scalingFactor;
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scalingFactor;
            canvas.height = img.height * scalingFactor;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            originalImageContainer.src = canvas.toDataURL();
          } else {
            originalImageContainer.src = img.src;
            scalingFactor = 1;
          }

        }

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
          await segmentImage(true);
          moveToCarouselItem("next");

        };
      })
      .catch((error) => {
        updateStatusMessage(
          "imageLoadStatus",
          "Invalid image URL.",
          "error-message"
        );
        console.error(
          "There has been a problem with your fetch operation: ",
          error
        );
      });
  } else {
    updateStatusMessage("imageLoadStatus", "Invalid Image.", "error-message");
    console.error("Please enter a valid image URL");
  }

  window.imageSource = "URL";
};



async function segmentImage(initializeParams = false) {
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
              0.9,
              minArea,
              maxArea,
              disTransformMultiplier
            );
          document.getElementById("thresholdSlider").value = 0.1;
          document.getElementById("thresholdValue").textContent = 0.1;
          window.preprocessedCores = preprocessCores(preprocessedCores);
        }

        console.log("spacingBetweenCores", spacingBetweenCores);
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

function bindEventListeners() {

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

  // Event listeners for tab buttons
  document
    .getElementById("rawDataTabButton")
    .addEventListener("click", function () {
      showRawDataSidebar();
      highlightTab(this); // This function will highlight the active tab, it's implementation is shown below
    });

  document
    .getElementById("imageSegmentationTabButton")
    .addEventListener("click", function () {
      showImageSegmentationSidebar();
      highlightTab(this); // This function will highlight the active tab, it's implementation is shown below
    });

  document
    .getElementById("virtualGridTabButton")
    .addEventListener("click", function () {
      showVirtualGridSidebar();
      highlightTab(this); // This function will highlight the active tab, it's implementation is shown below
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

      // Update the virtual grid with the new spacing values
      updateVirtualGridSpacing(
        horizontalSpacing,
        verticalSpacing,
        startingX,
        startingY
      );
    });

  document
    .getElementById("saveResults")
    .addEventListener("click", saveUpdatedCores);

  document
    .getElementById("toggle-advanced-settings")
    .addEventListener("click", function () {
      var advancedSettings = document.getElementById("advanced-settings");
      if (advancedSettings.style.display === "none") {
        advancedSettings.style.display = "block";
        this.textContent = "Hide Advanced Settings";
      } else {
        advancedSettings.style.display = "none";
        this.textContent = "Show Advanced Settings";
      }
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

  // makeElementDraggable(document.getElementById("addSidebar"));
  makeElementDraggable(document.getElementById("editSidebar"));

  // Close the sidebar
  document.querySelectorAll(".close-button").forEach((button) => {
    button.addEventListener("click", function () {
      const sidebar = this.closest(".edit-sidebar");
      sidebar.style.display = "none"; // You can toggle visibility or minimize the sidebar as required
      window.viewer.currentOverlays.forEach((o) => {
        o.element.classList.remove("selected");
      });
    });
  });

  document
    .getElementById("metadataFileInput")
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

  document
    .getElementById("rawDataTabButton")
    .addEventListener("click", function (event) {
      openTab(event, "RawData");
    });
  document
    .getElementById("imageSegmentationTabButton")
    .addEventListener("click", function (event) {
      openTab(event, "ImageSegmentation");
    });

  document
    .getElementById("virtualGridTabButton")
    .addEventListener("click", function (event) {
      openTab(event, "VirtualGrid");
    });

  document
    .getElementById("segmentationClosePopupButton")
    .addEventListener("click", function (event) {
      closePopup("popupSegmentation");
    });
  document
    .getElementById("griddingClosePopupButton")
    .addEventListener("click", function (event) {
      closePopup("popupGridding");
    });

  document
    .getElementById("openGriddingButton")
    .addEventListener("click", switchToGridding);
  document
    .getElementById("openVirtualGridButton")
    .addEventListener("click", switchToVirtualGrid);
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
  // document
  //   .getElementById("downloadSegmentationResults")
  //   .addEventListener("click", function () {
  //     // Assuming `properties` is the variable holding your segmentation results
  //     if (!window.properties) {
  //       alert("Algorithm has not run yet!");
  //       return;
  //     }

  //     // Create finalSaveData by mapping over sortedCoresData
  //     const finalSaveData = window.properties.map((core) => {
  //       return {
  //         ...core,
  //         x: core.x / window.scalingFactor,
  //         y: core.y / window.scalingFactor,
  //         radius: core.radius / window.scalingFactor,
  //       };
  //     });

  //     const propertiesJson = JSON.stringify(finalSaveData, null, 2);
  //     const blob = new Blob([propertiesJson], { type: "application/json" });
  //     const url = URL.createObjectURL(blob);
  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = "segmentation-properties.json";
  //     a.click();
  //     URL.revokeObjectURL(url);
  //   });

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
      document.getElementById("rawDataTabButton").disabled = false;

      // Assuming `properties` is the variable holding your segmentation results
      if (!window.properties) {
        alert("No image uploaded!");
        return;
      }
      const getImageInfo = () => {
        const checkExtension = (path) =>
          path.endsWith(".png") ||
          path.endsWith(".jpg") ||
          path.endsWith(".jpeg") ||
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
            imageInfo.url = imageInfo.isSimpleImage
              ? window.loadedImg.src
              : document.getElementById("fileInput").files[0];
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
        }

        return imageInfo;
      };
      document.getElementById("rawDataLoadingSpinner").style.display = "block";
      document.getElementById("rawDataTabButton").click();
      let tileSources = {};

      const imageInfo = getImageInfo();
      if (imageInfo.isSimpleImage) {
        tileSources = {
          type: "image",
          url: imageInfo.url,
        };
      } else {
        tileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(
          imageInfo.url,
          { logLatency: false, cache: true }
        );
      }
      document.getElementById(
        "osdViewer"
      ).style.width = `${window.loadedImg.getAttribute("width")}px`;
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
        // homeFillsViewer: true,
        // defaultZoomLevel: 1,
        // navigationControlAnchor: OpenSeadragon.ControlAnchor["TOP_RIGHT"],
        // debugMode: true,
        // immediateRender: false,
        // imageLoaderLimit: 5,
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
        document.getElementById("rawDataLoadingSpinner").style.display = "none";
        window.viewer.world
          .getItemAt(0)
          .addOnceHandler("fully-loaded-change", () => {
            preprocessForTravelingAlgorithm();
            //     // showPopup("popupSegmentation");
            //     document.getElementById("rawDataTabButton").click();
            //     setTimeout(() => {
            window.viewer.addHandler("canvas-click", (e) => {
              if (e.quick) {
                window.viewer.currentOverlays
                  .filter((overlay) =>
                    overlay.element.classList.contains("selected")
                  )
                  .forEach((selectedOverlay) => {
                    selectedOverlay.element.classList.remove("selected");
                  });
              }
            });
            //       window.viewer.viewport.goHome(true);
            //       setTimeout(preprocessForTravelingAlgorithm, 0)
            //     }, 100)
          });
      });
    });

  // Navigation buttons
  var prevButton = document.querySelector(".carousel-control-prev");
  var nextButton = document.querySelector(".carousel-control-next");

  // Event listener for 'Previous' button
  prevButton.addEventListener("click", function () {
    moveToCarouselItem("prev");
  });

  // Event listener for 'Next' button
  nextButton.addEventListener("click", function () {
    moveToCarouselItem("next");
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

  document
    .getElementById("skipLoadMetadataUrlBtn")
    .addEventListener("click", function () {
      moveToCarouselItem("next");
    });
};


function moveToCarouselItem(direction) {
  var current = document.querySelector(".carousel-item.active");
  var items = document.querySelectorAll(".carousel-item");
  var currentIndex = Array.from(items).indexOf(current);

  if (direction === "next") {
    var nextIndex = (currentIndex + 1) % items.length;
  } else {
    var nextIndex = (currentIndex - 1 + items.length) % items.length;
  }

  if (current) {
    current.classList.remove("active");
  }
  items[nextIndex].classList.add("active");
}
function addDragAndDrop() {
  var dropzones = document.querySelectorAll(".file-dropzone");

  dropzones.forEach(function(dropzone) {
    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.borderColor = "green";
    });

    dropzone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.borderColor = "#ccc";
    });

    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.borderColor = "#ccc";

      var files = e.dataTransfer.files;

      if (files.length > 1) {
        alert("Please drop only one file.");
        return;
      }

      if (files.length === 1) {
        // Simulate the file input selection
        var fileInput = document.getElementById(dropzone.getAttribute('for'));
        var dataTransfer = new DataTransfer();
        dataTransfer.items.add(files[0]);
        fileInput.files = dataTransfer.files;

        // Manually trigger the change event on the input
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}



// Main function that runs the application
const run = async () => {
  addDragAndDrop();
  bindEventListeners();
  // Run the app
  initSegmentation();
};

run();
