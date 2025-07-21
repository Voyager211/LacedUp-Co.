// Cart functionality for LacedUp
// This file contains shared cart functions used across the application

// SweetAlert2 helper function
function showSweetAlert(message, type = 'success') {
  Swal.fire({
    title: type === 'success' ? 'Success!' : type === 'error' ? 'Error!' : 'Info',
    text: message,
    icon: type,
    confirmButtonColor: '#111827',
    timer: type === 'success' ? 3000 : undefined,
    timerProgressBar: type === 'success'
  });
}

// Update cart counter in navbar
function updateCartCounter(count) {
  const cartCounter = document.querySelector('#cartCount');
  if (cartCounter) {
    if (count > 0) {
      cartCounter.textContent = count;
      cartCounter.style.display = 'flex';
      
      // Add animation effect
      cartCounter.style.transform = 'scale(1.2)';
      setTimeout(() => {
        cartCounter.style.transform = 'scale(1)';
      }, 200);
    } else {
      cartCounter.style.display = 'none';
    }
  }
}

// Add to cart function for product cards (redirects to product details for size selection)
function addToCartFromCard(productId, productSlug) {
  // Redirect to product details for size selection
  const productUrl = productSlug ? `/product/${productSlug}` : `/product/${productId}`;
  
  // Add a subtle loading effect to the button
  const button = document.querySelector(`[data-id="${productId}"].cart-btn`);
  if (button) {
    const originalContent = button.innerHTML;
    button.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i>';
    button.disabled = true;
    
    setTimeout(() => {
      window.location.href = productUrl;
    }, 300);
  } else {
    window.location.href = productUrl;
  }
}

// Add to cart function for product details page (with variant selection)
async function addToCartWithVariant(productId, variantId, quantity = 1) {
  try {
    // Validate inputs
    if (!productId) {
      showSweetAlert('Product ID is required', 'error');
      return false;
    }

    if (!variantId) {
      showSweetAlert('Please select a size before adding to cart', 'error');
      return false;
    }

    // Show loading state
    const addToCartBtn = document.querySelector('#add-to-cart-btn');
    if (addToCartBtn) {
      const originalContent = addToCartBtn.innerHTML;
      addToCartBtn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i> Adding...';
      addToCartBtn.disabled = true;
    }

    // Make API request with variant information
    const response = await fetch('/cart/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: productId,
        variantId: variantId,
        quantity: quantity
      })
    });

    const result = await response.json();

    if (result.success) {
      // Update cart counter
      updateCartCounter(result.cartCount);
      
      // Show success message
      showSweetAlert(result.message || 'Product added to cart successfully!', 'success');
      
      // Optional: Show cart preview or redirect to cart
      // You can uncomment the line below to redirect to cart after adding
      // setTimeout(() => window.location.href = '/cart', 1500);
      
      return true;
    } else {
      // Handle specific error cases
      let errorMessage = result.message || 'Failed to add product to cart';
      
      if (result.code === 'PRODUCT_UNAVAILABLE') {
        errorMessage = 'This product is no longer available for purchase';
      } else if (result.code === 'CATEGORY_UNAVAILABLE') {
        errorMessage = 'This product category is no longer available';
      } else if (result.code === 'OUT_OF_STOCK') {
        errorMessage = 'This size is currently out of stock';
      } else if (result.code === 'INSUFFICIENT_STOCK') {
        errorMessage = 'Not enough stock available for the requested quantity';
      } else if (result.code === 'CART_QUANTITY_LIMIT') {
        errorMessage = 'Maximum limit reached! You can only add up to 5 items per variant';
      } else if (result.code === 'CART_STOCK_LIMIT') {
        errorMessage = 'Cannot add more items due to stock limitations';
      }
      
      showSweetAlert(errorMessage, 'error');
      return false;
    }

  } catch (error) {
    console.error('Error adding to cart:', error);
    showSweetAlert('Failed to add product to cart. Please try again.', 'error');
    return false;
  } finally {
    // Restore button state
    const addToCartBtn = document.querySelector('#add-to-cart-btn');
    if (addToCartBtn) {
      addToCartBtn.innerHTML = '<i class="bi bi-cart-plus"></i> Add to Cart';
      addToCartBtn.disabled = false;
    }
  }
}

// Quick add to cart function (for products with only one variant or default selection)
async function quickAddToCart(productId, quantity = 1) {
  try {
    // Show loading state
    const button = document.querySelector(`[data-id="${productId}"].cart-btn`);
    if (button) {
      const originalContent = button.innerHTML;
      button.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i>';
      button.disabled = true;
    }

    // Make API request
    const response = await fetch('/cart/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: productId,
        quantity: quantity
      })
    });

    const result = await response.json();

    if (result.success) {
      // Update cart counter
      updateCartCounter(result.cartCount);
      
      // Show success message
      showSweetAlert(result.message || 'Product added to cart successfully!', 'success');
      
      return true;
    } else {
      // Handle errors
      showSweetAlert(result.message || 'Failed to add product to cart', 'error');
      return false;
    }

  } catch (error) {
    console.error('Error adding to cart:', error);
    showSweetAlert('Failed to add product to cart. Please try again.', 'error');
    return false;
  } finally {
    // Restore button state
    const button = document.querySelector(`[data-id="${productId}"].cart-btn`);
    if (button) {
      button.innerHTML = '<i class="bi bi-cart-plus"></i>';
      button.disabled = false;
    }
  }
}

// Initialize cart functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Handle cart button clicks on product cards
  document.addEventListener('click', function(e) {
    if (e.target.closest('.cart-btn')) {
      e.preventDefault();
      const button = e.target.closest('.cart-btn');
      const productId = button.dataset.id;
      const productSlug = button.dataset.slug;
      
      // Check if we're on product details page (has variant selection)
      const isProductDetailsPage = document.querySelector('#product-variants') !== null;
      
      if (isProductDetailsPage) {
        // On product details page - use the existing addToCart function
        // This will be handled by the product details page script
        return;
      } else {
        // On product cards - redirect to product details for size selection
        addToCartFromCard(productId, productSlug);
      }
    }
  });

  // Load cart count on page load
  loadCartCount();
});

// Function to load cart count on page load
async function loadCartCount() {
  try {
    const response = await fetch('/cart/count');
    const data = await response.json();
    updateCartCounter(data.count || 0);
  } catch (error) {
    console.error('Error loading cart count:', error);
    // If cart count fails, it might be because user is not authenticated
    // This is fine, just don't show any count
  }
}

// CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .cart-btn {
    transition: all 0.3s ease;
  }
  
  .cart-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
  
  .cart-btn:active {
    transform: translateY(0);
  }
  
  .cart-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none !important;
  }
`;
document.head.appendChild(style);