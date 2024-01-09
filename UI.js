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
function makeElementDraggable(element) {
  let isDragging = false;
  let initialMouseX, initialMouseY, initialElementX, initialElementY;

  element.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('draggable-area')) {
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
    element.classList.add('dragging');
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (isDragging) {
      // Calculate the distance the mouse has moved
      let dx = e.clientX - initialMouseX;
      let dy = e.clientY - initialMouseY;

      // Set the new position
      element.style.left = `${initialElementX + dx}px`;
      element.style.top = `${initialElementY + dy}px`;
    }
  });

  document.addEventListener('mouseup', function() {
    // Stop dragging
    isDragging = false;
    element.classList.remove('dragging');
  });
}

function positionSidebarNextToCore(event) {
  const sidebar = document.getElementById("editSidebar");
  const container = document.getElementById("main-container"); // Replace with your container ID
  sidebar.style.display = "block";
  // Scroll the sidebar to the top
  sidebar.scrollTop = 0;

  // Get the computed style of the sidebar to access its width and height
  const sidebarStyle = window.getComputedStyle(sidebar);
  const sidebarWidth = parseInt(sidebarStyle.width, 10);
  const sidebarHeight = parseInt(sidebarStyle.height, 10);

  // Get the container's offset from the top-left of the viewport
  const containerRect = container.getBoundingClientRect();

  // Calculate the correct position within the container
  const cursorXWithinContainer = event.clientX - containerRect.left;
  const cursorYWithinContainer = event.clientY - containerRect.top;

  // Position the sidebar at the cursor's location within the container
  // You may want to adjust offsetX and offsetY if you don't want the sidebar to appear directly under the cursor
  const offsetX = 10; // Horizontal offset from the cursor
  const offsetY = 0; // Vertical offset from the cursor

  // Apply the positions with the offsets
  sidebar.style.left = (cursorXWithinContainer + offsetX) + 'px';
  sidebar.style.top = (cursorYWithinContainer + offsetY) + 'px';
}

// Add this function to the mouse event listener for the container
// container.addEventListener('mousemove', positionSidebarAtCursor);



function hideSidebar() {
  const sidebar = document.getElementById("editSidebar");
  sidebar.style.display = "none";
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
  const coreCanvas = document.getElementById("coreCanvas");
  const virtualGridCanvas = document.getElementById("virtualGridCanvas");

  // Clear the image element with the id processedImage
  const segmentationResultsCanvas = document.getElementById(
    "segmentationResultsCanvas"
  );

  const coreCtx = coreCanvas.getContext("2d");
  const virtualCtx = virtualGridCanvas.getContext("2d");
  const segmentationResultsCtx = segmentationResultsCanvas.getContext("2d");

  coreCtx.clearRect(0, 0, coreCanvas.width, coreCanvas.height);
  virtualCtx.clearRect(0, 0, virtualGridCanvas.width, virtualGridCanvas.height);
  segmentationResultsCtx.clearRect(
    0,
    0,
    segmentationResultsCanvas.width,
    segmentationResultsCanvas.height
  );
  segmentationResultsCanvas.height = 0;

  // Reset the data structures that hold the core data
  window.preprocessedCores = [];
  window.sortedCoresData = [];
  window.loadedImg = null;
  window.preprocessingData = null;

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
  makeElementDraggable,
};
