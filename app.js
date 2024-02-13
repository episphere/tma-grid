// Tab controls for the upload options
document.querySelectorAll('.upload-option-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.upload-option-tab').forEach(t => t.classList.remove('border-blue-500', 'text-gray-800'));
        this.classList.add('border-blue-500', 'text-gray-800');
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
advancedSettingsCheckbox.addEventListener('change', function() {
    if (this.checked) {
        advancedSettingsContent.classList.remove('hidden');
    } else {
        advancedSettingsContent.classList.add('hidden');
    }
});

// Handling the '.btn-proceed' buttons to navigate through steps
document.querySelectorAll('.btn-proceed').forEach(button => {
    button.addEventListener('click', function() {
        // Move to the next step
        let nextStep = getCurrentStep() + 1;

        const sections = [uploadSection, segmentationSection, griddingSection, virtualGridSection];
        const nextSection = sections[nextStep];
        if (nextSection) {
            currentStep = nextStep;
            updateCurrentStep(nextStep+1);
            navigateToSection(sections[nextStep-1], nextSection);
        }
    });
});


// Handling the '.btn-proceed' buttons to navigate through steps
document.querySelectorAll('.btn-back').forEach(button => {
    button.addEventListener('click', function() {
        // Move to the next step
        let lastStep = getCurrentStep() - 1;

        const sections = [uploadSection, segmentationSection, griddingSection, virtualGridSection];
        const lastSection = sections[lastStep];
        if (lastSection) {
            currentStep = lastStep;
            updateCurrentStep(lastStep+1);
            navigateToSection(sections[lastStep+1], lastSection);
        }
    });
});




// Handling the '.carousel-control' buttons to indicate completion and step navigation
document.querySelectorAll('.carousel-control').forEach((control, index) => {
    control.addEventListener('click', function() {
        // Jump to the clicked step
        updateCurrentStep(index+1);
        currentStep = index+1;
    
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
            control.innerHTML = `<span class="checkmark">✔</span>`; // Add checkmark
        } else if (index === currentStep - 1) {
            // Highlight the current step
            control.classList.add('border-blue-500');
            control.classList.remove('completed');
            control.innerHTML = ''; // Remove the checkmark
        } else {
            // Reset the rest
            control.classList.remove('completed', 'border-blue-500');
            control.innerHTML = ''; // Remove the checkmark
        }
    });
}

// Get the current step
function getCurrentStep() {
    return currentStep;
}

// Initialize the current step
let currentStep = 0;
