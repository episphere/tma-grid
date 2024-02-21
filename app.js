// Tab controls for the upload options
document.querySelectorAll('.upload-option-tab').forEach(tab => {
    tab.addEventListener('click', function () {
        document.querySelectorAll('.upload-option-tab').forEach(t => t.classList.remove('border-blue-500', 'font-semibold', 'active'));
        this.classList.add('border-blue-500', 'font-semibold', 'active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(this.dataset.target).classList.remove('hidden');
    });
});

// References to sections
const uploadSection = document.getElementById('upload');
const segmentationSection = document.getElementById('segmentation');
const griddingSection = document.getElementById('gridding');
const virtualGridSection = document.getElementById('virtual-grid');

// Navigation buttons
const proceedToSegmentationButton = document.querySelector('#upload .btn-proceed');
const proceedToGriddingButton = document.querySelector('#segmentation .btn-proceed');
const proceedToVirtualGridButton = document.querySelector('#gridding .btn-proceed');

// Navigation function
function navigateToSection(currentSection, nextSection) {
    currentSection.classList.add('hidden');
    nextSection.classList.remove('hidden');
}



// Advanced settings toggle in gridding section
const advancedSettingsCheckbox = document.getElementById('advanced-settings');
const advancedSettingsContent = document.querySelector('#advanced-settings-content');
const toggleBackground = document.querySelector('#toggle-bg');
const toggleDot = document.querySelector('.dot');

advancedSettingsCheckbox.addEventListener('change', function () {
    if (this.checked) {
        advancedSettingsContent.classList.remove('hidden');
        // If the checkbox is checked, change the background color and move the dot to indicate it's on
        toggleBackground.style.backgroundColor = '#4ade80'; // Change to your desired color for "on" state
        toggleDot.style.transform = 'translateX(90%)'; // Adjust this value based on the size of your toggle
    } else {
        advancedSettingsContent.classList.add('hidden');
        // If the checkbox is not checked, revert to the original state
        toggleBackground.style.backgroundColor = 'rgb(229 231 235)'; // Original color
        toggleDot.style.transform = 'translateX(1px)'; // Back to the original position
    }
});


// Handling the '.btn-proceed' buttons to navigate through steps
document.querySelectorAll('.btn-proceed').forEach(button => {
    button.addEventListener('click', function () {
        // Move to the next step
        let nextStep = currentStep + 1;

        const sections = [uploadSection, segmentationSection, griddingSection, virtualGridSection];
        const nextSection = sections[nextStep];
        if (nextSection) {
            currentStep = nextStep;
            updateCurrentStep(nextStep + 1);
            navigateToSection(sections[nextStep - 1], nextSection);
        }
    });
});


// Handling the '.btn-proceed' buttons to navigate through steps
document.querySelectorAll('.btn-back').forEach(button => {
    button.addEventListener('click', function () {
        // Move to the next step
        let lastStep = currentStep - 1;
        const sections = [uploadSection, segmentationSection, griddingSection, virtualGridSection];
        const lastSection = sections[lastStep];
        if (lastSection) {
            currentStep = lastStep;
            updateCurrentStep(lastStep + 1);
            navigateToSection(sections[lastStep + 1], lastSection);
        }
    });
});


// Handling the '.carousel-control' buttons to indicate completion and step navigation
document.querySelectorAll('.carousel-control').forEach((control, index) => {
    control.addEventListener('click', function () {
        // Jump to the clicked step
        updateCurrentStep(index + 1);
        currentStep = index;

        const sections = [uploadSection, segmentationSection, griddingSection, virtualGridSection];
        const targetSection = sections[index];
        if (targetSection) {
            // Hide all sections
            sections.forEach(section => section.classList.add('hidden'));
            // Show the target section
            targetSection.classList.remove('hidden');
        }
    });
});

// Update the current step in the carousel controls
function updateCurrentStep(step) {
    const currentStep = parseInt(step, 10);
    const allControls = document.querySelectorAll('.carousel-control');
    allControls.forEach((control, index) => {
        if (index < currentStep - 1) {
            // Mark previous steps as completed
            control.classList.add('completed');
            control.classList.remove('border-blue-500', 'active');
            control.innerHTML = `<span class="checkmark">✔</span>`; // Add checkmark
        } else if (index === currentStep - 1) {
            // Highlight the current step
            control.classList.add('border-blue-500', 'active');
            control.classList.remove('completed');
            control.classList.add();
            control.innerHTML = ''; // Remove the checkmark
        } else {
            // Reset the rest
            control.classList.remove('completed', 'border-blue-500', 'active');
            control.innerHTML = ''; // Remove the checkmark
        }
    });
}

// Initialize the current step
let currentStep = 0;


document.addEventListener('DOMContentLoaded', function () {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('file-info');
    const fileNameDisplay = document.getElementById('file-name');
    const fileSizeDisplay = document.getElementById('file-size');
    const removeButton = document.getElementById('remove-file');


    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('highlight');
    }

    function unhighlight() {
        dropArea.classList.remove('highlight');
    }

    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        handleFiles(files);
    }

    // Handle file selection via input or drop
    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;

        const file = files[0];
        // Check if the file is an image or a .svs file
        if (!file.type.startsWith('image/') && file.name.split('.').pop().toLowerCase() !== 'svs') {
            alert('File is not an image or a .svs file.');
            return;
        }

        fileNameDisplay.textContent = file.name;
        fileSizeDisplay.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        fileInfo.classList.remove('hidden');
    }
    removeButton.addEventListener('click', function () {
        fileInput.value = '';
        fileInfo.classList.add('hidden');
    });
});
