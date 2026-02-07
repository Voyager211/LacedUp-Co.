/**
 * Common JavaScript module for Order Management
 * Handles cancellation and return functionality across all order pages
 */

// Initialize global variables from window
const cancellationReasons = window.cancellationReasons || [];
const returnReasons = window.returnReasons || [];

/**
 * Build options object for SweetAlert select input
 * @param {Array} reasonsArray - Array of reason strings
 * @returns {Object} - Object with key-value pairs for SweetAlert
 */
function buildSelectOptions(reasonsArray) {
  const options = {};
  
  if (Array.isArray(reasonsArray)) {
    reasonsArray.forEach(reason => {
      options[reason] = reason; // key = value = reason string
    });
  } else if (typeof reasonsArray === 'object') {
    // Handle object format
    Object.values(reasonsArray).forEach(reason => {
      options[reason] = reason;
    });
  }
  
  return options;
}

/**
 * Generic SweetAlert confirmation with reason selection
 * @param {Object} config - Configuration object
 */
function showReasonSelectionAlert(config) {
  const {
    title,
    text,
    icon,
    confirmText,
    confirmColor,
    apiUrl,
    httpMethod = 'PATCH',
    reasonType = 'cancellation', // 'cancellation' or 'return'
    onSuccess,
    requestBody = {},
    orderId,
    itemId = null
  } = config;

  // ✅ SIMPLIFIED: Remove frontend validation checks - backend will handle them
  

  // Select appropriate reasons array
  const reasonsArray = reasonType === 'return' ? returnReasons : cancellationReasons;
  const options = buildSelectOptions(reasonsArray);

 

  // ✅ ENHANCED: Check if we have any reasons available
  if (Object.keys(options).length === 0) {
    console.error(`❌ No ${reasonType} reasons available!`);
    Swal.fire({
      icon: 'error',
      title: 'Configuration Error',
      text: `No ${reasonType} reasons are configured. Please contact support.`,
      confirmButtonColor: '#dc3545'
    });
    return;
  }

  Swal.fire({
    title: title,
    text: text,
    icon: icon,
    input: 'select',
    inputOptions: options,
    inputPlaceholder: `Select a reason for ${reasonType}`,
    inputValidator: (value) => {
      return new Promise((resolve) => {
        if (!value || value === '') {
          resolve(`Please select a reason for ${reasonType}`);
        } else {
          resolve();
        }
      });
    },
    showCancelButton: true,
    confirmButtonColor: confirmColor,
    cancelButtonColor: '#6c757d',
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel'
  }).then((result) => {
    if (result.isConfirmed) {
   

      // Show loading
      Swal.fire({
        title: confirmText.replace('Yes, ', '') + '...',
        text: 'Please wait while we process your request.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
      });

      // Prepare request body
      const body = {
        ...requestBody,
        reason: result.value
      };

     

      // Make API request
      fetch(apiUrl, {
        method: httpMethod,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      })
      .then(response => {
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
       
        
        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: confirmText.replace('Yes, ', '') + ' Successful',
            text: data.message || 'Your request has been processed successfully.',
            confirmButtonColor: '#28a745'
          }).then(() => {
            if (onSuccess && typeof onSuccess === 'function') {
              onSuccess();
            }
          });
        } else {
          throw new Error(data.message || `Failed to ${confirmText.toLowerCase()}`);
        }
      })
      .catch(error => {
        console.error(`❌ ${title} - Error:`, error);
        Swal.fire({
          icon: 'error',
          title: confirmText.replace('Yes, ', '') + ' Failed',
          text: error.message || `Failed to ${confirmText.toLowerCase()}. Please try again.`,
          confirmButtonColor: '#dc3545'
        });
      });
    }
  });
}

/**
 * Cancel entire order
 * @param {string} orderId - Order ID
 * @param {function} onSuccess - Success callback function
 */
window.cancelOrderCommon = function(orderId, onSuccess = null) {
  
  
  showReasonSelectionAlert({
    title: 'Cancel Entire Order?',
    text: 'This will cancel all items in this order. Please select a reason.',
    icon: 'warning',
    confirmText: 'Yes, Cancel Order',
    confirmColor: '#dc3545',
    apiUrl: `/orders/${orderId}`,
    httpMethod: 'PATCH',
    reasonType: 'cancellation',
    requestBody: { action: 'cancel' },
    orderId: orderId,
    onSuccess: onSuccess || (() => { window.location.href = '/orders'; })
  });
};

/**
 * Cancel individual item
 * @param {string} orderId - Order ID
 * @param {string} itemId - Item ID
 * @param {function} onSuccess - Success callback function
 */
window.cancelItemCommon = function(orderId, itemId, onSuccess = null) {
 
  
  showReasonSelectionAlert({
    title: 'Cancel Item?',
    text: 'Please select a reason for cancelling this item.',
    icon: 'warning',
    confirmText: 'Yes, Cancel Item',
    confirmColor: '#dc3545',
    apiUrl: `/orders/${orderId}/items/${itemId}`,
    httpMethod: 'PATCH',
    reasonType: 'cancellation',
    requestBody: { action: 'cancel' },
    orderId: orderId,
    itemId: itemId,
    onSuccess: onSuccess || (() => { location.reload(); })
  });
};

/**
 * Return individual item
 * @param {string} orderId - Order ID
 * @param {string} itemId - Item ID
 * @param {function} onSuccess - Success callback function
 */
window.returnItemCommon = function(orderId, itemId, onSuccess = null) {
  
  
  showReasonSelectionAlert({
    title: 'Return Item?',
    text: 'Please select a reason for returning this item.',
    icon: 'warning',
    confirmText: 'Yes, Return Item',
    confirmColor: '#ffc107',
    apiUrl: `/orders/${orderId}/items/${itemId}/returns`,
    httpMethod: 'POST',
    reasonType: 'return',
    orderId: orderId,
    itemId: itemId,
    onSuccess: onSuccess || (() => { location.reload(); })
  });
};

/**
 * Return entire order
 * @param {string} orderId - Order ID
 * @param {function} onSuccess - Success callback function
 */
window.returnOrderCommon = function(orderId, onSuccess = null) {

  
  showReasonSelectionAlert({
    title: 'Return Entire Order?',
    text: 'This will return all items in this order. Please select a reason.',
    icon: 'warning',
    confirmText: 'Yes, Return Order',
    confirmColor: '#ffc107',
    apiUrl: `/orders/${orderId}/returns`,
    httpMethod: 'POST',
    reasonType: 'return',
    orderId: orderId,
    onSuccess: onSuccess || (() => { location.reload(); })
  });
};

/**
 * Download invoice
 * @param {string} orderId - Order ID
 */
window.downloadInvoiceCommon = function(orderId) {
  
  
  Swal.fire({
    title: 'Generating Invoice...',
    text: 'Please wait while we prepare your invoice.',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  fetch(`/orders/${orderId}/invoice`, {
    method: 'GET'
  })
  .then(response => {
    if (response.ok) {
      return response.blob();
    } else {
      throw new Error('Failed to generate invoice');
    }
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `Invoice-${orderId}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    Swal.fire({
      icon: 'success',
      title: 'Invoice Downloaded',
      text: 'Your invoice has been downloaded successfully.',
      confirmButtonColor: '#28a745',
      timer: 2000,
      timerProgressBar: true
    });
  })
  .catch(error => {
    console.error('❌ Error downloading invoice:', error);
    Swal.fire({
      icon: 'error',
      title: 'Download Failed',
      text: 'Failed to download invoice. Please try again.',
      confirmButtonColor: '#dc3545'
    });
  });
};

/**
 * Track order (placeholder)
 * @param {string} orderId - Order ID
 */
window.trackOrderCommon = function(orderId) {
  
  
  Swal.fire({
    icon: 'info',
    title: 'Order Tracking',
    text: 'Order tracking feature coming soon!',
    confirmButtonColor: '#007bff'
  });
};
