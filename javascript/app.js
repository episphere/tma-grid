function createAppTooltip() {
  let tooltip = document.getElementById("appTooltip");
  if (tooltip) {
    return tooltip;
  }

  tooltip = document.createElement("div");
  tooltip.id = "appTooltip";
  tooltip.className = "app-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  return tooltip;
}

function positionAppTooltip(trigger, tooltip) {
  const margin = 12;
  const viewportPadding = 12;
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const position = trigger.dataset.tooltipPosition || "top";
  let top = triggerRect.top - tooltipRect.height - margin;
  let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

  if (position === "bottom") {
    top = triggerRect.bottom + margin;
  } else if (position === "left") {
    top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    left = triggerRect.left - tooltipRect.width - margin;
  } else if (position === "right") {
    top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    left = triggerRect.right + margin;
  }

  if (top < viewportPadding) {
    top = triggerRect.bottom + margin;
  }

  if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding);
  }

  left = Math.min(
    Math.max(left, viewportPadding),
    window.innerWidth - tooltipRect.width - viewportPadding
  );

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function initializeTooltipSystem() {
  const tooltip = createAppTooltip();
  let activeTrigger = null;
  let previousDescription = null;

  document.querySelectorAll("[title]").forEach((element) => {
    if (!element.dataset.tooltip) {
      element.dataset.tooltip = element.getAttribute("title");
    }
    element.removeAttribute("title");
  });

  const showTooltip = (trigger) => {
    const text = trigger?.dataset?.tooltip;
    if (!text || trigger.disabled) {
      return;
    }

    if (activeTrigger === trigger) {
      positionAppTooltip(trigger, tooltip);
      return;
    }

    if (activeTrigger) {
      hideTooltip();
    }

    activeTrigger = trigger;
    previousDescription = trigger.getAttribute("aria-describedby");
    const describedBy = previousDescription
      ? previousDescription
          .split(/\s+/)
          .filter((id) => id && id !== "appTooltip")
      : [];
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.classList.add("is-visible");
    trigger.setAttribute(
      "aria-describedby",
      [...describedBy, "appTooltip"].join(" ")
    );
    window.requestAnimationFrame(() => positionAppTooltip(trigger, tooltip));
  };

  const hideTooltip = () => {
    if (!activeTrigger) {
      return;
    }

    if (previousDescription) {
      activeTrigger.setAttribute("aria-describedby", previousDescription);
    } else {
      activeTrigger.removeAttribute("aria-describedby");
    }

    activeTrigger = null;
    previousDescription = null;
    tooltip.classList.remove("is-visible");
    tooltip.hidden = true;
  };

  document.addEventListener("mouseover", (event) => {
    const trigger = event.target.closest("[data-tooltip]");
    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("mouseout", (event) => {
    if (activeTrigger && activeTrigger.contains(event.relatedTarget)) {
      return;
    }
    hideTooltip();
  });

  document.addEventListener("focusin", (event) => {
    const trigger = event.target.closest("[data-tooltip]");
    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("focusout", hideTooltip);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip();
    }
  });

  window.addEventListener("scroll", () => {
    if (activeTrigger) {
      positionAppTooltip(activeTrigger, tooltip);
    }
  }, true);

  window.addEventListener("resize", () => {
    if (activeTrigger) {
      positionAppTooltip(activeTrigger, tooltip);
    }
  });
}

function applyTooltip(element, text, options = {}) {
  if (!element || !text) {
    return;
  }

  element.dataset.tooltip = text;
  if (options.position) {
    element.dataset.tooltipPosition = options.position;
  }
}

function applyTooltipToSelector(selector, text, options = {}) {
  document.querySelectorAll(selector).forEach((element) => {
    applyTooltip(element, text, options);
  });
}

function applyControlTooltip(controlId, text, options = {}) {
  const control = document.getElementById(controlId);
  applyTooltip(control, text, options);
  document.querySelectorAll(`label[for="${controlId}"]`).forEach((label) => {
    applyTooltip(label, text, options);
  });
}

function initializeStaticTooltips() {
  applyTooltipToSelector(
    "#helpButton, #helpButtonMobile",
    "Show the instructions for the current workflow step.",
    { position: "bottom" }
  );
  applyTooltipToSelector(
    "#menuBtn",
    "Open or close the site navigation menu.",
    { position: "bottom" }
  );
  applyTooltipToSelector(
    ".close-instructions",
    "Hide these instructions."
  );
  applyTooltipToSelector(
    ".close-button",
    "Close this panel."
  );
  applyTooltipToSelector(
    ".btn-proceed",
    "Continue to the next workflow step when this step is ready."
  );
  applyTooltipToSelector(
    ".btn-back",
    "Return to the previous workflow step."
  );
  applyTooltipToSelector(
    '[data-target="direct-upload"]',
    "Upload an image file from this computer."
  );
  applyTooltipToSelector(
    '[data-target="url-upload"]',
    "Load a tissue image from a direct image URL."
  );
  applyTooltipToSelector(
    '[data-target="box-upload"]',
    "Choose an image from Box after connecting your account."
  );
  applyTooltipToSelector(
    ".browse-button",
    "Choose a local .svs, .ndpi, .tif, .tiff, .png, or .jpg image."
  );
  applyTooltipToSelector(
    "#remove-file",
    "Remove the selected image and reset the upload preview."
  );
  applyTooltipToSelector(
    "#loadSampleImageBtn",
    "Load the built-in demo tissue microarray image."
  );
  applyTooltipToSelector(
    "#loadImageUrlBtn",
    "Load the image from the URL field."
  );
  applyTooltipToSelector(
    "#boxLoginBtn",
    "Connect to Box so you can pick an image stored there."
  );
  applyTooltipToSelector(
    "#useTemplate",
    "Skip uploading a metadata file and use the generated grid metadata."
  );
  applyTooltipToSelector(
    "#metadata-remove-file",
    "Remove the selected metadata file."
  );
  applyControlTooltip(
    "imageUrlInput",
    "Paste a direct URL for a supported image file."
  );
  applyControlTooltip(
    "metadataFile",
    "Optional CSV, JSON, XLS, or XLSX file with row and column metadata to merge into the export."
  );

  applyControlTooltip(
    "segmentationPresetSelect",
    "Choose a starting parameter set for common core layouts and image conditions."
  );
  applyControlTooltip(
    "maskAlphaSlider",
    "Control how strongly the segmentation mask is shown over the image."
  );
  applyControlTooltip(
    "thresholdSlider",
    "Adjust how aggressively the model accepts pixels as tissue core regions."
  );
  applyControlTooltip(
    "minAreaInput",
    "Ignore detected regions smaller than this area."
  );
  applyControlTooltip(
    "maxAreaInput",
    "Ignore detected regions larger than this area."
  );
  applyControlTooltip(
    "disTransformMultiplierInput",
    "Tune how strongly touching cores are separated during segmentation."
  );
  applyTooltipToSelector(
    ".advanced-control-group summary",
    "Show additional segmentation controls for difficult images."
  );
  applyTooltipToSelector(
    "#applySegmentation",
    "Rerun segmentation with the current settings."
  );
  applyTooltipToSelector(
    ".mobile-workspace-controls-toggle",
    "Show or hide the tool controls on smaller screens."
  );
  applyTooltipToSelector(
    "#segmentationSidebarIcon",
    "Show or hide segmentation parameters."
  );
  applyTooltipToSelector(
    '[data-segmentation-mode="add"]',
    "Click the image to add a missing core."
  );
  applyTooltipToSelector(
    '[data-segmentation-mode="remove"]',
    "Click a detected core to remove it."
  );
  applyTooltipToSelector(
    '[data-segmentation-mode="inspect"]',
    "Inspect the segmentation without adding or removing cores."
  );
  applyTooltipToSelector(
    "#segmentationUndoButton",
    "Undo the last manual segmentation edit."
  );
  applyTooltipToSelector(
    "#segmentationRedoButton",
    "Redo the last undone segmentation edit."
  );
  applyTooltipToSelector(
    "#toggleSegmentationMaskButton",
    "Show or hide the segmentation mask overlay."
  );
  applyTooltipToSelector(
    "#finalizeSegmentation",
    "Accept the current segmentation and open the gridding step."
  );

  applyTooltipToSelector(
    "#toggleReviewPanelButton",
    "Open or collapse the list of cores that need review."
  );
  applyTooltipToSelector(
    "#previousIssueButton",
    "Select the previous review issue."
  );
  applyTooltipToSelector(
    "#nextIssueButton",
    "Select the next review issue."
  );
  applyTooltipToSelector(
    "#resolveIssueButton",
    "Mark the selected review issue as resolved."
  );
  applyTooltipToSelector(
    "#resolveAllIssuesButton",
    "Mark every current review issue as resolved."
  );

  applyControlTooltip(
    "userRadius",
    "Default radius, in image pixels, for detected and newly added cores."
  );
  applyControlTooltip(
    "originAngle",
    "Rotate the image so rows and columns line up with the grid."
  );
  applyControlTooltip(
    "connectCoresCheckbox",
    "Draw connector lines between adjacent cores to make the lattice easier to inspect."
  );
  applyControlTooltip(
    "flagMisalignmentCheckbox",
    "Highlight cores whose positions do not fit the inferred row and column lattice."
  );
  applyControlTooltip(
    "advanced-settings",
    "Show lower-level gridding and rotation parameters."
  );
  applyControlTooltip(
    "radiusMultiplier",
    "Set how far the traveling algorithm searches relative to each core radius."
  );
  applyControlTooltip(
    "gridWidth",
    "Expected spacing between neighboring grid positions used by the gridding algorithm."
  );
  applyControlTooltip(
    "gamma",
    "Distance past the rightmost core where the traveling algorithm stops searching."
  );
  applyControlTooltip(
    "multiplier",
    "Scale factor used when estimating grid spacing."
  );
  applyControlTooltip(
    "imageWidth",
    "Working image width used by the gridding algorithm."
  );
  applyControlTooltip(
    "searchAngle",
    "Angular search window used while looking for the next core."
  );
  applyControlTooltip(
    "thresholdMultiplier",
    "Edge-length filter used to remove unusually short or long triangulation edges."
  );
  applyControlTooltip(
    "thresholdAngle",
    "Angle tolerance for keeping edges that match the expected grid direction."
  );
  applyControlTooltip(
    "minAngle",
    "Lowest rotation angle tested during automatic rotation estimation."
  );
  applyControlTooltip(
    "maxAngle",
    "Highest rotation angle tested during automatic rotation estimation."
  );
  applyControlTooltip(
    "angleStepSize",
    "Degrees between tested rotation angles."
  );
  applyControlTooltip(
    "angleThreshold",
    "Angle tolerance used when evaluating candidate image rotations."
  );
  applyTooltipToSelector(
    "#apply-hyperparameters",
    "Apply these gridding settings and redraw the core grid."
  );
  applyTooltipToSelector(
    "#griddingSidebarIcon",
    "Show or hide gridding parameters."
  );
  applyTooltipToSelector(
    "#toolbarAddCoreButton",
    "Enter manual core placement mode."
  );
  applyTooltipToSelector(
    "#zoomInButton",
    "Zoom in on the image viewer."
  );
  applyTooltipToSelector(
    "#zoomOutButton",
    "Zoom out of the image viewer."
  );
  applyTooltipToSelector(
    "#fitImageButton",
    "Fit the tissue image inside the viewer."
  );
  applyTooltipToSelector(
    "#toggleGridLabelsButton",
    "Show or hide row and column labels on cores."
  );
  applyTooltipToSelector(
    "#toggleGridLinesButton",
    "Show or hide connector lines between cores."
  );
  applyTooltipToSelector(
    "#create-virtual-grid",
    "Build the virtual grid and prepare editable metadata for export."
  );

  applyControlTooltip(
    "editIsMarkerInput",
    "Mark this as an orientation or control marker instead of a specimen core."
  );
  applyControlTooltip(
    "editRowInput",
    "One-based row number for this core in the exported grid."
  );
  applyControlTooltip(
    "editColumnInput",
    "One-based column number for this core in the exported grid."
  );
  applyControlTooltip(
    "editXInput",
    "Horizontal center position of this core in image pixels."
  );
  applyControlTooltip(
    "editYInput",
    "Vertical center position of this core in image pixels."
  );
  applyControlTooltip(
    "editRadiusInput",
    "Radius used to outline and crop this core."
  );
  applyControlTooltip(
    "editAnnotationsInput",
    "Notes for this core that will be included in exported metadata."
  );
  applyControlTooltip(
    "editRealInput",
    "Treat this as a real tissue core."
  );
  applyControlTooltip(
    "editImaginaryInput",
    "Treat this as a missing placeholder core used to preserve grid spacing."
  );
  applyTooltipToSelector(
    "#saveCoreEdits",
    "Save changes to this core."
  );
  applyTooltipToSelector(
    "#removeCoreButton",
    "Remove this core from the grid."
  );

  applyTooltipToSelector(
    "#virtualGridSidebarIcon",
    "Show or hide the metadata editor."
  );
  applyControlTooltip(
    "horizontalSpacing",
    "Horizontal spacing between virtual grid columns."
  );
  applyControlTooltip(
    "verticalSpacing",
    "Vertical spacing between virtual grid rows."
  );
  applyControlTooltip(
    "startingX",
    "Horizontal offset for the virtual grid drawing."
  );
  applyControlTooltip(
    "startingY",
    "Vertical offset for the virtual grid drawing."
  );
  applyTooltipToSelector(
    "#applyVirtualGridSettings",
    "Redraw the virtual grid using the current spacing and offset settings."
  );
  applyTooltipToSelector(
    "#saveResultsAsJson",
    "Download the edited metadata as a JSON file."
  );
  applyTooltipToSelector(
    "#saveResultsAsCsv",
    "Download the edited metadata as a CSV file."
  );
  applyTooltipToSelector(
    "#downloadAllCoresButton",
    "Export image crops for all available cores."
  );

  applyTooltipToSelector(
    "#imageUploadTabButton",
    "Go to image upload."
  );
  applyTooltipToSelector(
    "#imageSegmentationTabButton",
    "Go to core segmentation after an image is loaded."
  );
  applyTooltipToSelector(
    "#rawDataTabButton",
    "Go to gridding after segmentation is complete."
  );
  applyTooltipToSelector(
    "#virtualGridTabButton",
    "Go to metadata editing and export after the virtual grid is built."
  );
}

window.applyTooltip = applyTooltip;
initializeTooltipSystem();
initializeStaticTooltips();

// Tab controls for the upload options
document.querySelectorAll(".upload-option-tab").forEach((tab) => {
  tab.addEventListener("click", function () {
    document
      .querySelectorAll(".upload-option-tab")
      .forEach((t) =>
        t.classList.remove("border-blue-500", "font-semibold", "active")
      );
    this.classList.add("border-blue-500", "font-semibold", "active");
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.add("hidden"));
    document.getElementById(this.dataset.target).classList.remove("hidden");
  });
});

// References to sections
const uploadSection = document.getElementById("upload");
const segmentationSection = document.getElementById("segmentation");
const griddingSection = document.getElementById("gridding");
const virtualGridSection = document.getElementById("virtual-grid");

// Navigation function
function navigateToSection(currentSection, nextSection) {
  currentSection.classList.add("hidden");
  nextSection.classList.remove("hidden");
}

// Advanced settings toggle in gridding section
const advancedSettingsCheckbox = document.getElementById("advanced-settings");
const advancedSettingsContent = document.querySelector(
  "#advanced-settings-content"
);

// const toggleBackground = document.querySelector("#toggle-bg");
// const toggleDot = document.querySelector(".dot");

advancedSettingsCheckbox.addEventListener("change", function () {
  if (this.checked) {
    advancedSettingsContent.classList.remove("hidden");
    // // If the checkbox is checked, change the background color and move the dot to indicate it's on
    // toggleBackground.style.backgroundColor = "#4ade80"; // Change to your desired color for "on" state
    // toggleDot.style.transform = "translateX(90%)"; // Adjust this value based on the size of your toggle
  } else {
    advancedSettingsContent.classList.add("hidden");
    // // If the checkbox is not checked, revert to the original state
    // toggleBackground.style.backgroundColor = "rgb(229 231 235)"; // Original color
    // toggleDot.style.transform = "translateX(1px)"; // Back to the original position
  }
});

function nextSection() {
  if (currentStep === 0 && !window.loadedImg) {
    alert("Please load an image first.");

    // If no image is loaded, show an error message
    const imageLoadStatus = document.getElementById("imageLoadStatus");
    imageLoadStatus.classList = "load-status error-message";
    imageLoadStatus.textContent = "No image loaded";
    return;
  }

  // Check if there are marker cores and if there are, alert the user to assign indices to them, or they will not show up in the virtual grid

  const sortedCoresData = window.sortedCoresData || [];
  const markerCores = sortedCoresData.filter((core) => core.isMarker);

  if (currentStep === 2) {
    if (sortedCoresData.length === 0) {
      alert("Please wait for cores to finish loading.");
      return;
    }

    if (
      markerCores.length > 0 &&
      !window.confirm(
        `${markerCores.length} marker core${
          markerCores.length === 1 ? "" : "s"
        } could not be placed automatically. Continue without them?`
      )
    ) {
      return;
    }
  }

  // Move to the next step
  let nextStep = currentStep + 1;

  const sections = [
    uploadSection,
    segmentationSection,
    griddingSection,
    virtualGridSection,
  ];
  const nextSection = sections[nextStep];
  if (nextSection) {
    currentStep = nextStep;
    updateCurrentStep(nextStep + 1);
    navigateToSection(sections[nextStep - 1], nextSection);
  }
}

// Handling the '.btn-proceed' buttons to navigate through steps
document.querySelectorAll(".btn-proceed").forEach((button) => {
  button.addEventListener("click", function () {
    if (this.dataset.deferNavigation === "true") {
      return;
    }

    nextSection();
  });
});

document.getElementById("useTemplate").addEventListener("click", nextSection);

// Handling the '.btn-proceed' buttons to navigate through steps
document.querySelectorAll(".btn-back").forEach((button) => {
  button.addEventListener("click", function () {
    // Move to the next step
    let lastStep = currentStep - 1;
    const sections = [
      uploadSection,
      segmentationSection,
      griddingSection,
      virtualGridSection,
    ];
    const lastSection = sections[lastStep];
    if (lastSection) {
      currentStep = lastStep;
      updateCurrentStep(lastStep + 1);
      navigateToSection(sections[lastStep + 1], lastSection);
    }
  });
});

// Handling the '.carousel-control' buttons to indicate completion and step navigation
document.querySelectorAll(".carousel-control").forEach((control, index) => {
  control.addEventListener("click", function () {
    // Jump to the clicked step
    updateCurrentStep(index + 1);
    currentStep = index;

    const sections = [
      uploadSection,
      segmentationSection,
      griddingSection,
      virtualGridSection,
    ];
    const targetSection = sections[index];
    if (targetSection) {
      // Hide all sections
      sections.forEach((section) => section.classList.add("hidden"));
      // Show the target section
      targetSection.classList.remove("hidden");
    }
  });
});

// Update the current step in the carousel controls
function updateCurrentStep(step) {
  const currentStep = parseInt(step, 10);
  const allControls = document.querySelectorAll(".carousel-control");
  allControls.forEach((control, index) => {
    const status = control.querySelector(".step-status");
    const indexLabel = control.querySelector(".step-index");

    if (index < currentStep - 1) {
      // Mark previous steps as completed
      control.classList.add("completed");
      control.classList.remove("border-blue-500", "active");
      control.setAttribute("aria-current", "false");
      if (status) {
        status.textContent = "Complete";
      }
      if (indexLabel) {
        indexLabel.textContent = "✓";
      }
    } else if (index === currentStep - 1) {
      // Highlight the current step
      control.classList.add("border-blue-500", "active");
      control.classList.remove("completed");
      control.setAttribute("aria-current", "step");
      if (status) {
        status.textContent = "Current";
      }
      if (indexLabel) {
        indexLabel.textContent = `${index + 1}`;
      }
    } else {
      // Reset the rest
      control.classList.remove("completed", "border-blue-500", "active");
      control.setAttribute("aria-current", "false");
      if (status) {
        status.textContent = "";
      }
      if (indexLabel) {
        indexLabel.textContent = `${index + 1}`;
      }
    }
  });
}

// Initialize the current step
let currentStep = 0;
updateCurrentStep(1);

document.addEventListener("DOMContentLoaded", function () {
  const dropArea = document.getElementById("drop-area");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("file-info");
  const fileNameDisplay = document.getElementById("file-name");
  const fileSizeDisplay = document.getElementById("file-size");
  const removeButton = document.getElementById("remove-file");

  // Prevent default drag behaviors
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop area when item is dragged over it
  ["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, highlight, false);
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropArea.classList.add("highlight");
  }

  function unhighlight() {
    dropArea.classList.remove("highlight");
  }

  // Handle dropped files
  dropArea.addEventListener("drop", handleDrop, false);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    handleFiles(files);
  }

  // Handle file selection via input or drop
  fileInput.addEventListener("change", function () {
    handleFiles(this.files);
  });

  function handleFiles(files) {
    if (files.length === 0) return;

    const file = files[0];
    const extension = file.name.split(".").pop().toLowerCase();
    const wsiExtensions = ["svs", "ndpi", "tif", "tiff"];
    // Check if the file is a regular image or a supported whole-slide image.
    if (
      !file.type.startsWith("image/") &&
      !wsiExtensions.includes(extension)
    ) {
      alert("File is not an image, .svs, .ndpi, .tif, or .tiff file.");
      return;
    }

    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = `(${(file.size / 1024 / 1024).toFixed(
      2
    )} MB)`;
    fileInfo.classList.remove("hidden");
  }
  removeButton.addEventListener("click", function () {
    fileInput.value = "";
    fileInfo.classList.add("hidden");

    // Reset the file upload status
    const imageLoadStatus = document.getElementById("imageLoadStatus");
    imageLoadStatus.classList = "load-status neutral-message";
    imageLoadStatus.textContent = "No image loaded";

    // Reset image preview
    const imagePreview = document.getElementById("previewImage");
    imagePreview.src = "./icons/Placeholder_view_vector.svg";
  });

  document
    .getElementById("metadata-remove-file")
    .addEventListener("click", function () {
      document.getElementById("metadataFile").value = "";
      document.getElementById("metadata-file-info").classList.add("hidden");

      // Reset the file upload status
      const metadataLoadStatus = document.getElementById("metadataLoadStatus");
      metadataLoadStatus.classList = "load-status neutral-message";
      metadataLoadStatus.textContent = "No metadata loaded";
    });
});

function openInstructions() {
  const sections = [
    uploadSection,
    segmentationSection,
    griddingSection,
    virtualGridSection,
  ];

  // Find all instructions containers within the active tabcontent
  var instructionElements = sections[currentStep].getElementsByClassName(
    "instructions-container"
  );
  // Loop through each instructions container and toggle its display
  for (var j = 0; j < instructionElements.length; j++) {
    instructionElements[j].style.display = "block";
  }
}

// Get the help displays to work
document
  .getElementById("helpButton")
  .addEventListener("click", openInstructions);

document
  .getElementById("helpButtonMobile")
  .addEventListener("click", openInstructions);
