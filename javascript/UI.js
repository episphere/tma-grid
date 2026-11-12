function getHyperparametersFromUI() {
  // Collect hyperparameter values from the UI
  const thresholdMultiplier = parseFloat(
    document.getElementById("thresholdMultiplier").value
  );
  const thresholdAngle = parseFloat(
    document.getElementById("thresholdAngle").value
  );
  const originAngle = parseFloat(document.getElementById("originAngle").value);
  const radiusMultiplier = parseFloat(
    document.getElementById("radiusMultiplier").value
  );

  const minAngle = parseFloat(document.getElementById("minAngle").value);
  const maxAngle = parseFloat(document.getElementById("maxAngle").value);
  const angleStepSize = parseFloat(
    document.getElementById("angleStepSize").value
  );
  const angleThreshold = parseFloat(
    document.getElementById("angleThreshold").value
  );
  const multiplier = parseFloat(document.getElementById("multiplier").value);
  const searchAngle = parseFloat(document.getElementById("searchAngle").value);
  const gamma = parseFloat(document.getElementById("gamma").value);
  const gridWidth = parseFloat(document.getElementById("gridWidth").value);
  const imageWidth = parseFloat(document.getElementById("imageWidth").value);

  return {
    thresholdMultiplier,
    thresholdAngle,
    originAngle,
    radiusMultiplier,
    minAngle,
    maxAngle,
    angleStepSize,
    angleThreshold,
    multiplier,
    searchAngle,
    gamma,
    gridWidth,
    imageWidth,
  };
}

// Function to show the popup
function showPopup(id) {
  document.getElementById(id).style.display = "block";
}

// Function to close the popup
function closePopup(id) {
  document.getElementById(id).style.display = "none";
}

function makeElementDraggable(element) {
  let isDragging = false;
  let initialMouseX, initialMouseY, initialElementX, initialElementY;

  element.addEventListener("mousedown", function (e) {
    if (e.target.classList.contains("draggable-area")) {
      // Prevent any other drag behavior
      e.preventDefault();
      // Store the initial position of the mouse and element
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;

      // Get the computed style of the element
      let computedStyle = window.getComputedStyle(element);
      // Retrieve the left and top values and remove the 'px' to convert to numbers
      initialElementX = parseInt(computedStyle.left, 10);
      initialElementY = parseInt(computedStyle.top, 10);

      // Set dragging to true
      isDragging = true;

      // Add a 'dragging' class for visual feedback
      element.classList.add("dragging");
    }
  });

  document.addEventListener("mousemove", function (e) {
    if (isDragging) {
      // Calculate the distance the mouse has moved
      let dx = e.clientX - initialMouseX;
      let dy = e.clientY - initialMouseY;

      // Set the new position
      element.style.left = `${initialElementX + dx}px`;
      element.style.top = `${initialElementY + dy}px`;
    }
  });

  document.addEventListener("mouseup", function () {
    // Stop dragging
    isDragging = false;
    element.classList.remove("dragging");
  });
}

function positionSidebarNextToCore(event) {
  const sidebar = document.getElementById("editSidebar");
  const container = sidebar.parentElement;
  sidebar.style.display = "block";
  sidebar.scrollTop = 0;
  const containerRect = container.getBoundingClientRect();
  const toolbarHeight = container.querySelector(".image-toolbar")?.offsetHeight || 0;
  sidebar.style.maxHeight = `${Math.max(160, container.clientHeight - toolbarHeight - 24)}px`;
  const maxLeft = Math.max(12, container.clientWidth - sidebar.offsetWidth - 12);
  const minTop = toolbarHeight + 12;
  const maxTop = Math.max(minTop, container.clientHeight - sidebar.offsetHeight - 12);
  sidebar.style.left = `${Math.max(12, Math.min(event.clientX - containerRect.left + 16, maxLeft))}px`;
  sidebar.style.top = `${Math.max(minTop, Math.min(event.clientY - containerRect.top + 8, maxTop))}px`;
  document.getElementById("closeEditCoreButton").focus({ preventScroll: true });
}

// Add this function to the mouse event listener for the container
// container.addEventListener('mousemove', positionSidebarAtCursor);


document
  .getElementById("editIsMarkerInput")
  .addEventListener("change", function () {
    // If the checkbox is checked, disable the column and row input and set the values of editRowInput and editColumnInput to -1

    var editIsMarkerInput = document.getElementById("editIsMarkerInput");
    var rowInput = document.getElementById("editRowInput");
    var columnInput = document.getElementById("editColumnInput");

    if (editIsMarkerInput.checked) {
      rowInput.disabled = true;
      columnInput.disabled = true;
      rowInput.value = -1;
      columnInput.value = -1;



    } else {
      // Otherwise, enable it
      rowInput.disabled = false;
      columnInput.disabled = false;
      // Uncheck the auto assign checkboxes
      document.getElementById("editAutoUpdateRowsCheckbox").checked = false;
      document.getElementById("editAutoUpdateColumnsCheckbox").checked = false;
    }
  });

// Native full-page mode temporarily detaches these nodes from document.body.
// Keep the existing editor state available to selection/close handlers there.
const coreEditForm = document.getElementById("editCoreForm");
const coreEditSidebar = document.getElementById("editSidebar");

function confirmDiscardCoreEdits() {
  const form = coreEditForm;
  if (form.dataset.dirty !== "true") return true;
  if (!window.confirm("Discard unsaved core edits? Choose Cancel to return and select Save.")) return false;
  form.dataset.dirty = "false";
  return true;
}

function hideSidebar() {
  if (!confirmDiscardCoreEdits()) return false;
  const sidebar = coreEditSidebar;
  sidebar.style.display = "none";
  window.viewer?.canvas?.focus({ preventScroll: true });
  return true;
}

// Pure function to update HTML element properties
const updateElementProperty = (element, property, value) => {
  element[property] = value;
};

function updateStatusMessage(elementId, message, statusType) {
  const statusElement = document.getElementById(elementId);
  statusElement.className = `load-status ${statusType}`; // Apply the corresponding class
  statusElement.textContent = message; // Set the text message
}

function updateImagePreview(imageSource, width, height) {
  const imageElement = document.getElementById("previewImage");

  if (!imageElement) {
    return;
  }
  imageElement.src = imageSource;

  imageElement.width = width * 0.25;
  imageElement.height = height * 0.25;


}

// Function to highlight the active tab
function highlightTab(activeTab) {
  // Remove active class from all tabs
  document.querySelectorAll(".tablinks").forEach((tab) => {
    tab.classList.remove("active");
  });
  // Add active class to the clicked tab
  activeTab.classList.add("active");
}

// Function to show raw data sidebar
function showRawDataSidebar() {
  document.getElementById("rawDataSidebar").style.display = "block";
  document.getElementById("imageSegmentationSidebar").style.display = "none";
  document.getElementById("virtualGridSidebar").style.display = "none";
}

// Function to show virtual grid sidebar
function showVirtualGridSidebar() {
  document.getElementById("rawDataSidebar").style.display = "none";
  document.getElementById("imageSegmentationSidebar").style.display = "none";
  document.getElementById("virtualGridSidebar").style.display = "block";
}

// Function to show virtual grid sidebar
function showImageSegmentationSidebar() {
  document.getElementById("rawDataSidebar").style.display = "none";
  document.getElementById("imageSegmentationSidebar").style.display = "block";
  document.getElementById("virtualGridSidebar").style.display = "none";
}

function resetSlidersAndOutputs() {
  // Reset Image Parameters
  document.getElementById("userRadius").value = 20;
  document.getElementById("radiusValue").textContent = "20";

  document.getElementById("xOffset").value = 0;
  document.getElementById("xOffsetValue").textContent = "0";

  document.getElementById("yOffset").value = 0;
  document.getElementById("yOffsetValue").textContent = "0";

  // Reset Traveling Algorithm Parameters
  document.getElementById("originAngle").value = 0;

  document.getElementById("radiusMultiplier").value = 0.7;

  // Assuming the gridWidth is used elsewhere and should be reset to its default
  document.getElementById("gridWidth").value = 70;

  document.getElementById("gamma").value = 60;

  document.getElementById("multiplier").value = 1.5;

  document.getElementById("imageWidth").value = 1024;

  // Assuming the searchAngle is used elsewhere and should be reset to its default
  document.getElementById("searchAngle").value = 360;

  // Reset Edge Detection Parameters
  document.getElementById("thresholdMultiplier").value = 1.5;

  document.getElementById("thresholdAngle").value = 10;

  // Reset Image Rotation Parameters
  document.getElementById("minAngle").value = 0;

  document.getElementById("maxAngle").value = 360;

  document.getElementById("angleStepSize").value = 5;

  document.getElementById("angleThreshold").value = 20;

  // Reset Virtual Grid Configuration
  document.getElementById("horizontalSpacing").value = 50;
  document.getElementById("horizontalSpacingValue").textContent = "50";

  document.getElementById("verticalSpacing").value = 50;
  document.getElementById("verticalSpacingValue").textContent = "50";

  document.getElementById("startingX").value = 50;
  document.getElementById("startingXValue").textContent = "50";

  document.getElementById("startingY").value = 50;
  document.getElementById("startingYValue").textContent = "50";
}
function resetApplication() {
  // Clear the canvases
  // const coreCanvas = document.getElementById("coreCanvas");
  // const coreCanvas = document.getElementById("coreCanvas");

  const virtualGridCanvas = document.getElementById("virtualGridCanvas");

  // Clear the image element with the id processedImage
  const segmentationResultsCanvas = document.getElementById(
    "segmentationResultsCanvas"
  );

  // const coreCtx = coreCanvas.getContext("2d");
  const virtualCtx = virtualGridCanvas.getContext("2d");
  const segmentationResultsCtx = segmentationResultsCanvas.getContext("2d");

  // coreCtx.clearRect(0, 0, coreCanvas.width, coreCanvas.height);
  virtualCtx.clearRect(0, 0, virtualGridCanvas.width, virtualGridCanvas.height);
  segmentationResultsCtx.clearRect(
    0,
    0,
    segmentationResultsCanvas.width,
    segmentationResultsCanvas.height
  );
  segmentationResultsCanvas.height = 0;

  // Disable Segmentation, Gridding and Virtual Grid Tabs:
  document.getElementById("rawDataTabButton").disabled = true;
  document.getElementById("virtualGridTabButton").disabled = true;
  document.getElementById("imageSegmentationTabButton").disabled = true;

  // Reset the previewImage
  updateImagePreview("./icons/Placeholder_view_vector.svg");

  // Reset the data structures that hold the core data
  window.preprocessedCores = [];
  window.sortedCoresData = [];
  window.loadedImg = undefined;
  window.preprocessingData = undefined;
  window.neuralNetworkResult = undefined;
  window.viewer?.destroy();
  window.viewer = undefined;
  window.imageSource = "";
  window.loadedWSIInfo = undefined;
  window.originalImageUrl = undefined;
  window.scalingFactor = 1;
  window.uploadedImageFileType = undefined;
  window.boxFile = undefined;
  window.boxFileInfo = undefined;
  window.finalSaveData = undefined;
  const metadataForm = document.getElementById("editMetadataForm");
  metadataForm.dataset.dirty = "false";
  metadataForm.replaceChildren(document.createTextNode("Select a core in the grid to edit its metadata."));
  document.getElementById("metadataEditStatus").textContent = "";
  document.getElementById("editCoreForm").dataset.dirty = "false";
  document.getElementById("editSidebar").style.display = "none";
  window.ndpiScalingFactor = undefined;
  // Reset sliders and output elements to their default values
  // resetSlidersAndOutputs();
}

// Main function to update visualization
const updateSliderUIText = (state) => {
  updateElementProperty(
    document.getElementById("thresholdValue"),
    "textContent",
    parseFloat(document.getElementById("thresholdSlider").value).toFixed(2)
  );

  updateElementProperty(
    document.getElementById("maskAlphaValue"),
    "textContent",
    parseFloat(document.getElementById("maskAlphaSlider").value).toFixed(2)
  );
};

export {
  getHyperparametersFromUI,
  updateStatusMessage,
  highlightTab,
  showRawDataSidebar,
  showVirtualGridSidebar,
  showImageSegmentationSidebar,
  resetSlidersAndOutputs,
  resetApplication,
  updateSliderUIText,
  positionSidebarNextToCore,
  hideSidebar,
  confirmDiscardCoreEdits,
  makeElementDraggable,
  showPopup,
  closePopup,
  updateImagePreview,
};
