
console.log('🛒 Checkout JavaScript loaded');

// global variables
window.currentEditingId = null;
let checkoutAddresses = [];
let walletBalance = 0;
let orderTotal = 0;

// paypal helpers
let paypalOrderId = null;
function renderPayPalButtons(transactionId, containerId = 'paypal-btn-container-main') {
  const btnContainer = document.getElementById(containerId);
  if (!btnContainer) {
    console.error(` PayPal container '${containerId}' not found`);
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
          console.log(' PayPal payment approved:', data);
          return fetch(`/checkout/paypal/capture/${paypalOrderId}`, { method: 'POST' })
            .then(r => r.json())
            .then(result => {
              console.log(' PayPal capture result:', result);
              if (result.success) {
                window.location.href = result.redirectUrl;
              } else {
                throw new Error(result.message || 'Payment capture failed');
              }
            });
        },
        onCancel: () => {
          console.log('⚠️ PayPal payment cancelled');
          
          //  Handle payment cancellation
          handlePaymentCancellation(transactionId, 'User cancelled PayPal payment');
        },
        onError: (err) => {
          console.error('❌ PayPal button error:', err);
          
          //  Handle payment error
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
    console.log(`🚨 Payment failure handler:`, { transactionId, reason, failureType });
    
    const response = await fetch('/checkout/handle-payment-failure', {
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

    if (data.success) {
      Swal.fire({
        icon: 'warning',
        title: 'Payment Failed',
        html: `
          <p>Your payment could not be processed, but your order has been created.</p>
          <p><strong>You can retry payment or choose a different payment method.</strong></p>
          <p>No items were charged to your account.</p>
        `,
        confirmButtonText: 'View Order & Retry Payment',
        confirmButtonColor: '#007bff'
      }).then(() => {
        window.location.href = data.redirectUrl;
      });
    } else {
      console.error('Backend failure processing failed:', data);
      Swal.fire({
        icon: 'error',
        title: 'System Error',
        text: 'There was an error processing the payment failure. Please contact support.',
        confirmButtonColor: '#dc3545'
      });
    }

  } catch (error) {
    console.error('Error in payment failure handler:', error);
    Swal.fire({
      icon: 'error',
      title: 'System Error',
      text: 'Unable to process payment failure. Please contact support.',
      confirmButtonColor: '#dc3545'
    });
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
    
    const response = await fetch('/checkout/validate-checkout-stock');

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
    console.error('Cart validation failed:', error);
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
  
  //  Handle cancellation as redirect instead of Swal
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

// wallet payment functionality
class WalletPaymentManager {
  constructor() {
    this.walletBalance = window.walletBalance || 0; 
    this.orderTotal = window.orderTotal || 0;
    this.init();
  }

  init() {
    // Get order total from the page
    const totalElement = document.querySelector('.summary-row.total .price-value');
    if (totalElement) {
      this.orderTotal = this.parseAmount(totalElement.textContent || '0');
      console.log(`💰 Order total detected: ₹${this.orderTotal}`);
    }

    if (this.walletBalance > 0) {
      console.log(` Wallet balance loaded from server: ₹${this.walletBalance}`);
      this.updateWalletDisplay(this.walletBalance);
      window.walletBalance = this.walletBalance;
    } else {
      this.loadWalletBalance();
    }
  }

  parseAmount(text) {
    return parseFloat(text.replace(/[₹,]/g, '')) || 0;
  }

  formatAmount(amount) {
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  async loadWalletBalance() {
    try {
      console.log('🔄 Loading wallet balance via API (fallback)...');
      
      const response = await fetch('/checkout/wallet-balance');
      const data = await response.json();
      
      if (data.success) {
        this.walletBalance = data.balance || 0;
        this.updateWalletDisplay(data.balance);
        console.log(` Wallet balance updated via API: ₹${data.balance}`);
        window.walletBalance = data.balance;
      } else {
        console.error('Failed to load wallet balance:', data.message);
        this.updateWalletDisplay(0, 'Failed to load balance');
      }
    } catch (error) {
      console.error('Error loading wallet balance:', error);
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
    balanceText.className = balance >= this.orderTotal ? 'text-success' : 'text-warning';

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
      
      console.log(`Sufficient balance: ₹${balance} >= ₹${this.orderTotal}`);
    }

    window.walletBalance = balance;
  }

  async refreshBalance() {
    await this.loadWalletBalance();
  }
}


/* ========= CHECKOUT VALIDATION FUNCTIONALITY ========= */
async function validateCheckoutStock() {
  try {
    console.log('🔍 Validating checkout stock…');
    const res = await fetch('/checkout/validate-checkout-stock');
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
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 [FRONTEND] validateCheckoutOnLoad START');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    console.log('📡 Calling validateCheckoutStock() API...');
    const v = await validateCheckoutStock();
    
    console.log('✅ API Response Received:');
    console.log('   success:', v.success);
    console.log('   message:', v.message);
    console.log('   validationResults:', v.validationResults);
    
    // Log each validation array
    if (v.validationResults) {
      console.log('\n📊 Validation Arrays:');
      console.log('   ✅ validItems:', v.validationResults.validItems?.length || 0);
      console.log('   ❌ invalidItems:', v.validationResults.invalidItems?.length || 0);
      console.log('   📦 outOfStockItems:', v.validationResults.outOfStockItems?.length || 0);
      console.log('   ⚠️  unavailableItems:', v.validationResults.unavailableItems?.length || 0);
    } else {
      console.log('⚠️ WARNING: validationResults is missing or undefined');
    }
    
    // Evaluate each condition separately for clarity
    console.log('\n🔎 Evaluating Conditions:');
    const notSuccess = !v.success;
    console.log('   !v.success:', notSuccess);
    
    const hasValidationResults = v.validationResults !== undefined && v.validationResults !== null;
    console.log('   hasValidationResults:', hasValidationResults);
    
    if (hasValidationResults) {
      const hasInvalidItems = v.validationResults.invalidItems?.length > 0;
      const hasOutOfStockItems = v.validationResults.outOfStockItems?.length > 0;
      const hasUnavailableItems = v.validationResults.unavailableItems?.length > 0;
      
      console.log('   hasInvalidItems:', hasInvalidItems, '(length:', v.validationResults.invalidItems?.length || 0, ')');
      console.log('   hasOutOfStockItems:', hasOutOfStockItems, '(length:', v.validationResults.outOfStockItems?.length || 0, ')');
      console.log('   hasUnavailableItems:', hasUnavailableItems, '(length:', v.validationResults.unavailableItems?.length || 0, ')');
    }
    
    // Calculate final "bad" status
    const bad = !v.success ||
                (v.validationResults &&
                 (v.validationResults.invalidItems?.length     ||
                  v.validationResults.outOfStockItems?.length  ||
                  v.validationResults.unavailableItems?.length));
    
    console.log('\n🎯 Final Decision:');
    console.log('   bad (should show error):', bad);
    
    if (bad) {
      console.log('❌ Triggering error modal in 1 second...');
      console.log('   Reason: Validation failed or has problem items');
      setTimeout(() => showCheckoutValidationError(v), 1000);
    } else {
      console.log('✅ Checkout validation PASSED');
      console.log('   All items are available for checkout');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (err) {
    console.error('❌ [FRONTEND] Error validating checkout on load:');
    console.error('   Error:', err);
    console.error('   Stack:', err.stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}


// ui helper functions
function selectAddress(radio) {
  document.querySelectorAll('.address-card').forEach(c => c.classList.remove('selected'));
  radio.closest('.address-card').classList.add('selected');
}

function selectPayment(radio) {
  // Visual selection
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  radio.closest('.payment-option').classList.add('selected');

  const allActionBtns = document.querySelectorAll('.btn-continue');
  
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

  console.log(`Payment method selected: ${radio.value}`);
}



// Razorpay Integration Functions
function initializeRazorpayCheckout(orderData) {
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
      console.log('Razorpay payment successful:', response);
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
        console.log('Razorpay payment dismissed');
        document.querySelectorAll('.btn-continue').forEach(b => b.classList.remove('d-none'));
        Swal.fire({ 
          icon: 'warning', 
          title: 'Payment Cancelled', 
          text: 'You cancelled the payment. Please try again or choose another payment method.' 
        });
      }
    }
  };

  try {
    if (typeof Razorpay === 'undefined') {
      throw new Error('Razorpay SDK not loaded');
    }

    const razorpay = new Razorpay(options);
    razorpay.on('payment.failed', function(response) {
      console.error('Razorpay payment failed:', response);
      document.querySelectorAll('.btn-continue').forEach(b => b.classList.remove('d-none'));
      Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: response.error.description || 'Payment failed. Please try again.'
      });
    });

    razorpay.open();
  } catch (error) {
    console.error('Error initializing Razorpay:', error);
    document.querySelectorAll('.btn-continue').forEach(b => b.classList.remove('d-none'));
    Swal.fire({
      icon: 'error',
      title: 'Payment Error',
      text: 'Unable to initialize payment. Please refresh the page and try again.'
    });
  }
}

function verifyRazorpayPayment(paymentData) {
  fetch('/checkout/razorpay/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData) 
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


// address modal
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

  //  Address validation
  if (!addr.value || addr.value.trim() === '') {
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

  if (pay.value === 'upi') {
    await handleRazorpayPayment(addr.value);
    return;
  }

  if (pay.value === 'paypal') {
    await handlePayPalPayment(addr.value);
    return;
  }

  await handleStandardPayment(addr.value, pay.value);
}


async function handleRazorpayPayment(deliveryAddressId) {
  try {
    // Show loading
    const loadingSwal = Swal.fire({
      title: 'Setting up UPI Payment',
      html: 'Please wait while we prepare your payment...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log(' Creating Razorpay order...');

    const txResponse = await fetch('/transactions/create-order-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryAddressId, paymentMethod: 'upi' })
    });

    const txData = await txResponse.json();
    console.log('Transaction creation response:', txData);

    if (!txResponse.ok || !txData.success) {
      throw new Error(txData.message || 'Failed to create transaction');
    }

    const rzResponse = await fetch('/checkout/razorpay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: txData.transactionId })
    });

    const rzData = await rzResponse.json();
    console.log('Razorpay order response:', rzData);

    Swal.close();

    if (!rzResponse.ok || !rzData.success) {
      throw new Error(rzData.message || 'Failed to create payment order');
    }

    console.log('Razorpay order created, initializing checkout...');
    
    const options = {
      key: rzData.keyId,
      amount: rzData.amount,
      currency: rzData.currency || 'INR',
      name: 'LacedUp',
      description: `Transaction ${rzData.transactionId}`,
      order_id: rzData.razorpayOrderId,
      handler: function(response) {
        console.log('Razorpay payment successful:', response);
        verifyRazorpayPayment({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          transactionId: data.transactionId 
        });
      },
      modal: {
        ondismiss: function() {
          console.log('Razorpay payment dismissed');
          handlePaymentCancellation(rzData.transactionId, 'User cancelled payment');
        }
      }
    };

    try {
      if (typeof Razorpay === 'undefined') {
        throw new Error('Razorpay SDK not loaded');
      }

      const razorpay = new Razorpay(options);
      
      razorpay.on('payment.failed', function(response) {
        console.error('Razorpay payment failed:', response);
        
        handlePaymentFailure(rzData.transactionId, response.error.description || 'Payment failed');
      });

      razorpay.open();
      
    } catch (error) {
      console.error('Error initializing Razorpay:', error);
      handlePaymentFailure(data.transactionId, 'Failed to initialize payment');
    }

  } catch (error) {
    console.error('Razorpay payment error:', error);
    Swal.fire({ 
      icon: 'error', 
      title: 'UPI Payment Error', 
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}

async function handlePayPalPayment(deliveryAddressId) {
  try {
    // Load PayPal SDK if not already loaded
    if (typeof window.loadPayPalSdk === 'function') {
      window.loadPayPalSdk();
    }

    // Show loading modal
    const loadingSwal = Swal.fire({
      title: 'Setting up PayPal Payment',
      html: 'Please wait while we prepare your payment...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('Creating transaction for PayPal...');

    const txResponse = await fetch('/transactions/create-order-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryAddressId, paymentMethod: 'paypal' })
    });

    const txData = await txResponse.json();
    console.log('Transaction creation response:', txData);

    if (!txResponse.ok || !txData.success) {
      throw new Error(txData.message || 'Failed to create transaction');
    }

    const ppResponse = await fetch('/checkout/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: txData.transactionId })
    });

    const ppData = await ppResponse.json();
    console.log('PayPal order response:', ppData);

    Swal.close();

    if (!ppResponse.ok || !ppData.success) {
      throw new Error(ppData.message || 'Failed to create PayPal order');
    }

    // Render PayPal Buttons
    paypalOrderId = ppData.orderId;

    const paypalMainContainer = document.getElementById('paypal-btn-container-main');
    if (paypalMainContainer) {
      paypalMainContainer.classList.remove('d-none');
      renderPayPalButtons(txData.transactionId, 'paypal-btn-container-main');
    }

    document.querySelectorAll('.btn-continue').forEach(btn => {
      if (btn.textContent.includes('PAY WITH PAYPAL')) {
        btn.classList.add('d-none');
      }
    });

  } catch (error) {
    console.error('PayPal payment error:', error);
    Swal.fire({
      icon: 'error',
      title: 'PayPal Payment Error',
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}


// handle standard payments (COD, Wallet, etc.)
async function handleStandardPayment(deliveryAddressId, paymentMethod) {
  try {
    // Show loading
    const loadingSwal = Swal.fire({
      title: 'Processing Order',
      html: 'Please wait while we process your order...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('Processing standard payment...');
    
    const requestPayload = { deliveryAddressId, paymentMethod };
    console.log('Standard payment request payload:', requestPayload);

    const response = await fetch('/checkout/place-order', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    const data = await response.json();
    console.log('Standard payment response:', data);

    Swal.close();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to place order');
    }

    console.log('Order placed successfully');
    
    // Redirect to success page
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    } else {
      window.location.href = `/checkout/order-success/${data.orderId}`;
    }

  } catch (error) {
    console.error('Standard payment error:', error);
    Swal.fire({ 
      icon: 'error', 
      title: 'Order Processing Error', 
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}




function placeOrder() { 
  proceedToPayment(); 
}

// address functionality
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
    console.error('Error saving address:', error);
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
        console.log('CHECKOUT: Districts updated');
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
  
  console.log('CHECKOUT: State change handler attached');
}

// address rendering
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
            console.log('Addresses loaded:', checkoutAddresses.length, 'addresses');
            renderCheckoutAddresses();
        } else {
            console.error('API returned error:', data ? data.message : 'Unknown error');
            showAddressError(data && data.message ? data.message : 'Failed to load addresses');
        }
    } catch (error) {
        console.error('Error loading addresses:', error);
        showAddressError(`Failed to load addresses: ${error.message}`);
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
  
  // Only load addresses if container is empty
  const addressContainer = document.getElementById('addressContainer');
  const hasAddresses = addressContainer && addressContainer.children.length > 0 &&  !addressContainer.querySelector('.text-center'); // Not empty state
  
  if (!hasAddresses) {
    loadCheckoutAddresses();
  } else {
    console.log('✅ Addresses already rendered server-side');
  }
  
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

window.selectPayment = selectPayment;
window.proceedToPayment = proceedToPayment;
window.showAddAddressModal = showAddAddressModal;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;

console.log('Global functions exposed for onclick handlers');


// coupon functionality

// Global coupon state
window.couponState = {
  appliedCoupon: null,
  availableCoupons: [],
  isLoading: false
}

// Show available coupons modal
function showAvailableCouponsModal() {
  console.log('Opening Available Coupons Modal');

  try {
    const modalElement = document.getElementById('availableCouponsModal');

    if (!modalElement) {
      console.error('Modal element not found!');
      toastr.error('Unable to find coupons modal');
      return;
    }

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  
    loadAvailableCoupons();

  } catch (error) {
    console.error('Error opening coupon modal:', error);
    toastr.error('Unable to open coupon modal')
  }
}

async function loadAvailableCoupons() {
  if (window.couponState.isLoading) {
    console.log('Already loading coupons, skipping...');
    return
  }

  const loadingDiv = document.getElementById('coupons-loading');
  const containerDiv = document.getElementById('available-coupons-container');
  const noCouponsDiv = document.getElementById('no-coupons-found');
  const errorDiv = document.getElementById('coupons-error');

  try {
    console.log('Loading available coupons...')

    window.couponState.isLoading = true;

    showModalState('loading');

    // get current order total
    const currentTotal = window.orderTotal || 0;

    const response = await fetch('/coupons/available', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load coupons (Status: ${response.status})`);
    }

    const data = await response.json();
    console.log('Available coupons API response:', data);

    if (data.success && data.data && data.data.coupons && data.data.coupons.length > 0) {
      window.couponState.availableCoupons = data.data.coupons;
      renderCouponsInModal(data.data.coupons, currentTotal);
    } else {
      showModalState('no-coupons');
    }

  } catch (error) {
    console.error('Error loading available coupons', error);
    showModalState('error');
    toastr.error('Failed to load coupons:', error.message);
  } finally {
    window.couponState.isLoading = false;
  }
}

// show different modal states
function showModalState(state) {
  const loadingDiv = document.getElementById('coupons-loading');
  const containerDiv = document.getElementById('available-coupons-container');
  const noCouponsDiv = document.getElementById('no-coupons-found');
  const errorDiv = document.getElementById('coupons-error');

  // hide all states first
  [loadingDiv, containerDiv, noCouponsDiv, errorDiv].forEach(div => {
    if (div) div.classList.add('d-none');
  });

  // show requested state
  switch (state) {
    case 'loading':
      if (loadingDiv) loadingDiv.classList.remove('d-none');
      break;

    case 'coupons' :
      if (containerDiv) containerDiv.classList.remove('d-none');
      break;

    case 'no-coupons':
      if (noCouponsDiv) noCouponsDiv.classList.remove('d-none');
      break;
      
    case 'error':
      if(errorDiv) errorDiv.classList.remove('d-none');
      break;
  }
}

// Render coupons dynamically in the modal
function renderCouponsInModal(coupons, currentTotal = 0) {
  const container = document.getElementById('available-coupons-container');
  if (!container) {
    console.error('Coupon container not found');
    return;
  }
  const containerContent = container.querySelector('.p-3');
  if (!containerContent) {
    console.error('Coupon container content div not found');
    return;
  }

  if (currentTotal === 0) {
    currentTotal = window.orderTotal || 0;
    
    if (currentTotal === 0) {
      const totalElement = document.querySelector('.summary-row.total .price-value, .final-amount, #final-total, .order-total');
      if (totalElement) {
        const extractedTotal = parseFloat(totalElement.textContent.replace(/[₹,]/g, '')) || 0;
        currentTotal = extractedTotal;
        window.orderTotal = extractedTotal;
        console.log(`Extracted order total from DOM: ₹${currentTotal}`);
      }
    }
  }

  console.log(`Rendering ${coupons.length} coupons with currentTotal: ₹${currentTotal}`);

  let html = '';

  coupons.forEach(coupon => {
    const meetsMinOrder = currentTotal >= (coupon.minimumOrderValue || 0);
    const isApplicable = meetsMinOrder && coupon.isActive;
    
    console.log(`Coupon ${coupon.code}: minOrder=${coupon.minimumOrderValue}, currentTotal=${currentTotal}, meetsMin=${meetsMinOrder}, isActive=${coupon.isActive}, applicable=${isApplicable}`);
    
    const discountLabel = coupon.discountType === 'percentage'
      ? `${coupon.discountValue}% OFF`
      : `FLAT ₹${coupon.discountValue} OFF`;
    const clickable = true;

    const badgeLabel = coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `FLAT OFF`;
    
    const cardClass = !isApplicable ? 'coupon-disabled' : 'coupon-eligible';
    const badgeClass = isApplicable ? 'coupon-badge-active' : '';

    html += `
    <div class="coupon-card-modern ${cardClass}" ${clickable && isApplicable ? `onclick="applyCouponFromModal('${coupon.code}')" style="cursor:pointer;"` : ''}>
      <div class="coupon-badge ${badgeClass}">
        <div class="badge-label">${badgeLabel}</div>
      </div>
      <div class="coupon-card-main">
        <div class="coupon-card-header">
          <span class="coupon-code">${coupon.code}</span>
          <button class="apply-btn${!isApplicable ? ' apply-btn-disabled' : ''}">
            ${isApplicable ? 'APPLY' : 'N/A'}
          </button>
        </div>
        ${!meetsMinOrder && coupon.minimumOrderValue
          ? `<div class="min-order-warning">Add ₹${(coupon.minimumOrderValue - currentTotal).toFixed(2)} more to avail this offer</div>`
          : ''}
        <div class="coupon-desc">${coupon.description || coupon.name || ''}</div>
        <div class="dotted-separator"></div>
        <div class="coupon-footer">
          Use code <strong>${coupon.code}</strong> & get ${discountLabel}
          ${coupon.minimumOrderValue ? ` off orders above ₹${coupon.minimumOrderValue}.` : ''}
        </div>
      </div>
    </div>
    `;
  });

  containerContent.innerHTML = html;
  showModalState('coupons');
  console.log(`Rendered ${coupons.length} coupons in modal`);
}





// apply coupon from modal
function applyCouponFromModal(couponCode) {
  console.log('Applying coupon from moda;:', couponCode);

  if(!couponCode) {
    console.error('No coupon code provided');
    return;
  }

  try {
    // fill input field with selected coupon
    const couponInput = document.getElementById('couponCode');
    if (couponInput) {
      couponInput.value = couponCode.toUpperCase();
    }

    // close modal
    const modalElement = document.getElementById('availableCouponsModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }

    applyCoupon();

  } catch (error) {
    console.error('Error applying coupon from modal:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Failed to apply coupon',
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: true,
      confirmButtonText: 'Close'
    });
  }
}

// main apply coupon function
async function applyCoupon () {
  const couponCodeInput = document.getElementById('couponCode');
  const applyBtn = document.getElementById('applyCouponBtn');

  if(!couponCodeInput || !applyBtn) {
    console.error('Coupon input elements not found');
    toastr.error('Coupon form elements not found');
    return;
  }

  const couponCode = couponCodeInput.value.trim().toUpperCase();

  if(!couponCode) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Please enter a coupon code',
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: true,
      confirmButtonText: 'Close'
    });
    couponCode.focus();
    return;
  }

  try {
    console.log('Applying coupon:', couponCode);

    // show loading state
    setApplyButtonLoading(true);

    const currentTotal = window.orderTotal || 0;

    if (currentTotal <= 0) {
      throw new Error('Invalid order total. Please refresh and try again');
    }

    // api call
    const response = await fetch('/checkout/apply-coupon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        couponCode: couponCode,
        orderTotal: currentTotal
      })
    });

    if (!response.ok) {
      throw new Error(`Server error (Status: ${response.status})`);
    }

    const data = await response.json();
    console.log('Apply coupon response:', data);

    if (data.success) {
      // update global state
      window.couponState.appliedCoupon = data.data.appliedCoupon;

      // update ui
      showAppliedCouponUI(data.data.appliedCoupon);
      updateOrderSummaryUI(data.data.orderSummary);

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: data.message || 'Coupon applied successfully!',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

    } else {
      throw new Error(data.message || 'Failed to apply coupon');
    }

  } catch (error) {
    console.error('Error applying coupon: ', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message,
      showConfirmButton: true,
      confirmButtonText: 'Close'
    });

    couponCodeInput.focus();
    couponCodeInput.select();

  } finally {
    setApplyButtonLoading(false);
  }
}

// remove applied coupon
async function removeCoupon() {
  const removeBtn = document.getElementById('removeCouponBtn');

  if(!removeBtn) {
    console.error('Remove coupon button not found');
    return;
  }

  try {
    console.log('Removing applied coupon');

    // show loading state
    setRemoveButtonLoading(true);

    // api call
    const response = await fetch('/checkout/remove-coupon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Server error (Status: ${response.status})`);
    }

    const data = await response.json();
    console.log('Remove coupon response:', data);

    if (data.success) {
      window.couponState.appliedCoupon = null;

      // update ui
      showCouponFormUI();
      updateOrderSummaryUI(data.data.orderSummary);

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: data.message || 'Coupon removed successfully!',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    } else {
      throw new Error(data.message || 'Failed to remove coupon');
    }
  } catch (error) {
    console.error('Error removing coupon:', error);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'error',
      title: error.message || 'Error removing coupon',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  } finally {
    setRemoveButtonLoading(false);
  }
}

// COUPON UI HELPER FUNCTIONS

// show applied coupon UI
function showAppliedCouponUI(coupon) {
  const couponForm = document.getElementById('coupon-form');
  const appliedCouponDiv = document.getElementById('applied-coupon');

  if(couponForm) {
    couponForm.style.display = 'none';
  }

  if (appliedCouponDiv && coupon) {
    const couponName = document.getElementById('coupon-name');
    const couponCode = document.getElementById('coupon-code');
    const couponDiscount = document.getElementById('coupon-discount');

    if(couponName) couponName.textContent = coupon.name || coupon.code;
    if (couponCode) couponCode.textContent = coupon.code;
    if(couponDiscount) couponDiscount.textContent = (coupon.discountAmount || 0).toFixed(2);

    appliedCouponDiv.style.display = 'block';
  }

  console.log('Applied coupon UI updated');
}

function showCouponFormUI () {
  const couponForm = document.getElementById('coupon-form');
  const appliedCouponDiv = document.getElementById('applied-coupon');
  const couponInput = document.getElementById('couponCode');

  if (appliedCouponDiv) {
    appliedCouponDiv.style.display = 'none';
  }

  if (couponForm) {
    couponForm.style.display = 'block';
  }

  if (couponInput) {
    couponInput.value = '';
  }
    
  console.log('Coupon form UI restored');

}

function updateOrderSummaryUI(orderSummary) {
  if (!orderSummary) {
    console.log('No order sumary provided');
    return;
  }

  // update global order total
  window.orderTotal = orderSummary.finalTotal || orderSummary.total || 0;

  const totalElements = document.querySelectorAll('.order-total, #final-total, .final-amount');
  totalElements.forEach(el => {
    if (el) {
      el.textContent = `${window.orderTotal.toFixed(2)}`;
    }
  });

  console.log('Order summary UI updated, new total:', window.orderTotal);
}

// button loading states
function setApplyButtonLoading(isLoading) {
  const applyBtn = document.getElementById('applyCouponBtn');
  if (!applyBtn) return;

  if (isLoading) {
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Applying...';
  } else {
    applyBtn.disabled = false;
    applyBtn.innerHTML = 'Apply Coupon';
  }
}

function setRemoveButtonLoading(isLoading) {
  const removeBtn = document.getElementById('removeCouponBtn');
  if(!removeBtn) return;

  if (isLoading) {
    removeBtn.disabled = true;
    removeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Removing...';
  } else {
    removeBtn.disabled = false;
    removeBtn.innerHTML = 'Remove';
  }
}

// EVENT LISTENERS INITIALIZATION

// initialize coupon event listeners when DOM is loaded
function initializeCouponEventListeners () {
  console.log('Initializing coupon event listeners...');

  // apply coupon button
  const applyCouponBtn = document.getElementById('applyCouponBtn');
  if(applyCouponBtn) {
    applyCouponBtn.addEventListener('click', applyCoupon);
    console.log('Appky coupon button not found');
  } else {
    console.warn('Apply coupon button not found');
  }

  // remove coupon button
  const removeCouponBtn = document.getElementById('removeCouponBtn');
  if (removeCouponBtn) {
    removeCouponBtn.addEventListener('click', removeCoupon);
    console.log('Remove coupon button listener added');
  } else {
    console.log('Remove coupon button not found (expected if no coupon applied');
  }

  // enter key support for coupon input
  const couponInput = document.getElementById('couponCode');
  if (couponInput) {
    couponInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCoupon();
      }
    });

    // auto uppercase input
    couponInput.addEventListener('input', function(e) {
      e.target.value = e.target.value.toUpperCase();
    });

    console.log('Coupon input listeners added');
  } else {
    console.warn('Coupon input not found');
  }

  // trigger available coupons modal
  const viewCouponsBtn = document.getElementById('viewAvailableCouponsBtn');
  if (viewCouponsBtn) {
    viewCouponsBtn.addEventListener('click', showAvailableCouponsModal);
    console.log('View coupons button listener added');
  }

  console.log('Coupon event listeners initialized');
}



// auto initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing coupon functionality...');
  initializeCouponEventListeners();
})

console.log('Checkout coupon functionality script loaded successfully');