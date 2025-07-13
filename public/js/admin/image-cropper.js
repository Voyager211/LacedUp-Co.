/**
 * Enhanced Image Cropping Module for Admin Product Management
 * 
 * This module provides a controlled image cropping workflow that ensures:
 * 1. Users must explicitly confirm cropping actions
 * 2. No automatic submissions or alerts during cropping
 * 3. Clear user feedback and proper error handling
 * 4. Consistent behavior across add-product and edit-product pages
 * 
 * @author LacedUp Admin Team
 * @version 2.0
 */

class ImageCropperManager {
  constructor() {
    this.cropper = null;
    this.cropModal = null;
    this.currentUploadSlot = -1;
    this.isProcessingBulk = false;
    this.filesToCrop = [];
    this.currentFileIndex = 0;
  }

  /**
   * Shows the image cropping modal with enhanced user workflow
   * This function ensures that:
   * 1. The modal opens with the image ready for cropping
   * 2. No automatic submission occurs - user must explicitly click "Crop & Add"
   * 3. Proper cleanup happens on cancel or completion
   * 4. Clear feedback is provided to the user
   */
  showCropModal(imageSrc, onCropDone, validationErrorHandler) {
    // Remove any existing modal to prevent conflicts
    const existingModal = document.getElementById('cropModal');
    if (existingModal) existingModal.remove();

    // Create the cropping modal with clear action buttons
    const modalHtml = `
      <div class="modal fade" id="cropModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered cropper-modal-custom">
          <div class="modal-content cropper-modal-content">
            <div class="modal-header border-0 pb-2">
              <h5 class="modal-title mx-auto mb-0">
                <i class="bi bi-scissors me-2"></i>Crop Image
              </h5>
              <small class="text-muted d-block text-center mt-1">
                Adjust the crop area and click "Crop & Add" to save
              </small>
            </div>
            <div class="modal-body p-2">
              <div class="cropper-image-container">
                <img id="crop-image" src="${imageSrc}" />
              </div>
            </div>
            <div class="modal-footer border-0 pt-2 justify-content-center">
              <button class="btn btn-outline-secondary px-4" id="crop-cancel">
                <i class="bi bi-x-lg me-1"></i>Cancel
              </button>
              <button class="btn btn-success px-4" id="crop-save">
                <i class="bi bi-check-lg me-1"></i>Crop & Add
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('cropModal');
    this.cropModal = new bootstrap.Modal(modalEl, {
      backdrop: 'static', // Prevent closing by clicking outside
      keyboard: false     // Prevent closing with ESC key
    });
    
    // Show the modal
    this.cropModal.show();

    const imageEl = document.getElementById('crop-image');
    
    // Initialize cropper when image loads
    imageEl.onload = () => {
      // Initialize the cropper with optimal settings
      this.cropper = new Cropper(imageEl, {
        aspectRatio: NaN, // Allow free aspect ratio
        viewMode: 1,      // Restrict crop box to not exceed canvas
        dragMode: 'move', // Allow dragging the image
        autoCropArea: 0.6, // Initial crop area size
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        responsive: true,
        checkCrossOrigin: false,
        checkOrientation: false,
        modal: true,
        background: true,
        minContainerWidth: 300,
        minContainerHeight: 300,
        minCanvasWidth: 200,
        minCanvasHeight: 200,
        minCropBoxWidth: 100,
        minCropBoxHeight: 100,
        scalable: true,
        zoomable: true,
        zoomOnTouch: true,
        zoomOnWheel: true,
        wheelZoomRatio: 0.1,
        ready: function () {
          // Optimize initial display when cropper is ready
          this.cropper.reset();
          const containerData = this.cropper.getContainerData();
          const imageData = this.cropper.getImageData();

          // Calculate optimal scale to fit image in container
          const scaleX = containerData.width / imageData.naturalWidth;
          const scaleY = containerData.height / imageData.naturalHeight;
          const scale = Math.min(scaleX, scaleY) * 0.8; // Leave some padding

          // Center and scale the image optimally
          this.cropper.zoomTo(scale);
          this.cropper.center();
        }
      });
    };

    // Handle explicit cancel button click
    const cancelBtn = modalEl.querySelector('#crop-cancel');
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      // Mark as cancelled and handle cleanup
      modalEl.classList.add('crop-cancelled');
      this.handleCropCancel();
      this.cropModal.hide();
    };

    // Handle modal hidden event for cleanup
    modalEl.addEventListener('hidden.bs.modal', (e) => {
      // Only run cancel cleanup if not already handled and not completed
      if (!e.target.classList.contains('crop-completed') && !e.target.classList.contains('crop-cancelled')) {
        this.handleCropCancel();
      }

      // Clean up modal and backdrop
      modalEl.remove();
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) backdrop.remove();
    });

    // Handle explicit "Crop & Add" button click - ONLY ACTION THAT SAVES THE IMAGE
    const cropSaveBtn = modalEl.querySelector('#crop-save');
    cropSaveBtn.onclick = (e) => {
      e.preventDefault();
      
      // Disable button to prevent double-clicking
      cropSaveBtn.disabled = true;
      cropSaveBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Processing...';

      try {
        // Generate the cropped image
        const croppedCanvas = this.cropper.getCroppedCanvas({
          width: 800,
          height: 800,
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high'
        });

        const croppedImageData = croppedCanvas.toDataURL('image/jpeg', 0.9);

        // Mark as completed to avoid cancel cleanup
        modalEl.classList.add('crop-completed');
        
        // Hide the modal
        this.cropModal.hide();

        // Handle post-hide cleanup and callback
        modalEl.addEventListener('hidden.bs.modal', () => {
          modalEl.remove();
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) backdrop.remove();

          // Execute the completion callback with the cropped image data
          if (typeof onCropDone === 'function') {
            onCropDone(croppedImageData);
          }
        }, { once: true }); // Use once to prevent multiple executions

      } catch (error) {
        console.error('Error during image cropping:', error);
        
        // Re-enable button on error
        cropSaveBtn.disabled = false;
        cropSaveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Crop & Add';
        
        // Show error message using the provided error handler
        if (typeof validationErrorHandler === 'function') {
          validationErrorHandler(['Failed to process the cropped image. Please try again.']);
        }
      }
    };
  }

  /**
   * Handles cleanup when cropping is cancelled
   */
  handleCropCancel() {
    // Clean up cropper instance
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }

    // Reset current upload slot
    this.currentUploadSlot = -1;

    // Handle bulk upload cancellation
    if (this.isProcessingBulk) {
      this.isProcessingBulk = false;
      this.filesToCrop = [];
      this.currentFileIndex = 0;
      
      // Reset bulk upload button if it exists
      const bulkUploadBtn = document.getElementById('bulk-upload-btn');
      if (bulkUploadBtn) {
        bulkUploadBtn.innerHTML = '<i class="bi bi-images me-2"></i>Choose Files (Bulk Upload)';
        bulkUploadBtn.disabled = false;
      }
      
      // Clear bulk input
      const bulkInput = document.getElementById('bulk-input');
      if (bulkInput) {
        bulkInput.value = '';
      }
    }

    // Reset file inputs
    const input = document.getElementById('image-input');
    if (input) {
      input.value = '';
    }
  }

  /**
   * Initiates re-cropping workflow for an existing image
   * This function:
   * 1. Opens the cropper modal with the existing image
   * 2. Allows user to adjust the crop area
   * 3. Only saves the new crop when user explicitly clicks "Crop & Add"
   * 4. Does NOT automatically submit or show alerts
   */
  initiateCropWorkflow(imageSrc, uploadSlot, onComplete, validationErrorHandler) {
    // Set the current upload slot
    this.currentUploadSlot = uploadSlot;

    // Open crop modal with the image for cropping
    // The modal will handle all user interactions and only save on explicit confirmation
    this.showCropModal(imageSrc, (croppedImageData) => {
      // Reset upload slot after cropping is complete
      this.currentUploadSlot = -1;
      
      // Execute the completion callback with the cropped data
      if (typeof onComplete === 'function') {
        onComplete(croppedImageData, uploadSlot);
      }
      
      // Optional: Log success (not a SweetAlert)
      console.log('Image cropped successfully');
    }, validationErrorHandler);
  }

  /**
   * Processes bulk upload with cropping workflow
   */
  processBulkUpload(files, onEachComplete, validationErrorHandler) {
    if (files.length === 0) return;

    this.isProcessingBulk = true;
    this.filesToCrop = files;
    this.currentFileIndex = 0;

    // Update button state
    const bulkUploadBtn = document.getElementById('bulk-upload-btn');
    if (bulkUploadBtn) {
      bulkUploadBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Processing...';
      bulkUploadBtn.disabled = true;
    }

    // Start processing first image
    this.cropNextBulkImage(onEachComplete, validationErrorHandler);
  }

  /**
   * Processes the next image in bulk upload queue
   */
  cropNextBulkImage(onEachComplete, validationErrorHandler) {
    if (this.currentFileIndex >= this.filesToCrop.length) {
      // Bulk processing complete
      this.isProcessingBulk = false;
      const bulkUploadBtn = document.getElementById('bulk-upload-btn');
      if (bulkUploadBtn) {
        bulkUploadBtn.innerHTML = '<i class="bi bi-images me-2"></i>Choose Files (Bulk Upload)';
        bulkUploadBtn.disabled = false;
      }
      this.filesToCrop = [];
      this.currentFileIndex = 0;
      return;
    }

    const file = this.filesToCrop[this.currentFileIndex];
    const reader = new FileReader();
    reader.onload = () => {
      this.showCropModal(reader.result, (croppedImageData) => {
        // Process the cropped image
        if (typeof onEachComplete === 'function') {
          onEachComplete(croppedImageData);
        }
        
        this.currentFileIndex++;
        this.cropNextBulkImage(onEachComplete, validationErrorHandler); // Process next image
      }, validationErrorHandler);
    };
    reader.readAsDataURL(file);
  }
}

// Export for use in other scripts
window.ImageCropperManager = ImageCropperManager;