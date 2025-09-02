/* ========= CHECKOUT PAGE JAVASCRIPT ========= */
console.log('🛒 Checkout JavaScript loaded');

/* ========= GLOBAL VARIABLES ========= */
window.currentEditingId = null;
let checkoutAddresses = [];
let walletBalance = 0;
let orderTotal = 0;

/* ========= PayPal helpers ========= */
let paypalOrderId = null;
function renderPayPalButtons(transactionId, containerId = 'paypal-btn-container-main') {
  const btnContainer = document.getElementById(containerId);
  if (!btnContainer) {
    console.error(`❌ PayPal container '${containerId}' not found`);
    return;
  }
  
  console.log(`🔧 Rendering PayPal buttons in container: ${containerId}`);
  
  btnContainer.innerHTML = '';
  btnContainer.classList.remove('d-none');

  const waitSdk = () =>
    window.paypal && window.paypal.Buttons
      ? Promise.resolve()
      : new Promise(r => setTimeout(() => r(waitSdk()), 100));

  waitSdk().then(() => {
    window.paypal
      .Buttons({
        createOrder: () => {
          console.log('🔧 PayPal createOrder called with ID:', paypalOrderId);
          return paypalOrderId;
        },
        onApprove: (data, actions) => {
          console.log('✅ PayPal payment approved:', data);
          return fetch(`/paypal/capture/${paypalOrderId}`, { method: 'POST' })
            .then(r => r.json())
            .then(result => {
              console.log('✅ PayPal capture result:', result);
              if (result.success) {
                window.location.href = result.redirectUrl;
              } else {
                throw new Error(result.message || 'Payment capture failed');
              }
            });
        },
        onCancel: () => {
          console.log('⚠️ PayPal payment cancelled');
          
          // ✅ Handle payment cancellation
          handlePaymentCancellation(transactionId, 'User cancelled PayPal payment');
        },
        onError: (err) => {
          console.error('❌ PayPal button error:', err);
          
          // ✅ Handle payment error
          handlePaymentFailure(transactionId, 'PayPal payment error');
        }
      })
      .render(`#${containerId}`)
      .catch((err) => {
        console.error('❌ PayPal render error:', err);
        handlePaymentFailure(transactionId, 'PayPal rendering failed');
      });
  }).catch(error => {
    console.error('❌ PayPal SDK loading error:', error);
    handlePaymentFailure(transactionId, 'PayPal SDK loading failed');
  });
}

async function handlePaymentFailure(transactionId, reason, failureType = 'payment_error') {
  try {
    console.log(`🚨 Enhanced payment failure handler:`, { transactionId, reason, failureType });
    
    // Show immediate user feedback
    showPaymentFailureLoading(reason);
    
    // Process failure on backend with cart restoration
    const response = await fetch('/handle-payment-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        transactionId, 
        reason, 
        failureType,
        retryCount: getRetryCount(transactionId)
      })
    });

    const data = await response.json();
    Swal.close();

    if (data.success) {
      // Store failure details for failure page
      storeFailureDetails(data);
      
      // Show appropriate failure handling based on type
      await showSmartFailureDialog(data, reason, failureType);
      
    } else {
      // Fallback error handling
      console.error('❌ Backend failure processing failed:', data);
      showFallbackFailureDialog(reason);
    }

  } catch (error) {
    console.error('❌ Error in payment failure handler:', error);
    Swal.close();
    showFallbackFailureDialog(reason);
  }
}

// Show loading state during failure processing
function showPaymentFailureLoading(reason) {
  let title = 'Processing Payment Failure';
  let message = 'Please wait while we handle this issue...';
  
  if (reason === 'cancelled') {
    title = 'Payment Cancelled';
    message = 'Restoring your cart items...';
  } else if (reason.includes('network') || reason.includes('timeout')) {
    title = 'Connection Issue';
    message = 'Checking your cart and payment status...';
  }
  
  Swal.fire({
    title: title,
    html: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });
}

// Smart failure dialog with recovery options
async function showSmartFailureDialog(data, reason, failureType) {
  const { 
    canRetry, 
    retryDelay, 
    suggestedActions, 
    redirectUrl, 
    cartRestored, 
    maxRetriesReached 
  } = data;

  // Determine dialog content based on failure type
  let icon = 'error';
  let title = 'Payment Failed';
  let htmlContent = '';
  
  if (reason === 'cancelled') {
    icon = 'info';
    title = 'Payment Cancelled';
    htmlContent = `
      <p>You cancelled the payment.</p>
      ${cartRestored ? '<p class="text-success"><i class="bi bi-check-circle me-1"></i><strong>Your cart items have been restored.</strong></p>' : ''}
    `;
  } else if (failureType === 'network_error' || failureType === 'timeout') {
    icon = 'warning';
    title = 'Connection Issue';
    htmlContent = `
      <p>We had trouble connecting to process your payment.</p>
      ${cartRestored ? '<p class="text-success"><i class="bi bi-check-circle me-1"></i>Your cart items are safe.</p>' : ''}
    `;
  } else if (failureType === 'insufficient_funds') {
    icon = 'warning';
    title = 'Insufficient Funds';
    htmlContent = `
      <p>Your payment method doesn't have sufficient funds.</p>
      ${cartRestored ? '<p class="text-success"><i class="bi bi-check-circle me-1"></i>Your cart items are safe.</p>' : ''}
    `;
  } else {
    htmlContent = `
      <p>We encountered an issue processing your payment.</p>
      ${cartRestored ? '<p class="text-success"><i class="bi bi-check-circle me-1"></i>Your cart items have been restored.</p>' : ''}
    `;
  }

  // Add suggested actions
  if (suggestedActions && suggestedActions.length > 0) {
    htmlContent += '<div class="text-start mt-3"><strong>What you can do:</strong><ul class="mt-2">';
    suggestedActions.forEach(action => {
      htmlContent += `<li class="mb-1">${action}</li>`;
    });
    htmlContent += '</ul></div>';
  }

  // Show retry info
  if (maxRetriesReached) {
    htmlContent += '<p class="text-warning"><i class="bi bi-exclamation-triangle me-1"></i>Maximum retry attempts reached.</p>';
  }

  // Create action buttons
  let buttons = {};
  
  if (canRetry && !maxRetriesReached) {
    buttons.confirm = {
      text: retryDelay > 0 ? `Retry Payment (${Math.ceil(retryDelay/1000)}s)` : 'Retry Payment',
      confirmButtonColor: '#007bff'
    };
  }
  
  buttons.cancel = {
    text: reason === 'cancelled' ? 'Return to Cart' : 'Choose Different Method',
    cancelButtonColor: '#6c757d'
  };

  const result = await Swal.fire({
    icon: icon,
    title: title,
    html: htmlContent,
    showCancelButton: true,
    confirmButtonText: buttons.confirm ? buttons.confirm.text : 'Try Again',
    cancelButtonText: buttons.cancel.text,
    confirmButtonColor: buttons.confirm ? buttons.confirm.confirmButtonColor : '#007bff',
    cancelButtonColor: buttons.cancel.cancelButtonColor,
    allowOutsideClick: false,
    width: 600,
    timer: canRetry && retryDelay > 0 ? retryDelay : null,
    timerProgressBar: canRetry && retryDelay > 0,
    didOpen: () => {
      if (canRetry && retryDelay > 0) {
        // Update button text during countdown
        const confirmButton = Swal.getConfirmButton();
        let timeLeft = Math.ceil(retryDelay / 1000);
        
        const updateButtonText = () => {
          if (timeLeft > 0) {
            confirmButton.textContent = `Retry Payment (${timeLeft}s)`;
            timeLeft--;
            setTimeout(updateButtonText, 1000);
          } else {
            confirmButton.textContent = 'Retry Payment';
          }
        };
        
        updateButtonText();
      }
    }
  });

  // Handle user action
  if (result.isConfirmed && canRetry && !maxRetriesReached) {
    // User wants to retry
    incrementRetryCount(data.transactionId);
    
    // Validate cart before retry
    await validateCartAndRetry(redirectUrl);
  } else {
    // User wants to go back or choose different method
    window.location.href = redirectUrl || '/cart';
  }
}

// Validate cart before retry
async function validateCartAndRetry(fallbackUrl = '/cart') {
  try {
    Swal.fire({
      title: 'Preparing Retry',
      html: 'Validating your cart items...',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading()
    });
    
    const response = await fetch('/cart/validate-checkout-stock');
    const validation = await response.json();
    
    Swal.close();
    
    if (!validation.success || validation.checkoutEligibleItems === 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Cart Issues Found',
        html: 'Some items in your cart are no longer available. Please review your cart before retrying.',
        confirmButtonText: 'Review Cart',
        confirmButtonColor: '#007bff'
      });
      
      window.location.href = '/cart';
    } else {
      // Cart is valid, return to checkout
      window.location.href = '/checkout';
    }
    
  } catch (error) {
    console.error('❌ Cart validation failed:', error);
    Swal.close();
    
    await Swal.fire({
      icon: 'error',
      title: 'Validation Error',
      text: 'Unable to validate cart. Returning to cart page.',
      confirmButtonColor: '#007bff'
    });
    
    window.location.href = fallbackUrl;
  }
}

// Fallback failure dialog for when backend processing fails
function showFallbackFailureDialog(reason) {
  Swal.fire({
    icon: 'error',
    title: 'Payment Failed',
    html: `
      <p>We encountered an issue processing your payment.</p>
      <p><strong>No charges were made to your account.</strong></p>
      <div class="mt-3">
        <p><strong>What you can do:</strong></p>
        <ul class="text-start">
          <li>Check your internet connection</li>
          <li>Try a different payment method</li>
          <li>Contact support if the issue persists</li>
        </ul>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Return to Cart',
    cancelButtonText: 'Try Again',
    confirmButtonColor: '#007bff',
    cancelButtonColor: '#6c757d'
  }).then((result) => {
    if (result.isConfirmed) {
      window.location.href = '/cart';
    } else {
      window.location.href = '/checkout';
    }
  });
}

// Handle payment cancellation
async function handlePaymentCancellation(transactionId, reason = 'User cancelled payment') {
  console.log(`⚠️ Enhanced payment cancellation handler:`, { transactionId, reason });
  
  // Process as a special type of failure
  await handlePaymentFailure(transactionId, reason, 'cancelled');
}

// Retry count management
function getRetryCount(transactionId) {
  const key = `retry_${transactionId}`;
  return parseInt(localStorage.getItem(key) || '0');
}

function incrementRetryCount(transactionId) {
  const key = `retry_${transactionId}`;
  const current = getRetryCount(transactionId);
  localStorage.setItem(key, (current + 1).toString());
}

function clearRetryCount(transactionId) {
  const key = `retry_${transactionId}`;
  localStorage.removeItem(key);
}

// Store failure details for failure page
function storeFailureDetails(data) {
  const details = {
    failureType: data.failureType || 'payment_error',
    canRetry: data.canRetry || false,
    cartRestored: data.cartRestored || false,
    retryDelay: data.retryDelay || 0,
    suggestedActions: JSON.stringify(data.suggestedActions || [])
  };
  
  Object.entries(details).forEach(([key, value]) => {
    localStorage.setItem(key, value.toString());
  });
}

/* ========= WALLET PAYMENT FUNCTIONALITY ========= */
class WalletPaymentManager {
  constructor() {
    this.walletBalance = 0;
    this.orderTotal = 0;
    this.init();
  }

  init() {
    // Get order total from the page
    const totalElement = document.querySelector('.summary-row.total .price-value');
    if (totalElement) {
      this.orderTotal = this.parseAmount(totalElement.textContent || '0');
      console.log(`💰 Order total detected: ₹${this.orderTotal}`);
    }

    // Load wallet balance immediately
    this.loadWalletBalance();
  }



  parseAmount(text) {
    return parseFloat(text.replace(/[₹,]/g, '')) || 0;
  }

  formatAmount(amount) {
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  async loadWalletBalance() {
    try {
      console.log('🔄 Loading wallet balance for checkout...');
      
      const response = await fetch('/cart/wallet-balance');
      const data = await response.json();
      
      if (data.success) {
        this.walletBalance = data.balance || 0;
        this.updateWalletDisplay(data.balance);
        console.log(`✅ Wallet balance loaded: ₹${data.balance}`);
      } else {
        console.error('❌ Failed to load wallet balance:', data.message);
        this.updateWalletDisplay(0, 'Failed to load balance');
      }
    } catch (error) {
      console.error('❌ Error loading wallet balance:', error);
      this.updateWalletDisplay(0, 'Error loading balance');
    }
  }

  updateWalletDisplay(balance, errorMessage = null) {
    const balanceText = document.getElementById('wallet-balance-text');
    const insufficientWarning = document.getElementById('insufficient-balance-warning');
    const insufficientMessage = document.getElementById('insufficient-balance-message');
    const walletOption = document.getElementById('wallet-payment-option');
    const walletRadio = document.querySelector('input[name="paymentMethod"][value="wallet"]');
    
    if (!balanceText || !walletRadio) {
      console.warn('Wallet UI elements not found');
      return;
    }

    if (errorMessage) {
      balanceText.textContent = errorMessage;
      balanceText.className = 'text-danger';
      walletRadio.disabled = true;
      walletOption.classList.add('opacity-50');
      return;
    }

    // Update balance display
    balanceText.innerHTML = `Available: <strong>${this.formatAmount(balance)}</strong>`;
    balanceText.className = 'text-success';

    // Check if balance is sufficient
    const isBalanceSufficient = balance >= this.orderTotal;
    
    if (!isBalanceSufficient && this.orderTotal > 0) {
      // Show insufficient balance warning
      const shortfall = this.orderTotal - balance;
      insufficientWarning.classList.remove('d-none');
      insufficientMessage.textContent = `Insufficient wallet balance. Need ${this.formatAmount(shortfall)} more.`;
      
      // Disable wallet option
      walletRadio.disabled = true;
      walletOption.classList.add('opacity-50');
      
      // If wallet was selected, change to COD
      if (walletRadio.checked) {
        const codRadio = document.querySelector('input[name="paymentMethod"][value="cod"]');
        if (codRadio) {
          codRadio.checked = true;
          selectPayment(codRadio);
        }
      }
      
      console.log(`⚠️ Insufficient balance: ₹${balance} < ₹${this.orderTotal}`);
    } else {
      // Hide insufficient balance warning
      insufficientWarning.classList.add('d-none');
      
      // Enable wallet option
      walletRadio.disabled = false;
      walletOption.classList.remove('opacity-50');
      
      console.log(`✅ Sufficient balance: ₹${balance} >= ₹${this.orderTotal}`);
    }

    // Store for global access
    window.walletBalance = balance;
  }

  // Refresh balance (useful after user adds money)
  async refreshBalance() {
    await this.loadWalletBalance();
  }
}

/* ========= CHECKOUT VALIDATION FUNCTIONALITY ========= */
async function validateCheckoutStock() {
  try {
    console.log('🔍 Validating checkout stock…');
    const res = await fetch('/cart/validate-checkout-stock');
    console.log('Checkout validation status:', res.status);
    const json = await res.json();
    console.log('Checkout validation response:', json);
    return json;
  } catch (err) {
    console.error('Error validating checkout stock:', err);
    return { success: false, allValid: false, errorMessage: 'Failed to validate cart items. Please try again.' };
  }
}

function showCheckoutValidationError(v) {
  console.log('Showing checkout validation error:', v);
  const msg = v.errorMessage || v.message || 'Some items in your cart are no longer available';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'Cannot Place Order',
      html: msg.replace(/\n/g, '<br>'),
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'Return to Cart',
      allowOutsideClick: false,
      allowEscapeKey: false,
      width: 600
    }).then(r => { if (r.isConfirmed) window.location.href = '/cart'; });
  } else {
    alert(msg);
    window.location.href = '/cart';
  }
}

async function validateCheckoutOnLoad() {
  console.log('🔍 Validating checkout on page load…');
  try {
    const v = await validateCheckoutStock();
    const bad = !v.success ||
                (v.validationResults &&
                 (v.validationResults.invalidItems.length     ||
                  v.validationResults.outOfStockItems.length  ||
                  v.validationResults.unavailableItems.length));

    if (bad) setTimeout(() => showCheckoutValidationError(v), 1000);
    else console.log('✅ Checkout validation passed – all items available');
  } catch (err) {
    console.error('Error validating checkout on load:', err);
  }
}

/* ========= UI HELPERS ========= */
function selectAddress(radio) {
  document.querySelectorAll('.address-card').forEach(c => c.classList.remove('selected'));
  radio.closest('.address-card').classList.add('selected');
}

function selectPayment(radio) {
  // Visual selection
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  radio.closest('.payment-option').classList.add('selected');

  const allActionBtns = document.querySelectorAll('.btn-continue');
  
  // ✅ FIXED: Hide all PayPal containers
  const paypalMainContainer = document.getElementById('paypal-btn-container-main');
  const paypalLeftContainer = document.getElementById('paypal-btn-container-left');
  const razorpayContainer = document.getElementById('razorpay-btn-container');
  
  if (paypalMainContainer) paypalMainContainer.classList.add('d-none');
  if (paypalLeftContainer) paypalLeftContainer.classList.add('d-none');
  if (razorpayContainer) razorpayContainer.classList.add('d-none');
  
  // Show all regular buttons
  allActionBtns.forEach(b => b.classList.remove('d-none'));

  // Update button text based on payment method
  allActionBtns.forEach(btn => {
    btn.className = 'btn-continue';
    if (radio.value === 'cod') {
      btn.innerHTML = '<i class="bi bi-check-circle"></i> PLACE ORDER';
    } else if (radio.value === 'wallet') {
      const amt = (window.orderTotal || 0).toLocaleString('en-IN');
      btn.innerHTML = `<i class="bi bi-wallet2"></i> PAY WITH WALLET (₹${amt})`;
      btn.classList.add('wallet-payment');
    } else if (radio.value === 'upi') {
      btn.innerHTML = '<i class="bi bi-phone"></i> PAY WITH UPI';
      btn.classList.add('upi-payment');
    } else if (radio.value === 'paypal') {
      btn.innerHTML = '<i class="bi bi-paypal"></i> PAY WITH PAYPAL';
      btn.classList.add('paypal-payment');
    } else {
      btn.innerHTML = '<i class="bi bi-arrow-right"></i> CONTINUE TO PAYMENT';
    }
  });

  console.log(`💳 Payment method selected: ${radio.value}`);
}



// ✅ Razorpay Integration Functions
function initializeRazorpayCheckout(orderData) {
  // ✅ ENHANCED: Validate orderData
  if (!orderData.razorpayOrderId || !orderData.keyId || !orderData.amount) {
    console.error('❌ Invalid Razorpay order data:', orderData);
    Swal.fire({
      icon: 'error',
      title: 'Payment Setup Error',
      text: 'Invalid payment configuration. Please try again.'
    });
    return;
  }

  const options = {
    key: orderData.keyId,
    amount: orderData.amount,
    currency: orderData.currency || 'INR',
    name: 'LacedUp',
    description: `Order ${orderData.internalOrderId}`,
    order_id: orderData.razorpayOrderId,
    handler: function(response) {
      console.log('✅ Razorpay payment successful:', response);
      verifyRazorpayPayment(response, orderData.internalOrderId);
    },
    prefill: {
      name: 'Customer Name',
      email: 'customer@example.com',
      contact: '9999999999'
    },
    theme: {
      color: '#3399cc'
    },
    modal: {
      ondismiss: function() {
        console.log('⚠️ Razorpay payment dismissed');
        document.querySelectorAll('.btn-continue').forEach(b => b.classList.remove('d-none'));
        Swal.fire({ 
          icon: 'warning', 
          title: 'Payment Cancelled', 
          text: 'You cancelled the payment. Please try again or choose another payment method.' 
        });
      }
    }
  };

  // ✅ ENHANCED: Error handling for Razorpay initialization
  try {
    if (typeof Razorpay === 'undefined') {
      throw new Error('Razorpay SDK not loaded');
    }

    const razorpay = new Razorpay(options);
    razorpay.on('payment.failed', function(response) {
      console.error('❌ Razorpay payment failed:', response);
      document.querySelectorAll('.btn-continue').forEach(b => b.classList.remove('d-none'));
      Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: response.error.description || 'Payment failed. Please try again.'
      });
    });

    razorpay.open();
  } catch (error) {
    console.error('❌ Error initializing Razorpay:', error);
    document.querySelectorAll('.btn-continue').forEach(b => b.classList.remove('d-none'));
    Swal.fire({
      icon: 'error',
      title: 'Payment Error',
      text: 'Unable to initialize payment. Please refresh the page and try again.'
    });
  }
}

function verifyRazorpayPayment(paymentData) {
  fetch('/razorpay/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData) // ✅ Now includes transactionId
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      window.location.href = data.redirectUrl;
    } else {
      handlePaymentFailure(paymentData.transactionId, data.message || 'Payment verification failed');
    }
  })
  .catch(err => {
    console.error('Payment verification error:', err);
    handlePaymentFailure(paymentData.transactionId, 'Payment verification failed');
  });
}


/* ========= ADDRESS MODAL FUNCTIONALITY ========= */
window.showAddAddressModal = function() {
  window.currentEditingId = null;
  const modalLabel = document.getElementById('addressModalLabel');
  if (modalLabel) modalLabel.innerHTML = '<i class="bi bi-plus me-2"></i> Add New Address';

  const form = document.getElementById('addressForm');
  if (form) {
    form.reset();
    [...form.querySelectorAll('.is-invalid, .is-valid')].forEach(e => e.classList.remove('is-invalid', 'is-valid'));
    [...form.querySelectorAll('.error-message')].forEach(e => e.style.display = 'none');
    
    const districtSelect = document.getElementById('district');
    if (districtSelect) {
      districtSelect.innerHTML = '<option value="">Select District</option>';
      districtSelect.disabled = true;
    }
  }

  const modal = new bootstrap.Modal(document.getElementById('addressModal'));
  modal.show();
};

window.editAddress = async function(id) {
  window.currentEditingId = id;
  const modalLabel = document.getElementById('addressModalLabel');
  if (modalLabel) modalLabel.innerHTML = '<i class="bi bi-pencil me-2"></i> Edit Address';

  try {
    const res = await fetch(`/api/address/${id}`);
    const { success, address, message } = await res.json();
    if (!success || !address) throw new Error(message || 'Fetch failed');

    const form = document.getElementById('addressForm');
    if (form) {
      form.fullName.value = address.name || '';
      form.mobileNumber.value = address.phone || '';
      form.altPhone.value = address.altPhone || '';
      form.addressDetails.value = address.landMark || '';
      form.city.value = address.city || '';
      form.pincode.value = address.pincode || '';

      const typeRadio = form.querySelector(`input[name="addressType"][value="${address.addressType}"]`);
      if (typeRadio) typeRadio.checked = true;

      if (address.state) {
        form.state.value = address.state;
        form.state.dispatchEvent(new Event('change'));
        setTimeout(() => { form.district.value = address.district || ''; }, 300);
      }
    }

    const modal = new bootstrap.Modal(document.getElementById('addressModal'));
    modal.show();
  } catch (err) {
    console.error('Error loading address:', err);
    Swal.fire({ 
      icon: 'error', 
      title: 'Error', 
      text: 'Failed to load address data. Please try again.' 
    });
  }
};

window.deleteAddress = async function(id) {
  const ok = await Swal.fire({
    title: 'Delete Address?',
    text: 'Are you sure you want to delete this address?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: '<i class="bi bi-trash me-1"></i> Yes, Delete'
  });
  if (!ok.isConfirmed) return;

  try {
    const res = await fetch(`/api/address/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Failed');

    Swal.fire({ 
      icon: 'success', 
      title: 'Deleted!', 
      timer: 1200, 
      showConfirmButton: false 
    });
    
    loadCheckoutAddresses();
    
  } catch (err) {
    Swal.fire({ 
      icon: 'error', 
      title: 'Error', 
      text: err.message 
    });
  }
};

/* ========= ENHANCED PLACE ORDER WITH WALLET SUPPORT ========= */
async function proceedToPayment() {
  const addr = document.querySelector('input[name="deliveryAddress"]:checked');
  const pay = document.querySelector('input[name="paymentMethod"]:checked');
  
  if (!addr || !pay) {
    Swal.fire({ 
      icon: 'warning', 
      title: 'Missing Information', 
      text: 'Please select both delivery address and payment method' 
    });
    return;
  }

  // ✅ ENHANCED: Address validation
  if (!addr.value || !addr.value.match(/^[0-9a-fA-F]{24}$/)) {
    Swal.fire({
      icon: 'error',
      title: 'Invalid Address',
      text: 'Please select a valid delivery address'
    });
    return;
  }

  // Wallet validation
  if (pay.value === 'wallet') {
    const currentBalance = window.walletBalance || 0;
    const orderTotal = window.orderTotal || 0;
    
    if (currentBalance < orderTotal) {
      Swal.fire({
        icon: 'error',
        title: 'Insufficient Wallet Balance',
        html: `
          <p>Your wallet balance is insufficient for this order.</p>
          <p><strong>Required:</strong> ₹${orderTotal.toLocaleString('en-IN')}</p>
          <p><strong>Available:</strong> ₹${currentBalance.toLocaleString('en-IN')}</p>
          <p><strong>Shortfall:</strong> ₹${(orderTotal - currentBalance).toLocaleString('en-IN')}</p>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-wallet2 me-1"></i> Add Money to Wallet',
        cancelButtonText: 'Choose Another Payment',
        confirmButtonColor: '#28a745'
      }).then((result) => {
        if (result.isConfirmed) {
          window.open('/profile/wallet', '_blank');
        }
      });
      return;
    }
  }

  // ✅ NEW: Handle UPI (Razorpay) payment
  if (pay.value === 'upi') {
    await handleRazorpayPayment(addr.value);
    return;
  }

  // ✅ NEW: Handle PayPal payment
  if (pay.value === 'paypal') {
    await handlePayPalPayment(addr.value);
    return;
  }

  // ✅ EXISTING: Handle other payment methods (COD, Wallet, etc.)
  await handleStandardPayment(addr.value, pay.value);
}

// ✅ NEW: Separate Razorpay payment handler
async function handleRazorpayPayment(deliveryAddressId) {
  try {
    // Show loading
    const loadingSwal = Swal.fire({
      title: 'Setting up UPI Payment',
      html: 'Please wait while we prepare your payment...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('🔄 Creating Razorpay order...');
    
    const requestPayload = { deliveryAddressId };
    console.log('📤 Razorpay request payload:', requestPayload);

    const response = await fetch('/razorpay/create-order', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    const data = await response.json();
    console.log('📥 Razorpay response:', data);

    Swal.close();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to create payment order');
    }

    console.log('✅ Razorpay order created, initializing checkout...');
    
    // ✅ Enhanced Razorpay initialization with failure handling
    const options = {
      key: data.keyId,
      amount: data.amount,
      currency: data.currency || 'INR',
      name: 'LacedUp',
      description: `Transaction ${data.transactionId}`,
      order_id: data.razorpayOrderId,
      handler: function(response) {
        console.log('✅ Razorpay payment successful:', response);
        
        // ✅ Updated verification payload
        verifyRazorpayPayment({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          transactionId: data.transactionId // ✅ Include transaction ID
        });
      },
      modal: {
        ondismiss: function() {
          console.log('⚠️ Razorpay payment dismissed');
          
          // ✅ Handle payment cancellation
          handlePaymentCancellation(data.transactionId, 'User cancelled payment');
        }
      }
    };

    // ✅ Enhanced error handling
    try {
      if (typeof Razorpay === 'undefined') {
        throw new Error('Razorpay SDK not loaded');
      }

      const razorpay = new Razorpay(options);
      
      razorpay.on('payment.failed', function(response) {
        console.error('❌ Razorpay payment failed:', response);
        
        // ✅ Handle payment failure
        handlePaymentFailure(data.transactionId, response.error.description || 'Payment failed');
      });

      razorpay.open();
      
    } catch (error) {
      console.error('❌ Error initializing Razorpay:', error);
      handlePaymentFailure(data.transactionId, 'Failed to initialize payment');
    }

  } catch (error) {
    console.error('❌ Razorpay payment error:', error);
    Swal.fire({ 
      icon: 'error', 
      title: 'UPI Payment Error', 
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}

// ✅ NEW: Separate PayPal payment handler  
async function handlePayPalPayment(deliveryAddressId) {
  try {
    // Load PayPal SDK if not already loaded
    if (typeof window.loadPayPalSdk === 'function') {
      window.loadPayPalSdk();
    }

    // Show loading
    const loadingSwal = Swal.fire({
      title: 'Setting up PayPal Payment',
      html: 'Please wait while we prepare your payment...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('🔄 Creating PayPal order...');
    
    const requestPayload = { deliveryAddressId };
    console.log('📤 PayPal request payload:', requestPayload);

    const response = await fetch('/paypal/create-order', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    const data = await response.json();
    console.log('📥 PayPal response:', data);

    Swal.close();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to create PayPal order');
    }

    console.log('✅ PayPal order created, rendering buttons...');
    paypalOrderId = data.orderID;
    
    // ✅ Updated PayPal button rendering with failure handling
    const paypalMainContainer = document.getElementById('paypal-btn-container-main');
    if (paypalMainContainer) {
      paypalMainContainer.classList.remove('d-none');
      renderPayPalButtons(data.transactionId, 'paypal-btn-container-main');
    }

    // Hide the "PAY WITH PAYPAL" button
    document.querySelectorAll('.btn-continue').forEach(btn => {
      if (btn.textContent.includes('PAY WITH PAYPAL')) {
        btn.classList.add('d-none');
      }
    });

  } catch (error) {
    console.error('❌ PayPal payment error:', error);
    Swal.fire({ 
      icon: 'error', 
      title: 'PayPal Payment Error', 
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}

// ✅ EXISTING: Handle standard payments (COD, Wallet, etc.)
async function handleStandardPayment(deliveryAddressId, paymentMethod) {
  // Your existing payment processing logic for COD, Wallet, etc.
  // ... (keep existing validation and processing code)
}




// Alias for backward compatibility
function placeOrder() { 
  proceedToPayment(); 
}

/* ========= ADDRESS FUNCTIONALITY ========= */
function handleCheckoutAddressSubmit(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  
  console.log('🛒 CHECKOUT: Address form submitted');
  
  const formData = new FormData(e.target);
  const addressData = Object.fromEntries(formData.entries());
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';
  submitBtn.disabled = true;

  const url = window.currentEditingId ? `/api/address/${window.currentEditingId}` : '/api/address';
  const method = window.currentEditingId ? 'PUT' : 'POST';
  
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(addressData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      Swal.fire({
        title: 'Success!',
        text: data.message || 'Address saved successfully',
        icon: 'success',
        confirmButtonColor: '#000000'
      });
      
      const modal = bootstrap.Modal.getInstance(document.getElementById('addressModal'));
      modal.hide();
      
      e.target.reset();
      window.currentEditingId = null;
      
      loadCheckoutAddresses();
      
    } else {
      throw new Error(data.message || 'Failed to save address');
    }
  })
  .catch(error => {
    console.error('❌ Error saving address:', error);
    Swal.fire({
      title: 'Error!',
      text: `Failed to save address: ${error.message}`,
      icon: 'error',
      confirmButtonColor: '#000000'
    });
  })
  .finally(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  });
}

function attachStateChangeHandler() {
  const stateSelect = document.getElementById('state');
  const districtSelect = document.getElementById('district');
  
  if (!stateSelect || !districtSelect) {
    console.warn('State or district select not found');
    return;
  }

  stateSelect.addEventListener('change', function() {
    const selectedState = this.value;
    console.log(`🛒 CHECKOUT: State changed to: ${selectedState}`);
    
    if (selectedState) {
      districtSelect.disabled = false;
      
      if (typeof updateDistricts === 'function') {
        updateDistricts(selectedState);
        console.log('✅ CHECKOUT: Districts updated');
      } else {
        console.warn('updateDistricts function not available');
      }
    } else {
      districtSelect.value = '';
      districtSelect.disabled = true;
      districtSelect.innerHTML = '<option value="">Select District</option>';
    }
  });

  if (stateSelect.value) {
    districtSelect.disabled = false;
  } else {
    districtSelect.disabled = true;
  }
  
  console.log('✅ CHECKOUT: State change handler attached');
}

/* ========= ADDRESS RENDERING FUNCTIONALITY ========= */
async function loadCheckoutAddresses() {
    try {
        console.log('🔄 Loading addresses for checkout...');
        
        const response = await fetch('/api/addresses');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Addresses data:', data);

        if (data && data.success) {
            checkoutAddresses = data.addresses || [];
            console.log('✅ Addresses loaded:', checkoutAddresses.length, 'addresses');
            renderCheckoutAddresses();
        } else {
            console.error('❌ API returned error:', data ? data.message : 'Unknown error');
            showAddressError(data && data.message ? data.message : 'Failed to load addresses');
        }
    } catch (error) {
        console.error('❌ Error loading addresses:', error);
        showAddressError(`Failed to load addresses: ${error.message}`);
    } finally {
        const loadingState = document.getElementById('addressLoadingState');
        if (loadingState) {
            loadingState.style.display = 'none';
        }
    }
}

function renderCheckoutAddresses() {
    const container = document.getElementById('addressContainer');
    if (!container) {
        console.error('❌ Address container not found');
        return;
    }

    const loadingState = document.getElementById('addressLoadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }

    if (checkoutAddresses.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <p class="text-muted">No addresses found. Please add a delivery address to continue.</p>
                <button class="btn btn-primary" onclick="showAddAddressModal()">
                    <i class="bi bi-plus-circle"></i> Add Your First Address
                </button>
            </div>
        `;
        return;
    }

    const addressesHTML = checkoutAddresses.map((address, index) => `
        <div class="address-card ${index === 0 ? 'selected' : ''}" id="address-card-${address._id}">
            <label class="d-flex align-items-start">
                <input type="radio" name="deliveryAddress" value="${address._id}" ${index === 0 ? 'checked' : ''} onclick="selectAddress(this)">
                <div class="address-info flex-grow-1">
                    <h6>${address.name}</h6>
                    <p>${address.addressType}</p>
                    <p>${address.landMark}</p>
                    <p>${address.city}, ${address.state}</p>
                    <p>PIN: ${address.pincode}</p>
                    <p><i class="bi bi-telephone"></i> ${address.phone}</p>
                    ${address.altPhone ? `<p><i class="bi bi-telephone"></i> ${address.altPhone} (Alt)</p>` : ''}
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="editAddress('${address._id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteAddress('${address._id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </label>
        </div>
    `).join('');

    container.innerHTML = addressesHTML;
    console.log('✅ Addresses rendered in checkout');
}

function showAddressError(message) {
    const container = document.getElementById('addressContainer');
    if (container) {
        container.innerHTML = `
            <div class="text-center py-4">
                <p class="text-danger">Error: ${message}</p>
                <button class="btn btn-outline-primary" onclick="loadCheckoutAddresses()">
                    <i class="bi bi-arrow-clockwise"></i> Retry
                </button>
            </div>
        `;
    }
}

/* ========= DOM READY & INITIALIZATION ========= */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🛒 Checkout DOM ready');
  document.querySelector('.checkout-content')?.classList.remove('hidden');
  
  // Get order total for wallet validation
  const totalElement = document.querySelector('.summary-row.total .price-value');
  if (totalElement) {
    window.orderTotal = parseFloat(totalElement.textContent.replace(/[₹,]/g, '')) || 0;
    console.log(`💰 Order total set: ₹${window.orderTotal}`);
  }
  
  // Initialize wallet payment manager
  const walletManager = new WalletPaymentManager();
  
  // Load addresses on page load
  loadCheckoutAddresses();
  
  // Validate checkout after a short delay
  setTimeout(validateCheckoutOnLoad, 500);

  // Set up address modal handlers
  const addressModal = document.getElementById('addressModal');
  if (addressModal) {
    addressModal.addEventListener('shown.bs.modal', () => {
      setTimeout(() => {
        if (typeof loadStateDistrictData === 'function') loadStateDistrictData();
        if (typeof GeoapifyAddressForm !== 'undefined')
          new GeoapifyAddressForm(window.geoapifyApiKey || '');
        
        const form = document.getElementById('addressForm');
        if (form) {
          const newForm = form.cloneNode(true);
          form.parentNode.replaceChild(newForm, form);
          newForm.addEventListener('submit', handleCheckoutAddressSubmit, { once: false, capture: true });
          console.log('✅ CHECKOUT: Form handler attached');
        }
        
        attachStateChangeHandler();
      }, 200);
    });
  }

  console.log('✅ Checkout initialization complete');
});
