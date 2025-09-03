// Cart functionality for LacedUp
console.log('Cart.js: External script loaded');

// Global cart functions
let cartToastrConfigured = false;

// Configure Toastr when available
function configureToastr() {
  if (typeof toastr !== 'undefined' && !cartToastrConfigured) {
    toastr.options = {
      "closeButton": true,
      "debug": false,
      "newestOnTop": true,
      "progressBar": true,
      "positionClass": "toast-top-right",
      "preventDuplicates": true,
      "onclick": null,
      "showDuration": "500",
      "hideDuration": "1000",
      "timeOut": "6000",
      "extendedTimeOut": "2500",
      "showEasing": "swing",
      "hideEasing": "linear",
      "showMethod": "slideDown",
      "hideMethod": "slideUp",
      "maxOpened": 3,
      "tapToDismiss": true
    };
    cartToastrConfigured = true;
  }
}

// Safe toast function
function safeToast(type, message) {
  configureToastr();
  if (typeof toastr !== 'undefined' && typeof showToast !== 'undefined') {
    showToast[type](message);
  } else if (typeof toastr !== 'undefined') {
    toastr[type](message);
  } else {
    console.log(`${type.toUpperCase()}: ${message}`);
  }
}

// Update button states
function updateButtonStates(productId, variantId) {
  const cartItem = document.querySelector(`[data-product-id="${productId}"][data-variant-id="${variantId}"]`);
  if (!cartItem) return;

  const qtyButtons = cartItem.querySelectorAll('.qty-btn');
  const currentQty = parseInt(cartItem.querySelector('.qty-input').value);
  const isOutOfStock = cartItem.classList.contains('item-out-of-stock');
  const variantStock = parseInt(cartItem.dataset.variantStock || 0);

  qtyButtons[0].disabled = currentQty <= 1 || isOutOfStock;
  const isAtMaxQuantity = currentQty >= 5;
  const isAtStockLimit = currentQty >= variantStock;

  qtyButtons[1].disabled = isAtMaxQuantity || isAtStockLimit || isOutOfStock;

  if (isAtMaxQuantity) {
    qtyButtons[1].setAttribute('title', 'Maximum 5 items allowed per variant');
  } else if (isAtStockLimit) {
    qtyButtons[1].setAttribute('title', 'Not enough stock available for this size');
  } else if (isOutOfStock) {
    qtyButtons[1].setAttribute('title', 'This size is out of stock');
  } else {
    qtyButtons[1].removeAttribute('title');
  }
}

// Update cart counter
function updateCartCounter(count) {
  // Update navbar cart count if function is available
  if (window.updateNavbarCartCount) {
    window.updateNavbarCartCount(count);
  }
  
  // Fallback for local cart counter (if exists)
  const cartCounter = document.querySelector('#cartCount');
  if (cartCounter) {
    if (count > 0) {
      cartCounter.textContent = count;
      cartCounter.style.display = 'flex';
    } else {
      cartCounter.style.display = 'none';
    }
  }
}

// Update order summary section
function updateOrderSummary(cartSummary) {
  // Update cart title
  const cartTitle = document.querySelector('.cart-title');
  if (cartTitle) {
    cartTitle.textContent = `Cart (${cartSummary.totalItemCount})`;
  }

  // Update subtotal
  const subtotalValue = document.querySelector('.price-breakdown .price-row:first-child .price-value');
  if (subtotalValue) {
    subtotalValue.textContent = `₹${cartSummary.subtotal}`;
  }

  // Update subtotal label with item count
  const subtotalLabel = document.querySelector('.price-breakdown .price-row:first-child .price-label');
  if (subtotalLabel) {
    subtotalLabel.textContent = `Subtotal (${cartSummary.totalItemCount} items)`;
  }

  // Update discount if exists
  const discountValue = document.querySelector('.discount-row .price-value');
  if (discountValue && cartSummary.totalDiscount > 0) {
    discountValue.textContent = `₹${cartSummary.totalDiscount}`;
  }

  // Update shipping
  const shippingValue = document.querySelector('.price-breakdown .price-row:nth-last-child(2) .price-value');
  if (shippingValue) {
    if (cartSummary.shipping === 0) {
      shippingValue.innerHTML = '<span class="text-success fw-bold">FREE</span>';
    } else {
      shippingValue.textContent = `₹${cartSummary.shipping}`;
    }
  }

  // Update total
  const totalValue = document.querySelector('.total-row .price-value');
  if (totalValue) {
    totalValue.textContent = `₹${cartSummary.total}`;
  }
}

// Update cart item quantity
async function updateQuantity(productId, variantId, newQuantity) {
  console.log('updateQuantity called:', { productId, variantId, newQuantity });

  if (newQuantity < 1) {
    removeFromCart(productId, variantId);
    return;
  }

  if (newQuantity > 5) {
    safeToast('warning', 'Maximum limit reached! You can only add up to 5 items per variant');
    return;
  }

  const cartItem = document.querySelector(`[data-product-id="${productId}"][data-variant-id="${variantId}"]`);
  if (!cartItem) {
    safeToast('error', 'Cart item not found');
    return;
  }

  if (cartItem.dataset.updating === 'true') {
    return;
  }

  const variantStock = parseInt(cartItem.dataset.variantStock || 0);
  const isOutOfStock = cartItem.classList.contains('item-out-of-stock');
  const currentQuantity = parseInt(cartItem.querySelector('.qty-input').value);

  if (isOutOfStock || variantStock === 0) {
    safeToast('error', 'This size is currently out of stock');
    return;
  }

  if (newQuantity > currentQuantity && newQuantity > variantStock) {
    safeToast('warning', `Only ${variantStock} items available in stock for this size`);
    return;
  }

  try {
    cartItem.dataset.updating = 'true';

    const qtyButtons = cartItem.querySelectorAll('.qty-btn');
    qtyButtons.forEach(btn => {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i>';
    });

    const response = await fetch('/cart/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId, variantId, quantity: newQuantity })
    });

    const result = await response.json();

    if (result.success) {
      const qtyInput = cartItem.querySelector('.qty-input');
      const itemTotal = cartItem.querySelector('.item-total');

      qtyInput.value = newQuantity;
      itemTotal.textContent = `₹${Math.round(result.itemTotal)}`;

      if (window.fetchCartCount) {
        window.fetchCartCount();
      }
      updateButtonStates(productId, variantId);

      // ✅ ADD THIS HERE - Update order summary dynamically
      if (result.cartSummary) {
        updateOrderSummary(result.cartSummary);
      }

      safeToast('success', 'Quantity updated successfully');
    } else {
      if (result.code === 'OUT_OF_STOCK') {
        safeToast('error', 'This size is currently out of stock');
      } else if (result.code === 'INSUFFICIENT_STOCK') {
        safeToast('warning', `Only ${result.availableStock || 0} items available in stock for this size`);
      } else if (result.code === 'CART_QUANTITY_LIMIT') {
        safeToast('warning', 'Maximum limit reached! You can only add up to 5 items per variant');
      } else {
        safeToast('error', result.message || 'Failed to update quantity');
      }

      if (result.code === 'OUT_OF_STOCK' || result.code === 'INSUFFICIENT_STOCK') {
        if (result.availableStock !== undefined) {
          cartItem.dataset.variantStock = result.availableStock;
          if (result.availableStock === 0) {
            cartItem.classList.add('item-out-of-stock');
          }
          updateButtonStates(productId, variantId);
        }
      }
    }
  } catch (error) {
    console.error('Error updating quantity:', error);
    safeToast('error', 'Failed to update cart. Please try again');
  } finally {
    cartItem.dataset.updating = 'false';

    const qtyButtons = cartItem.querySelectorAll('.qty-btn');
    qtyButtons[0].innerHTML = '<i class="bi bi-dash"></i>';
    qtyButtons[1].innerHTML = '<i class="bi bi-plus"></i>';

    updateButtonStates(productId, variantId);

  }
}


// Remove item from cart
async function removeFromCart(productId, variantId) {
  console.log('removeFromCart called:', { productId, variantId });

  try {
    const response = await fetch('/cart/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId, variantId })
    });

    const data = await response.json();

    if (data.success) {
      const cartItem = document.querySelector(`[data-product-id="${productId}"][data-variant-id="${variantId}"]`);
      if (cartItem) {
        cartItem.style.transition = 'all 0.3s ease';
        cartItem.style.opacity = '0';
        cartItem.style.transform = 'translateX(-100%)';

        setTimeout(() => {
          cartItem.remove();

          const remainingItems = document.querySelectorAll('.cart-item-card');
          if (remainingItems.length === 0) {
            location.reload();
          }
        }, 300);
      }

      if (window.fetchCartCount) {
        window.fetchCartCount();
      }
      safeToast('success', 'Item removed from cart');
    } else {
      safeToast('error', data.message || 'Failed to remove item');
    }
  } catch (error) {
    console.error('Error removing item:', error);
    safeToast('error', 'Failed to remove item. Please try again');
  }
}

// Clear entire cart
async function clearCart() {
  console.log('clearCart called');

  try {
    const response = await fetch('/cart/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();

    if (data.success) {
      if (window.fetchCartCount) {
        window.fetchCartCount();
      }
      safeToast('success', 'Cart cleared successfully');
      setTimeout(() => {
        location.reload();
      }, 1000);
    } else {
      safeToast('error', data.message || 'Failed to clear cart');
    }
  } catch (error) {
    console.error('Error clearing cart:', error);
    safeToast('error', 'Failed to clear cart. Please try again');
  }
}

// Validate cart stock before operations
async function validateCartStock() {
  try {
    console.log('Validating cart stock...');
    const response = await fetch('/cart/validate-stock', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    const result = await response.json();
    console.log('Full validation response:', result);
    console.log('Response success:', result.success);
    console.log('Response allValid:', result.allValid);
    console.log('Response errorMessage:', result.errorMessage);
    console.log('Response invalidItems:', result.invalidItems);
    
    return result;
  } catch (error) {
    console.error('Error validating cart stock:', error);
    return { success: false, allValid: false, errorMessage: 'Failed to validate cart stock' };
  }
}

// Reset cart item quantity to 1
async function resetCartItemQuantity(productId, variantId) {
  try {
    console.log('Resetting cart item quantity to 1:', { productId, variantId });
    
    const response = await fetch('/cart/reset-quantity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId, variantId })
    });

    const result = await response.json();
    
    if (result.success) {
      // ✅ FIND THE CART ITEM FIRST
      const cartItem = document.querySelector(`[data-product-id="${productId}"][data-variant-id="${variantId}"]`);
      if (cartItem) {
        const qtyInput = cartItem.querySelector('.qty-input');
        const itemTotal = cartItem.querySelector('.item-total');
        
        // ✅ RESET TO 1, NOT newQuantity
        qtyInput.value = 1;
        itemTotal.textContent = `₹${Math.round(result.itemTotal)}`;
        
        updateButtonStates(productId, variantId);
        updateCartCounter(result.cartCount);
        
        // ✅ UPDATE ORDER SUMMARY (this part is correct)
        if (result.cartSummary) {
          updateOrderSummary(result.cartSummary);
        }
      }
      
      // ✅ CORRECT SUCCESS MESSAGE
      safeToast('success', 'Item quantity reset to 1');
      return true;
    } else {
      safeToast('error', result.message || 'Failed to reset quantity');
      return false;
    }
  } catch (error) {
    console.error('Error resetting cart item quantity:', error);
    safeToast('error', 'Failed to reset quantity. Please try again');
    return false; // ✅ ADD THIS
  }
}


// Show stock validation error with SweetAlert
function showStockValidationError(validation) {
  console.log('Showing stock validation error:', validation);
  
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'Stock Validation Failed',
      html: validation.errorMessage.replace(/\n/g, '<br>'),
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'Fix Cart Issues',
      showCancelButton: true,
      cancelButtonText: 'Continue Shopping',
      cancelButtonColor: '#6c757d',
      width: '600px'
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Reset quantities for items that exceed stock
        if (validation.invalidItems && validation.invalidItems.length > 0) {
          let resetPromises = [];
          
          for (const item of validation.invalidItems) {
            if (item.availableStock !== undefined && item.quantity > item.availableStock) {
              // Find the cart item and reset its quantity
              const cartItems = document.querySelectorAll('.cart-item-card');
              for (const cartItem of cartItems) {
                const productName = cartItem.querySelector('.product-name')?.textContent?.trim();
                const size = cartItem.querySelector('.spec-item')?.textContent?.includes('Size:') ? 
                  cartItem.querySelector('.spec-item')?.textContent?.split('Size:')[1]?.trim() : '';
                
                if (productName === item.productName && size === item.size) {
                  const productId = cartItem.dataset.productId;
                  const variantId = cartItem.dataset.variantId;
                  
                  if (productId && variantId) {
                    resetPromises.push(resetCartItemQuantity(productId, variantId));
                  }
                  break;
                }
              }
            }
          }
          
          if (resetPromises.length > 0) {
            await Promise.all(resetPromises);
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        } else {
          // Just reload the page to show updated cart
          window.location.reload();
        }
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        window.location.href = '/shop';
      }
    });
  } else {
    alert(validation.errorMessage);
    window.location.reload();
  }
}

// Proceed to checkout with validation
async function proceedToCheckout() {
  console.log('🛒 Enhanced checkout process starting...');

  const availableItems = document.querySelectorAll('.cart-item-card:not(.item-out-of-stock)');
  const outOfStockItems = document.querySelectorAll('.cart-item-card.item-out-of-stock');

  if (availableItems.length === 0) {
    await handleEmptyOrInvalidCart(outOfStockItems.length);
    return;
  }

  // Enhanced loading with better UX
  const checkoutSwal = Swal.fire({
    title: 'Preparing Checkout',
    html: `
      <div class="checkout-progress">
        <div class="progress mb-3">
          <div class="progress-bar progress-bar-animated" role="progressbar" style="width: 0%"></div>
        </div>
        <p id="checkout-status">Validating cart items...</p>
      </div>
    `,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      // Animate progress bar
      const progressBar = Swal.getHtmlContainer().querySelector('.progress-bar');
      const statusText = Swal.getHtmlContainer().querySelector('#checkout-status');
      
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = `${progress}%`;
        
        if (progress >= 50) {
          statusText.textContent = 'Checking stock availability...';
        }
        if (progress >= 80) {
          statusText.textContent = 'Almost ready...';
        }
        if (progress >= 100) {
          clearInterval(interval);
        }
      }, 200);
    }
  });

  try {
    // Validate cart with enhanced error handling
    const validation = await validateCartStock();
    
    Swal.close();

    if (!validation.success || !validation.allValid) {
      await showEnhancedValidationError(validation);
      return;
    }

    // Additional checkout-specific validation
    const checkoutValidation = await fetch('/checkout/validate-checkout-stock');
    const checkoutData = await checkoutValidation.json();
    
    if (!checkoutData.success || checkoutData.checkoutEligibleItems === 0) {
      await showCheckoutSpecificError(checkoutData);
      return;
    }

    // All validation passed - proceed to checkout
    console.log('✅ All validations passed, proceeding to checkout');
    window.location.href = '/cart/checkout';

  } catch (error) {
    console.error('❌ Error during enhanced checkout validation:', error);
    Swal.close();
    
    await Swal.fire({
      icon: 'error',
      title: 'Checkout Error',
      html: `
        <p>We encountered an issue preparing your checkout.</p>
        <p><strong>What you can try:</strong></p>
        <ul class="text-start mt-2">
          <li>Refresh the page and try again</li>
          <li>Check your internet connection</li>
          <li>Clear your browser cache</li>
        </ul>
      `,
      confirmButtonText: 'Try Again',
      confirmButtonColor: '#007bff'
    });
  }
}

// Handle empty or invalid cart scenarios
async function handleEmptyOrInvalidCart(outOfStockCount) {
  if (outOfStockCount > 0) {
    // Cart has only out-of-stock items
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Cannot Proceed to Checkout',
      html: `
        <div class="text-center">
          <p>All items in your cart are currently out of stock.</p>
          <div class="my-3 p-3 bg-light rounded">
            <strong>Your Options:</strong>
            <ul class="text-start mt-2 mb-0">
              <li>Remove out-of-stock items and add available products</li>
              <li>Save items to wishlist for later</li>
              <li>Continue shopping for alternatives</li>
            </ul>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Remove Out of Stock Items',
      cancelButtonText: 'Continue Shopping',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#007bff',
      width: 600
    });

    if (result.isConfirmed) {
      await removeAllOutOfStockItems();
    } else {
      window.location.href = '/shop';
    }
  } else {
    // Completely empty cart
    const result = await Swal.fire({
      icon: 'info',
      title: 'Empty Cart',
      html: `
        <div class="text-center">
          <i class="bi bi-cart-x" style="font-size: 3rem; color: #6c757d; margin-bottom: 1rem;"></i>
          <p>Your cart is empty. Let's find some great products for you!</p>
        </div>
      `,
      confirmButtonText: 'Start Shopping',
      confirmButtonColor: '#007bff'
    });

    window.location.href = '/shop';
  }
}

// validation error display
async function showEnhancedValidationError(validation) {
  let errorHtml = '<div class="validation-errors text-start">';
  
  if (validation.outOfStockItems && validation.outOfStockItems.length > 0) {
    errorHtml += `
      <div class="error-section mb-3">
        <h6 class="text-warning"><i class="bi bi-exclamation-triangle me-2"></i>Out of Stock Items:</h6>
        <ul class="mb-0">
    `;
    
    validation.outOfStockItems.forEach(item => {
      errorHtml += `<li>${item.productName}${item.size ? ` (${item.size})` : ''}</li>`;
    });
    
    errorHtml += '</ul></div>';
  }
  
  if (validation.invalidItems && validation.invalidItems.length > 0) {
    errorHtml += `
      <div class="error-section mb-3">
        <h6 class="text-danger"><i class="bi bi-x-circle me-2"></i>Unavailable Items:</h6>
        <ul class="mb-0">
    `;
    
    validation.invalidItems.forEach(item => {
      errorHtml += `<li>${item.productName}${item.size ? ` (${item.size})` : ''} - ${item.reason}</li>`;
    });
    
    errorHtml += '</ul></div>';
  }
  
  errorHtml += '</div>';
  
  const result = await Swal.fire({
    icon: 'error',
    title: 'Cart Issues Found',
    html: `
      <p>We found some issues with items in your cart:</p>
      ${errorHtml}
      <div class="mt-3 p-3 bg-light rounded">
        <strong>We can help fix these issues automatically.</strong>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Fix Issues Automatically',
    cancelButtonText: 'Fix Manually',
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#007bff',
    width: 700
  });

  if (result.isConfirmed) {
    await autoFixCartIssues(validation);
  } else {
    // User wants to fix manually - stay on cart page
    window.location.reload();
  }
}

// Auto-fix cart issues
async function autoFixCartIssues(validation) {
  Swal.fire({
    title: 'Fixing Cart Issues',
    html: 'Please wait while we resolve the cart issues...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    let fixedCount = 0;
    
    // Remove completely unavailable items
    if (validation.invalidItems && validation.invalidItems.length > 0) {
      for (const item of validation.invalidItems) {
        if (!item.reason.includes('stock')) {
          // This item is completely unavailable, remove it
          const cartItem = findCartItemByName(item.productName, item.size);
          if (cartItem) {
            const productId = cartItem.dataset.productId;
            const variantId = cartItem.dataset.variantId;
            await removeFromCart(productId, variantId);
            fixedCount++;
          }
        }
      }
    }
    
    // Reset quantities for overstocked items
    if (validation.outOfStockItems && validation.outOfStockItems.length > 0) {
      for (const item of validation.outOfStockItems) {
        if (item.availableStock !== undefined && item.availableStock > 0) {
          const cartItem = findCartItemByName(item.productName, item.size);
          if (cartItem) {
            const productId = cartItem.dataset.productId;
            const variantId = cartItem.dataset.variantId;
            await updateQuantity(productId, variantId, Math.min(item.availableStock, 5));
            fixedCount++;
          }
        }
      }
    }
    
    Swal.close();
    
    if (fixedCount > 0) {
      await Swal.fire({
        icon: 'success',
        title: 'Cart Issues Fixed!',
        html: `
          <p>We successfully resolved <strong>${fixedCount}</strong> cart issue${fixedCount > 1 ? 's' : ''}.</p>
          <p>You can now proceed to checkout with your available items.</p>
        `,
        confirmButtonText: 'Continue to Checkout',
        confirmButtonColor: '#28a745'
      });
      
      // Proceed to checkout after fixing
      window.location.href = '/cart/checkout';
    } else {
      await Swal.fire({
        icon: 'info',
        title: 'No Issues to Fix',
        text: 'Your cart appears to be in good condition.',
        confirmButtonColor: '#007bff'
      });
    }
    
  } catch (error) {
    console.error('❌ Error auto-fixing cart issues:', error);
    Swal.close();
    
    await Swal.fire({
      icon: 'error',
      title: 'Auto-Fix Failed',
      text: 'We couldn\'t automatically fix the issues. Please review your cart manually.',
      confirmButtonColor: '#007bff'
    });
  }
}

// UTILITY: Find cart item by product name and size
function findCartItemByName(productName, size) {
  const cartItems = document.querySelectorAll('.cart-item-card');
  
  for (const item of cartItems) {
    const nameElement = item.querySelector('.product-name');
    const sizeElement = item.querySelector('.spec-item');
    
    if (!nameElement) continue;
    
    const itemName = nameElement.textContent.trim();
    const itemSize = sizeElement ? sizeElement.textContent.includes('Size:') ? 
      sizeElement.textContent.split('Size:')[1].trim() : '' : '';
    
    if (itemName === productName && (!size || itemSize === size)) {
      return item;
    }
  }
  
  return null;
}

// Initialize cart restoration check on page load
document.addEventListener('DOMContentLoaded', function() {
  // Check for cart restoration from payment failures
  setTimeout(() => {
    restoreCartFromFailure();
  }, 1000);
});

// Validate cart on page load/refresh
async function validateCartOnLoad() {
  // Only validate if we're on the cart page and have items
  if (!window.location.pathname.includes('/cart') || window.location.pathname.includes('/checkout')) {
    return;
  }

  const cartItems = document.querySelectorAll('.cart-item-card');
  if (cartItems.length === 0) {
    return;
  }

  console.log('Validating cart on page load...');

  try {
    const validation = await validateCartStock();
    
    // Only show validation errors for items that are completely unavailable (deleted products/categories)
    // Out-of-stock items are already properly displayed on the cart page, so don't show errors for them
    if (!validation.success || (validation.invalidItems && validation.invalidItems.length > 0)) {
      // Only show error if there are invalid items (not just out-of-stock items)
      const hasInvalidItems = validation.invalidItems && validation.invalidItems.some(item => 
        !item.reason.includes('Out of stock') && !item.reason.includes('available')
      );
      
      if (hasInvalidItems) {
        setTimeout(() => {
          showStockValidationError(validation);
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Error validating cart on load:', error);
  }
}

// Remove all out-of-stock items
async function removeAllOutOfStockItems() {
  console.log('removeAllOutOfStockItems called');

  const outOfStockItems = document.querySelectorAll('.cart-item-card.item-out-of-stock');

  if (outOfStockItems.length === 0) {
    safeToast('info', 'No out-of-stock items to remove');
    return;
  }

  let confirmed = false;
  if (typeof Swal !== 'undefined') {
    const result = await Swal.fire({
      icon: 'question',
      title: 'Remove Out-of-Stock Items',
      html: `
        <p>Are you sure you want to remove <strong>${outOfStockItems.length}</strong> out-of-stock item${outOfStockItems.length > 1 ? 's' : ''} from your cart?</p>
        <p><em>This action cannot be undone.</em></p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Yes, Remove All',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d'
    });
    confirmed = result.isConfirmed;
  } else {
    confirmed = confirm(`Are you sure you want to remove ${outOfStockItems.length} out-of-stock item${outOfStockItems.length > 1 ? 's' : ''} from your cart?`);
  }

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch('/cart/remove-out-of-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();

    if (data.success) {
      const removedCount = data.removedCount;

      outOfStockItems.forEach(item => {
        item.style.transition = 'all 0.3s ease';
        item.style.opacity = '0';
        item.style.transform = 'translateX(-100%)';
        setTimeout(() => {
          item.remove();
        }, 300);
      });

      if (window.fetchCartCount) {
        window.fetchCartCount();
      }

      setTimeout(() => {
        const banner = document.getElementById('outOfStockBanner');
        if (banner) {
          banner.style.transition = 'all 0.3s ease';
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-20px)';
          setTimeout(() => {
            banner.remove();
          }, 300);
        }

        const remainingItems = document.querySelectorAll('.cart-item-card');
        if (remainingItems.length === 0) {
          setTimeout(() => {
            location.reload();
          }, 500);
        }
      }, 500);

      if (removedCount > 0) {
        safeToast('success', `Successfully removed ${removedCount} out-of-stock item${removedCount > 1 ? 's' : ''} from your cart`);
      } else {
        safeToast('info', 'No out-of-stock items were found to remove');
      }
    } else {
      safeToast('error', data.message || 'Failed to remove out-of-stock items');
    }

  } catch (error) {
    console.error('Error during bulk removal:', error);
    safeToast('error', 'An error occurred while removing items. Please try again');
  }
}

// Save item for later (move from cart to wishlist)
async function saveForLater(productId, variantId) {
  console.log('saveForLater called:', { productId, variantId });

  try {
    const response = await fetch('/cart/save-for-later', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId, variantId })
    });

    const data = await response.json();

    if (data.success) {
      const cartItem = document.querySelector(`[data-product-id="${productId}"][data-variant-id="${variantId}"]`);
      if (cartItem) {
        cartItem.style.transition = 'all 0.3s ease';
        cartItem.style.opacity = '0';
        cartItem.style.transform = 'translateX(-100%)';

        setTimeout(() => {
          cartItem.remove();

          const remainingItems = document.querySelectorAll('.cart-item-card');
          if (remainingItems.length === 0) {
            location.reload();
          }
        }, 300);
      }

      if (window.fetchCartCount) {
        window.fetchCartCount();
      }
      safeToast('success', 'Item saved to wishlist successfully!');
    } else {
      safeToast('error', data.message || 'Failed to save item for later');
    }
  } catch (error) {
    console.error('Error saving for later:', error);
    safeToast('error', 'Failed to save item for later. Please try again');
  }
}

window.saveForLater = saveForLater;

// cart restoration from payment failures
async function restoreCartFromFailure() {
  // Check if there's a restoration request from payment failure
  const restorationData = localStorage.getItem('cartRestorationRequest');
  if (!restorationData) return;
  
  try {
    const data = JSON.parse(restorationData);
    localStorage.removeItem('cartRestorationRequest');
    
    // Show restoration progress
    // Swal.fire({
    //   title: 'Restoring Cart',
    //   html: 'Recovering your cart items from the failed payment...',
    //   allowOutsideClick: false,
    //   showConfirmButton: false,
    //   didOpen: () => Swal.showLoading()
    // });
    
    // Validate current cart state
    const validation = await validateCartStock();
    
    // Swal.close();
    
    if (validation.success && validation.allValid) {
      // Cart is in good state
      safeToast('success', 'Your cart has been restored successfully!');
    } else if (validation.invalidItems && validation.invalidItems.length > 0) {
      // Show restoration issues
      showCartRestorationIssues(validation);
    }
    
  } catch (error) {
    console.error('❌ Error during cart restoration:', error);
    localStorage.removeItem('cartRestorationRequest');
  }
}

// Show cart restoration issues
function showCartRestorationIssues(validation) {
  let issuesHtml = '<div class="text-start"><p><strong>Cart Restoration Issues:</strong></p><ul>';
  
  validation.invalidItems.forEach(item => {
    issuesHtml += `<li>${item.productName}${item.size ? ` (${item.size})` : ''} - ${item.reason}</li>`;
  });
  
  issuesHtml += '</ul></div>';
  
  Swal.fire({
    icon: 'warning',
    title: 'Cart Partially Restored',
    html: `
      <p>We restored most of your cart, but some items had issues:</p>
      ${issuesHtml}
      <p class="mt-3"><strong>Available items have been added back to your cart.</strong></p>
    `,
    confirmButtonText: 'Continue Shopping',
    confirmButtonColor: '#007bff',
    width: 600
  }).then(() => {
    // Optionally reload to show updated cart
    window.location.reload();
  });
}


// Initialize cart functionality only on cart page
function initializeCartPage() {
  // Only run on cart page
  if (!window.location.pathname.includes('/cart')) {
    return;
  }

  console.log('Cart.js: Initializing cart page functionality...');
  
  configureToastr();

  // Prevent all form submissions on this page
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
  });

  // Add event listeners to all save for later buttons
  const saveForLaterButtons = document.querySelectorAll('.save-later-btn');
  console.log('Found save for later buttons:', saveForLaterButtons.length);
  saveForLaterButtons.forEach((button, index) => {
    console.log(`Attaching event to save for later button ${index + 1}`);
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Save for later button clicked');
      
      const cartItem = this.closest('.cart-item-card');
      if (!cartItem) {
        console.error('Cart item not found');
        return false;
      }
      
      const productId = cartItem.dataset.productId;
      const variantId = cartItem.dataset.variantId;
      
      console.log('Saving for later:', { productId, variantId });
      saveForLater(productId, variantId);
      return false;
    });
  });

  // Add event listeners to all quantity buttons
  const qtyButtons = document.querySelectorAll('.qty-btn');
  console.log('Found quantity buttons:', qtyButtons.length);
  qtyButtons.forEach((button, index) => {
    console.log(`Attaching event to qty button ${index + 1}:`, button.className);
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Quantity button clicked:', this.className);
      
      const cartItem = this.closest('.cart-item-card');
      if (!cartItem) {
        console.error('Cart item not found');
        return false;
      }
      
      const productId = cartItem.dataset.productId;
      const variantId = cartItem.dataset.variantId;
      const qtyInput = cartItem.querySelector('.qty-input');
      const currentQty = parseInt(qtyInput.value);
      
      console.log('Cart item data:', { productId, variantId, currentQty });
      
      let newQty;
      if (this.classList.contains('qty-decrease')) {
        newQty = Math.max(1, currentQty - 1);
        console.log('Decreasing quantity to:', newQty);
      } else if (this.classList.contains('qty-increase')) {
        newQty = Math.min(5, currentQty + 1);
        console.log('Increasing quantity to:', newQty);
      }
      
      if (newQty && newQty !== currentQty) {
        updateQuantity(productId, variantId, newQty);
      }
      
      return false;
    });
  });

  // Add event listeners to all remove buttons
  const removeButtons = document.querySelectorAll('.remove-btn');
  console.log('Found remove buttons:', removeButtons.length);
  removeButtons.forEach((button, index) => {
    console.log(`Attaching event to remove button ${index + 1}`);
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Remove button clicked');
      
      const cartItem = this.closest('.cart-item-card');
      if (!cartItem) {
        console.error('Cart item not found');
        return false;
      }
      
      const productId = cartItem.dataset.productId;
      const variantId = cartItem.dataset.variantId;
      
      console.log('Removing item:', { productId, variantId });
      removeFromCart(productId, variantId);
      return false;
    });
  });

  // Add event listener to clear cart button
  const clearCartButton = document.querySelector('.btn-clear-cart');
  if (clearCartButton) {
    console.log('Found clear cart button');
    clearCartButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Clear cart button clicked');
      
      // ✅ Enhanced SweetAlert confirmation with loading states
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Clear Cart?',
          text: 'Are you sure you want to remove all items from your cart?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#dc3545',
          cancelButtonColor: '#6c757d',
          confirmButtonText: 'Yes, Clear Cart',
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            // ✅ Show loading state on button
            this.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Clearing...';
            this.disabled = true;
            
            // ✅ Make API call to clear cart
            fetch('/cart/clear', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                // ✅ Success SweetAlert
                Swal.fire({
                  icon: 'success',
                  title: 'Cart Cleared!',
                  text: 'All items have been removed from your cart.',
                  confirmButtonColor: '#000'
                }).then(() => {
                  window.location.reload();
                });
              } else {
                throw new Error(data.message || 'Failed to clear cart');
              }
            })
            .catch(error => {
              console.error('Error clearing cart:', error);
              // ✅ Error SweetAlert
              Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to clear cart. Please try again.',
                confirmButtonColor: '#000'
              });
              // ✅ Restore button state on error
              this.innerHTML = '<i class="bi bi-trash me-1"></i>Clear Cart';
              this.disabled = false;
            });
          }
        });
      } else {
        // ✅ Fallback for browsers without SweetAlert
        if (confirm('Are you sure you want to clear your cart?')) {
          clearCart(); // Your existing clearCart function
        }
      }
      
      return false;
    });
  }


  // Add event listener to checkout button
  const checkoutButton = document.querySelector('.checkout-btn');
  if (checkoutButton) {
    console.log('Found checkout button');
    checkoutButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Checkout button clicked');
      proceedToCheckout();
      return false;
    });
  }

  // Add event listener to remove all out of stock button
  const removeOutOfStockButtons = document.querySelectorAll('.remove-all-unavailable-btn');
  console.log('Found remove out of stock buttons:', removeOutOfStockButtons.length);
  removeOutOfStockButtons.forEach((button, index) => {
    console.log(`Attaching event to remove out of stock button ${index + 1}`);
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Remove out of stock button clicked');
      removeAllOutOfStockItems();
      return false;
    });
  });

  console.log('Cart.js: Cart page initialization complete');
  
  // Validate cart on page load after initialization
  setTimeout(() => {
    validateCartOnLoad();
  }, 500);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCartPage);
} else {
  // DOM is already loaded
  initializeCartPage();
}

// Test function for debugging validation
window.testValidation = async function() {
  console.log('=== TESTING VALIDATION ===');
  try {
    const validation = await validateCartStock();
    console.log('Test validation result:', validation);
    
    if (!validation.success || !validation.allValid) {
      console.log('Validation failed - should show error');
      showStockValidationError(validation);
    } else {
      console.log('Validation passed - no errors');
      alert('Validation passed - no stock issues found');
    }
    
    return validation;
  } catch (error) {
    console.error('Test validation error:', error);
  }
};

// Make functions globally available for fallback
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.proceedToCheckout = proceedToCheckout;
window.removeAllOutOfStockItems = removeAllOutOfStockItems;
window.validateCartStock = validateCartStock;

console.log('Cart.js: External script initialization complete');