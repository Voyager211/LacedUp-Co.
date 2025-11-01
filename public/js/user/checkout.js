console.log('🛒 Checkout JavaScript loaded');

// Global variables
window.currentEditingId = null;
let checkoutAddresses = [];
let orderTotal = 0;


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
    return { success: false, message: 'Failed to validate cart items. Please try again.' };
  }
}

function showCheckoutValidationError(v) {
  console.log('Showing checkout validation error:', v);
  const msg = v.message || 'Some items in your cart are no longer available';

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
    
    if (v.validationResults) {
      console.log('\n📊 Validation Arrays:');
      console.log('   ✅ validItems:', v.validationResults.validItems?.length || 0);
      console.log('   ❌ invalidItems:', v.validationResults.invalidItems?.length || 0);
    }
    
    const hasIssues = !v.success || (v.validationResults && v.validationResults.invalidItems?.length > 0);
    
    console.log('\n🎯 Final Decision:');
    console.log('   hasIssues:', hasIssues);
    
    if (hasIssues) {
      console.log('❌ Triggering error modal in 1 second...');
      setTimeout(() => showCheckoutValidationError(v), 1000);
    } else {
      console.log('✅ Checkout validation PASSED');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (err) {
    console.error('❌ [FRONTEND] Error validating checkout on load:', err);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}


/* ========= UI HELPER FUNCTIONS ========= */
function selectAddress(radio) {
  document.querySelectorAll('.address-card').forEach(c => c.classList.remove('selected'));
  radio.closest('.address-card').classList.add('selected');
}

function selectPayment(radio) {
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  radio.closest('.payment-option').classList.add('selected');

  const allActionBtns = document.querySelectorAll('.btn-continue');
  allActionBtns.forEach(b => b.classList.remove('d-none'));

  // Update button text for COD
  allActionBtns.forEach(btn => {
    btn.className = 'btn-continue';
    if (radio.value === 'cod') {
      btn.innerHTML = '<i class="bi bi-check-circle"></i> PLACE ORDER';
    } else {
      btn.innerHTML = '<i class="bi bi-arrow-right"></i> CONTINUE TO PAYMENT';
    }
  });

  console.log(`Payment method selected: ${radio.value}`);
}


/* ========= ADDRESS MODAL FUNCTIONS ========= */
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


/* ========= ORDER PLACEMENT ========= */
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

  // Address validation
  if (!addr.value || addr.value.trim() === '') {
    Swal.fire({
      icon: 'error',
      title: 'Invalid Address',
      text: 'Please select a valid delivery address'
    });
    return;
  }

  const deliveryAddressId = addr.value;
  const addressIndex = addr.dataset.addressIndex;
  const paymentMethod = pay.value;

  console.log(`💳 Payment method selected: ${paymentMethod}`);
  console.log(`📍 Address: ${deliveryAddressId}, Index: ${addressIndex}`);

  // ✅ Route to correct handler based on payment method
  switch(paymentMethod) {
    case 'cod':
      return await handleCODOrder(deliveryAddressId, addressIndex);
    
    case 'upi':
      return await handleUPIPayment(deliveryAddressId, addressIndex);
    
    case 'card':
    case 'netbanking':
    case 'wallet':
    case 'paypal':
      Swal.fire({
        icon: 'info',
        title: 'Coming Soon',
        text: `${paymentMethod.toUpperCase()} payment will be available soon`,
        confirmButtonColor: '#007bff'
      });
      return;
    
    default:
      Swal.fire({
        icon: 'error',
        title: 'Invalid Payment Method',
        text: 'Please select a valid payment method'
      });
  }
}

async function handleCODOrder(deliveryAddressId, addressIndex) {
  try {
    // Show loading
    Swal.fire({
      title: 'Processing Order',
      html: 'Please wait while we process your order...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('📦 Processing COD order...');
    
    const requestPayload = { 
      deliveryAddressId, 
      addressIndex: parseInt(addressIndex),
      paymentMethod: 'cod' 
    };
    console.log('COD payment request payload:', requestPayload);

    const response = await fetch('/checkout/place-order', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    const data = await response.json();
    console.log('COD payment response:', data);

    Swal.close();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to place order');
    }

    console.log('✅ Order placed successfully');
    
    // Redirect to success page
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    } else {
      window.location.href = `/checkout/order-success/${data.orderId}`;
    }

  } catch (error) {
    console.error('❌ COD payment error:', error);
    Swal.fire({ 
      icon: 'error', 
      title: 'Order Processing Error', 
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}

// Handle UPI Payment
async function handleUPIPayment(deliveryAddressId, addressIndex) {
  try {
    // Show loading
    Swal.fire({
      title: 'Processing Payment',
      html: 'Please wait while we prepare your payment gateway...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('💳 Processing UPI payment...');

    // Step 1: Create Razorpay order
    console.log('📡 Creating Razorpay order...');
    const createOrderResponse = await fetch('/checkout/create-razorpay-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryAddressId,
        addressIndex: parseInt(addressIndex),
        paymentMethod: 'upi'
      })
    });

    const createOrderData = await createOrderResponse.json();
    console.log('✅ Razorpay order created:', createOrderData);

    if (!createOrderResponse.ok || !createOrderData.success) {
      throw new Error(createOrderData.message || 'Failed to create payment order');
    }

    Swal.close();

    // Step 2: Open Razorpay Checkout
    const options = {
      key: createOrderData.data.keyId,
      amount: createOrderData.data.amount, // in paise
      currency: createOrderData.data.currency,
      order_id: createOrderData.data.razorpayOrderId,
      name: 'LacedUp',
      description: createOrderData.data.description,
      customer_details: {
        name: createOrderData.data.userName,
        email: createOrderData.data.userEmail,
        contact: createOrderData.data.userPhone
      },
      handler: async function (response) {
        console.log('✅ Payment successful from Razorpay:', response);
        await verifyRazorpayPayment(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature
        );
      },
      prefill: {
        name: createOrderData.data.userName,
        email: createOrderData.data.userEmail,
        contact: createOrderData.data.userPhone
      },
      notes: {
        deliveryAddressId: deliveryAddressId,
        addressIndex: addressIndex
      },
      theme: {
        color: '#000000'
      },
      modal: {
        // ✅ Handle modal close (manual dismiss)
        ondismiss: async function () {
          console.log('❌ Payment modal closed by user or payment failed');
          
          try {
            const failureResponse = await fetch('/checkout/payment-failure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: createOrderData.data.razorpayOrderId,
                error: {
                  description: 'Payment cancelled by user',
                  reason: 'User closed the payment modal'
                }
              })
            });
            
            const failureData = await failureResponse.json();
            console.log('📍 Payment failure handled:', failureData);

            if (failureData.success && failureData.data.redirectUrl) {
              window.location.href = failureData.data.redirectUrl;
            } else {
              window.location.href = '/checkout/order-failure/' + createOrderData.data.razorpayOrderId;
            }
          } catch (error) {
            console.error('❌ Error handling payment cancellation:', error);
            window.location.href = '/checkout/order-failure/' + createOrderData.data.razorpayOrderId;
          }
        }
      }
    };

    console.log('🚀 Opening Razorpay checkout...');
    const rzp1 = new Razorpay(options);
    
    // ✅ THE MISSING PIECE: Catch payment failures from the gateway
    rzp1.on('payment.failed', async function(response) {
      try {
        console.error('❌ Payment failed:', response.error);
        
        await fetch('/checkout/payment-failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpayOrderId: createOrderData.data.razorpayOrderId,
            error: {
              description: response.error.description || 'Payment failed',
              reason: response.error.reason || 'Unknown error'
            }
          })
        });

        // Redirect to failure page
        window.location.href = '/checkout/order-failure/' + createOrderData.data.razorpayOrderId;
      } catch (error) {
        console.error('Error handling payment failure:', error);
        window.location.href = '/checkout/order-failure/' + createOrderData.data.razorpayOrderId;
      }
    });
    
    rzp1.open();

  } catch (error) {
    console.error('❌ UPI payment error:', error);
    
    // Handle payment creation failure
    try {
      const failureResponse = await fetch('/checkout/payment-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: `ERR-${Date.now()}`,
          error: {
            description: error.message,
            reason: 'Failed to create payment order'
          }
        })
      });

      const failureData = await failureResponse.json();
      if (failureData.success && failureData.data.redirectUrl) {
        window.location.href = failureData.data.redirectUrl;
      } else {
        window.location.href = '/checkout/order-failure/' + `ERR-${Date.now()}`;
      }
    } catch (failureError) {
      console.error('❌ Error logging payment failure:', failureError);
      Swal.fire({
        icon: 'error',
        title: 'Payment Error',
        text: error.message,
        confirmButtonColor: '#dc3545'
      });
    }
  }
}





// Verify Razorpay Payment
async function verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  try {
    Swal.fire({
      title: 'Verifying Payment',
      html: 'Please wait while we verify your payment...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    console.log('🔐 Verifying payment signature...');

    const response = await fetch('/checkout/verify-razorpay-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      })
    });

    const data = await response.json();
    console.log('✅ Payment verification response:', data);

    Swal.close();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Payment verification failed');
    }

    console.log('✅ Payment verified successfully');

    // Redirect to success page
    if (data.data.redirectUrl) {
      window.location.href = data.data.redirectUrl;
    } else {
      window.location.href = `/checkout/order-success/${data.data.orderId}`;
    }

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Payment Verification Failed',
      text: error.message,
      confirmButtonColor: '#dc3545'
    });
  }
}

function placeOrder() { 
  proceedToPayment(); 
}


/* ========= ADDRESS FORM HANDLING ========= */
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


/* ========= ADDRESS RENDERING ========= */
async function loadCheckoutAddresses() {
  try {
    console.log('🔄 Loading addresses for checkout...');
    
    const response = await fetch('/checkout/api/addresses');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Addresses data:', data);

    if (data && data.success) {
      checkoutAddresses = data.addresses || [];
      console.log(`✅ Addresses loaded: ${checkoutAddresses.length} addresses`);
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
        <input type="radio" 
               name="deliveryAddress" 
               value="${address._id}" 
               data-address-index="${index}"
               ${index === 0 ? 'checked' : ''} 
               onclick="selectAddress(this)">
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


/* ========= COUPON FUNCTIONALITY ========= */

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

  try {
    console.log('Loading available coupons...')

    window.couponState.isLoading = true;
    showModalState('loading');

    // Get current order total
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

function showModalState(state) {
  const loadingDiv = document.getElementById('coupons-loading');
  const containerDiv = document.getElementById('available-coupons-container');
  const noCouponsDiv = document.getElementById('no-coupons-found');
  const errorDiv = document.getElementById('coupons-error');

  [loadingDiv, containerDiv, noCouponsDiv, errorDiv].forEach(div => {
    if (div) div.classList.add('d-none');
  });

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
    
    const discountLabel = coupon.discountType === 'percentage'
      ? `${coupon.discountValue}% OFF`
      : `FLAT ₹${coupon.discountValue} OFF`;

    const badgeLabel = coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `FLAT OFF`;
    
    const cardClass = !isApplicable ? 'coupon-disabled' : 'coupon-eligible';
    const badgeClass = isApplicable ? 'coupon-badge-active' : '';

    html += `
    <div class="coupon-card-modern ${cardClass}" ${isApplicable ? `onclick="applyCouponFromModal('${coupon.code}')" style="cursor:pointer;"` : ''}>
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
  console.log(`✅ Rendered ${coupons.length} coupons in modal`);
}

function applyCouponFromModal(couponCode) {
  console.log('Applying coupon from modal:', couponCode);

  if(!couponCode) {
    console.error('No coupon code provided');
    return;
  }

  try {
    const couponInput = document.getElementById('couponCode');
    if (couponInput) {
      couponInput.value = couponCode.toUpperCase();
    }

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

async function applyCoupon() {
  const couponCodeInput = document.getElementById('couponCode');
  const applyBtn = document.getElementById('applyCouponBtn');

  if (!couponCodeInput || !applyBtn) {
    console.error('Coupon input elements not found');
    toastr.error('Coupon form elements not found');
    return;
  }

  const couponCode = couponCodeInput.value.trim().toUpperCase();

  if (!couponCode) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Please enter a coupon code',
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: true,
      confirmButtonText: 'Close'
    });
    couponCodeInput.focus();
    return;
  }

  try {
    console.log('Applying coupon:', couponCode);

    setApplyButtonLoading(true);

    const currentTotal = window.orderTotal || 0;

    if (currentTotal <= 0) {
      throw new Error('Invalid order total. Please refresh and try again');
    }

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
      window.couponState.appliedCoupon = data.data.appliedCoupon;

      showAppliedCouponUI(data.data.appliedCoupon);
      
      if (data.data.orderSummary) {
        updateOrderSummaryUI(data.data.orderSummary);
      } else {
        console.warn('⚠️ No orderSummary in response, manually updating');

        const couponRow = document.getElementById('coupon-discount-row');
        const discountAmount = document.getElementById('discount-amount');
        if (couponRow && data.data.appliedCoupon.discountAmount) {
          couponRow.style.display = 'flex';
          if (discountAmount) {
            discountAmount.textContent = data.data.appliedCoupon.discountAmount.toFixed(2);
          }
        }
      }

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: data.message || 'Coupon applied successfully!',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });

      // Clear input
      couponCodeInput.value = '';

    } else {
      throw new Error(data.message || 'Failed to apply coupon');
    }

  } catch (error) {
    console.error('Error applying coupon:', error);
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


async function removeCoupon() {
  const removeBtn = document.getElementById('removeCouponBtn');

  if (!removeBtn) {
    console.error('Remove coupon button not found');
    return;
  }

  try {
    console.log('Removing applied coupon');

    setRemoveButtonLoading(true);

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

      showCouponFormUI();
      
      if (data.data.orderSummary) {
        updateOrderSummaryUI(data.data.orderSummary);
      } else {
        console.warn('⚠️ No orderSummary in response, manually hiding coupon');
        const couponRow = document.getElementById('coupon-discount-row');
        if (couponRow) {
          couponRow.style.display = 'none';
        }
      }

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

  console.log('✅ Applied coupon UI updated');
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
  console.log('📊 Updating order summary UI with:', orderSummary);
  
  if (!orderSummary) {
    console.warn('No order summary provided to updateOrderSummaryUI');
    return;
  }

  const subtotalEl = document.getElementById('subtotal-amount');
  if (subtotalEl && orderSummary.subtotal !== undefined) {
    subtotalEl.textContent = orderSummary.subtotal.toFixed(2);
    console.log('Subtotal updated:', orderSummary.subtotal);
  }

  const couponRow = document.getElementById('coupon-discount-row');
  const discountAmountSpan = document.getElementById('discount-amount');
  const couponCodeLabel = document.getElementById('coupon-code-label');
  
  if (orderSummary.couponDiscount && orderSummary.couponDiscount > 0) {
    if (couponRow) {
      couponRow.style.display = 'flex';
      console.log('Showing coupon discount row');
    }
    
    if (discountAmountSpan) {
      discountAmountSpan.textContent = orderSummary.couponDiscount.toFixed(2);
      console.log('Coupon discount amount updated:', orderSummary.couponDiscount);
    }
    
    // Update coupon code label if available
    if (couponCodeLabel && window.couponState?.appliedCoupon?.code) {
      couponCodeLabel.textContent = `(${window.couponState.appliedCoupon.code})`;
    }
    
  } else {
    // Hide coupon discount row
    if (couponRow) {
      couponRow.style.display = 'none';
      console.log('Hiding coupon discount row');
    }
    
    // Clear coupon code label
    if (couponCodeLabel) {
      couponCodeLabel.textContent = '';
    }
  }

  // Update final total
  const finalTotal = orderSummary.finalTotal || orderSummary.total || 0;
  window.orderTotal = finalTotal;
  
  const totalElements = document.querySelectorAll('.order-total, #final-total, .final-amount');
  totalElements.forEach(el => {
    if (el) {
      el.textContent = finalTotal.toFixed(2);
    }
  });
  
  console.log('Order summary UI fully updated - Final Total:', finalTotal);
}



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

function initializeCouponEventListeners () {
  console.log('Initializing coupon event listeners...');

  const applyCouponBtn = document.getElementById('applyCouponBtn');
  if(applyCouponBtn) {
    applyCouponBtn.addEventListener('click', applyCoupon);
    console.log('Apply coupon button listener added');
  } else {
    console.warn('Apply coupon button not found');
  }

  const removeCouponBtn = document.getElementById('removeCouponBtn');
  if (removeCouponBtn) {
    removeCouponBtn.addEventListener('click', removeCoupon);
    console.log('Remove coupon button listener added');
  }

  const couponInput = document.getElementById('couponCode');
  if (couponInput) {
    couponInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCoupon();
      }
    });

    couponInput.addEventListener('input', function(e) {
      e.target.value = e.target.value.toUpperCase();
    });

    console.log('Coupon input listeners added');
  }

  const viewCouponsBtn = document.getElementById('viewAvailableCouponsBtn');
  if (viewCouponsBtn) {
    viewCouponsBtn.addEventListener('click', showAvailableCouponsModal);
    console.log('✅ View coupons button listener added');
  }

  console.log('✅ Coupon event listeners initialized');
}




/* ========= DOM READY & INITIALIZATION ========= */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🛒 Checkout DOM ready');
  document.querySelector('.checkout-content')?.classList.remove('hidden');
  
  // Get order total
  const totalElement = document.querySelector('.summary-row.total .price-value');
  if (totalElement) {
    window.orderTotal = parseFloat(totalElement.textContent.replace(/[₹,]/g, '')) || 0;
    console.log(`💰 Order total set: ₹${window.orderTotal}`);
  }
  
  // Load addresses if container is empty
  const addressContainer = document.getElementById('addressContainer');
  const hasAddresses = addressContainer && addressContainer.children.length > 0 && !addressContainer.querySelector('.text-center');
  
  if (!hasAddresses) {
    loadCheckoutAddresses();
  } else {
    console.log('✅ Addresses already rendered server-side');
  }
  
  // Validate checkout after delay
  setTimeout(validateCheckoutOnLoad, 500);

  // Initialize coupon functionality
  initializeCouponEventListeners();

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

// Expose functions globally
window.selectPayment = selectPayment;
window.proceedToPayment = proceedToPayment;
window.showAddAddressModal = showAddAddressModal;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;

console.log('✅ Global functions exposed for onclick handlers');
console.log('✅ Checkout COD-only script loaded successfully');
