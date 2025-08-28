/* ========= CHECKOUT PAGE JAVASCRIPT ========= */
console.log('🛒 Checkout JavaScript loaded');

/* ========= GLOBAL VARIABLES ========= */
window.currentEditingId = null;
let checkoutAddresses = [];
let walletBalance = 0;
let orderTotal = 0;

/* ========= PayPal helpers ========= */
let paypalOrderId = null;
function renderPayPalButtons(internalOrderId) {
  const btnContainer = document.getElementById('paypal-btn-container');
  if (!btnContainer) return;
  btnContainer.innerHTML = '';                 // reset
  btnContainer.classList.remove('d-none');

  // Wait until SDK is ready
  const ready = () => window.paypal && window.paypal.Buttons;
  const waitSdk = () =>
    ready()
      ? Promise.resolve()
      : new Promise(r => setTimeout(() => r(waitSdk()), 100));

  waitSdk().then(() => {
    window.paypal
      .Buttons({
        createOrder: () => paypalOrderId,      // we already have it
        onApprove: (_, actions) =>
          fetch(`/paypal/capture/${paypalOrderId}`, { method: 'POST' })
            .then(r => r.json())
            .then(d => (window.location.href = d.redirectUrl)),
        onCancel: () =>
          window.location.href = `/order-failure/${internalOrderId}`,
        onError: () =>
          window.location.href = `/order-failure/${internalOrderId}`
      })
      .render('#paypal-btn-container');
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
  // visual selection
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  radio.closest('.payment-option').classList.add('selected');

  const allActionBtns = document.querySelectorAll('.btn-continue');
  const ppContainer   = document.getElementById('paypal-btn-container');
  if (ppContainer) ppContainer.classList.add('d-none');

  /* default button label logic (wallet/COD/Card) */
  allActionBtns.forEach(btn => {
    btn.className = 'btn-continue';
    if (radio.value === 'cod')
      btn.innerHTML = '<i class="bi bi-check-circle"></i> PLACE ORDER';
    else if (radio.value === 'wallet') {
      const amt = (window.orderTotal || 0).toLocaleString('en-IN');
      btn.innerHTML =
        `<i class="bi bi-wallet2"></i> PAY WITH WALLET (₹${amt})`;
      btn.classList.add('wallet-payment');
    } else
      btn.innerHTML = '<i class="bi bi-arrow-right"></i> CONTINUE TO PAYMENT';
  });

  /* === SPECIAL: UPI / PayPal === */
  if (radio.value === 'upi') {
    // hide both “continue” buttons – we’ll show PayPal instead
    allActionBtns.forEach(b => b.classList.add('d-none'));

    // lazy-load SDK (helper on window from EJS)
    if (typeof window.loadPayPalSdk === 'function') window.loadPayPalSdk();

    const selectedAddress = document.querySelector('input[name="deliveryAddress"]:checked');
    if (!selectedAddress) {
      Swal.fire({ icon: 'error', title: 'Missing Address', text: 'Please select a delivery address first' });
      allActionBtns.forEach(b => b.classList.remove('d-none'));
      return;
    }

    // get orderID from server THEN render buttons
    fetch('/paypal/create-order', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        deliveryAddressId: selectedAddress.value  // ✅ ADD THIS
      })
    })
    .then(r => r.json())
    .then(d => {
      paypalOrderId = d.orderID;           // PayPal order-id
      renderPayPalButtons(d.internalOrderId);
    })
    .catch(err => {
      console.error('PayPal create-order error', err);
      allActionBtns.forEach(b => b.classList.remove('d-none'));
      Swal.fire({ icon: 'error', title: 'Payment Error', text: 'Unable to start PayPal.' });
    });
  } else {
    // any other payment → show the normal buttons
    allActionBtns.forEach(b => b.classList.remove('d-none'));
  }

  console.log(`💳 Payment method selected: ${radio.value}`);
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

  let progressInterval;
  let validationSwal;
  
  try {
    // ✅ FIXED: Step 1 - Show validation progress and auto-close when done
    validationSwal = Swal.fire({
      title: 'Validating Order',
      html: `
        <div class="custom-loader-container">
          <div class="custom-progress-bar">
            <div class="custom-progress-fill" id="progress-fill"></div>
          </div>
          <p class="custom-progress-text" id="progress-text">Checking item availability...</p>
        </div>
      `,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: {
        popup: 'custom-progress-popup'
      },
      didOpen: () => {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        let progress = 0;
        
        progressInterval = setInterval(() => {
          progress += Math.random() * 8 + 2; // Slower, more realistic progress
          if (progress > 95) progress = 95; // Don't complete until validation is done
          
          progressFill.style.width = progress + '%';
          
          if (progress >= 20 && progress < 50) {
            progressText.textContent = 'Validating cart items...';
          } else if (progress >= 50 && progress < 80) {
            progressText.textContent = 'Checking stock availability...';
          } else if (progress >= 80) {
            progressText.textContent = 'Almost ready...';
          }
        }, 300);
      }
    });

    // ✅ FIXED: Run validation in parallel with progress animation
    const validationPromise = validateCheckoutStock();
    
    // Wait for both the visual delay and actual validation
    const [, validationResult] = await Promise.all([
      new Promise(resolve => setTimeout(resolve, 2000)), // Minimum 2 seconds for UX
      validationPromise
    ]);

    // Complete the progress bar
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (progressFill) {
      progressFill.style.width = '100%';
      progressText.textContent = 'Validation complete!';
    }

    // Wait a moment to show completion
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear interval and close validation modal
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    Swal.close();

    // Check validation results
    if (!validationResult.success) {
      throw validationResult;
    }
    
    if (validationResult.checkoutEligibleItems === 0 || 
        (validationResult.validationResults && validationResult.validationResults.validItems.length === 0)) {
      throw { errorMessage: 'No items available for checkout.', ...validationResult };
    }

    // ✅ FIXED: Step 2 - Payment processing with proper flow
    const paymentSwal = Swal.fire({
      title: pay.value === 'wallet' ? 'Processing Wallet Payment' : 'Processing Payment',
      html: `
        <div class="payment-processing-container">
          <div class="payment-icon-container">
            <i class="bi ${pay.value === 'wallet' ? 'bi-wallet2' : 'bi-credit-card'} payment-processing-icon"></i>
          </div>
          <div class="custom-progress-bar">
            <div class="custom-progress-fill payment-progress" id="payment-progress"></div>
          </div>
          <p class="custom-progress-text" id="payment-text">
            ${pay.value === 'wallet' ? 'Deducting from wallet...' : 'Processing payment...'}
          </p>
          <div class="processing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      `,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: {
        popup: 'custom-payment-popup'
      },
      didOpen: () => {
        const paymentProgress = document.getElementById('payment-progress');
        const paymentText = document.getElementById('payment-text');
        let progress = 0;
        
        progressInterval = setInterval(() => {
          progress += Math.random() * 6 + 2;
          if (progress > 95) progress = 95; // Don't complete until API call is done
          
          paymentProgress.style.width = progress + '%';
          
          if (pay.value === 'wallet') {
            if (progress >= 30 && progress < 60) {
              paymentText.textContent = 'Validating wallet balance...';
            } else if (progress >= 60 && progress < 85) {
              paymentText.textContent = 'Deducting amount...';
            } else if (progress >= 85) {
              paymentText.textContent = 'Finalizing transaction...';
            }
          } else {
            if (progress >= 30 && progress < 60) {
              paymentText.textContent = 'Contacting payment gateway...';
            } else if (progress >= 60 && progress < 85) {
              paymentText.textContent = 'Confirming payment...';
            } else if (progress >= 85) {
              paymentText.textContent = 'Almost done...';
            }
          }
        }, 200);
      }
    });

    // Actual order placement
    const orderPromise = fetch('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        deliveryAddressId: addr.value, 
        paymentMethod: pay.value 
      })
    });

    // Wait for both animation and API call
    const [, response] = await Promise.all([
      new Promise(resolve => setTimeout(resolve, 1500)), // Minimum 1.5 seconds
      orderPromise
    ]);

    const data = await response.json();

    // Complete payment progress
    const paymentProgress = document.getElementById('payment-progress');
    const paymentText = document.getElementById('payment-text');
    if (paymentProgress) {
      paymentProgress.style.width = '100%';
      paymentText.textContent = 'Payment successful!';
    }

    // Wait to show completion
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear interval and close payment modal
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    Swal.close();

    if (!response.ok || !data.success) {
      throw data;
    }

    // ✅ NEW: Step 3 - Success animation with auto-redirect
    let redirectTimer;
    let countdownInterval;
    
    await Swal.fire({
      title: 'Payment Successful!',
      html: `
        <div class="custom-success-container">
          <div class="success-checkmark-container">
            <svg class="success-checkmark" viewBox="0 0 52 52">
              <circle class="success-checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
              <path class="success-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
          <div class="success-details">
            <h4 class="success-amount">₹${data.totalAmount ? data.totalAmount.toLocaleString('en-IN') : window.orderTotal.toLocaleString('en-IN')}</h4>
            <p class="success-method">${pay.value === 'wallet' ? 'Deducted from wallet' : 'Payment completed'}</p>
            <p class="success-order">Order #${data.orderId || 'Confirmed'}</p>
          </div>
          <div class="auto-redirect-info">
            <p class="redirect-text">Redirecting in <span id="countdown">2</span> seconds...</p>
          </div>
        </div>
      `,
      confirmButtonText: '<i class="bi bi-eye me-2"></i>View Order Details',
      confirmButtonColor: '#28a745',
      allowOutsideClick: false,
      customClass: {
        popup: 'custom-success-popup'
      },
      didOpen: () => {
        // Existing checkmark animation
        const circle = document.querySelector('.success-checkmark-circle');
        const check = document.querySelector('.success-checkmark-check');
        
        if (circle && check) {
          circle.style.strokeDasharray = '166';
          circle.style.strokeDashoffset = '166';
          circle.style.animation = 'success-circle-draw 0.6s ease-out forwards';
          
          setTimeout(() => {
            check.style.strokeDasharray = '48';
            check.style.strokeDashoffset = '48';
            check.style.animation = 'success-check-draw 0.3s ease-out forwards';
          }, 600);

          setTimeout(() => {
            const container = document.querySelector('.success-checkmark-container');
            if (container) {
              container.style.animation = 'success-bounce 0.4s ease-out';
            }
          }, 900);
        }

        // ✅ NEW: Auto-redirect countdown
        const countdownElement = document.getElementById('countdown');
        let countdown = 2;
        
        countdownInterval = setInterval(() => {
          countdown--;
          if (countdownElement) {
            countdownElement.textContent = countdown;
          }
          
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            Swal.close();
          }
        }, 1000);

        // ✅ NEW: Auto-redirect timer
        redirectTimer = setTimeout(() => {
          clearInterval(countdownInterval);
          Swal.close();
        }, 2000);

        // ✅ NEW: Clear timer if user clicks button early
        const confirmButton = Swal.getConfirmButton();
        if (confirmButton) {
          confirmButton.addEventListener('click', () => {
            clearTimeout(redirectTimer);
            clearInterval(countdownInterval);
          });
        }
      },
      preConfirm: () => {
        // Clear timers when button is clicked
        if (redirectTimer) {
          clearTimeout(redirectTimer);
        }
        if (countdownInterval) {
          clearInterval(countdownInterval);
        }
      }
    }).then((result) => {
      // Redirect regardless of how the modal was dismissed
      window.location.href = data.redirectUrl;
    });

  } catch (err) {
    console.error('Order error:', err);
    
    // Clear any running intervals
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // Close any open Swal modals
    Swal.close();
    
    // Enhanced error handling
    if (err.code === 'INSUFFICIENT_WALLET_BALANCE') {
      Swal.fire({
        icon: 'error',
        title: 'Insufficient Wallet Balance',
        html: `
          <p>${err.message}</p>
          <p>Please add money to your wallet or choose another payment method.</p>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-wallet2 me-1"></i> Add Money',
        cancelButtonText: 'Choose Another Payment',
        confirmButtonColor: '#28a745'
      }).then((result) => {
        if (result.isConfirmed) {
          window.open('/profile/wallet', '_blank');
        }
      });
    } else if (err.code === 'STOCK_VALIDATION_FAILED') {
      showCheckoutValidationError(err);
    } else {
      Swal.fire({ 
        icon: 'error', 
        title: 'Order Failed', 
        text: err.message || 'Failed to place order. Please try again.',
        confirmButtonColor: '#dc3545'
      });
    }
  } finally {
    // Final cleanup
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
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
