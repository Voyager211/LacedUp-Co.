// Wishlist functionality for LacedUp
console.log('Wishlist.js: External script loaded');

// Global wishlist functions
let wishlistToastrConfigured = false;

// Configure Toastr when available
function configureWishlistToastr() {
  if (typeof toastr !== 'undefined' && !wishlistToastrConfigured) {
    toastr.options = {
      "closeButton": true,
      "debug": false,
      "newestOnTop": true,
      "progressBar": true,
      "positionClass": "toast-top-right",
      "preventDuplicates": true,
      "onclick": null,
      "showDuration": "400",
      "hideDuration": "800",
      "timeOut": "4000",
      "extendedTimeOut": "1500",
      "showEasing": "swing",
      "hideEasing": "linear",
      "showMethod": "slideDown",
      "hideMethod": "slideUp",
      "maxOpened": 3,
      "tapToDismiss": true
    };
    wishlistToastrConfigured = true;
  }
}

// Safe toast function for wishlist
function safeWishlistToast(type, message, title = '') {
  configureWishlistToastr();
  if (typeof toastr !== 'undefined' && typeof showToast !== 'undefined') {
    showToast[type](message, title);
  } else if (typeof toastr !== 'undefined') {
    toastr[type](message, title);
  } else {
    console.log(`${type.toUpperCase()}: ${message}`);
  }
}

// Add product to wishlist
async function addToWishlist(productId, button) {
  try {
    // Disable button during request
    button.disabled = true;
    const icon = button.querySelector('i');
    const originalIcon = icon.className;
    icon.className = 'bi bi-arrow-repeat';
    icon.style.animation = 'spin 1s linear infinite';

    const response = await fetch('/wishlist/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productId })
    });

    const data = await response.json();

    if (data.success) {
      // Update button appearance
      icon.className = 'bi bi-heart-fill';
      icon.style.animation = '';
      button.classList.remove('btn-outline-secondary');
      button.classList.add('btn-danger');
      button.title = 'Remove from Wishlist';
      button.dataset.inWishlist = 'true';

      // Show success toast
      safeWishlistToast('success', 'Product added to your wishlist successfully!');

      // Update wishlist count if available
      if (data.wishlistCount !== undefined) {
        updateWishlistCounter(data.wishlistCount);
      }
    } else {
      // Handle specific error cases
      if (data.message && data.message.includes('already in wishlist')) {
        safeWishlistToast('info', 'This product is already in your wishlist');
        // Update button to reflect current state
        icon.className = 'bi bi-heart-fill';
        button.classList.remove('btn-outline-secondary');
        button.classList.add('btn-danger');
        button.title = 'Remove from Wishlist';
        button.dataset.inWishlist = 'true';
      } else {
        throw new Error(data.message || 'Failed to add to wishlist');
      }
    }
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    safeWishlistToast('error', error.message || 'Failed to add product to wishlist. Please try again.');
    
    // Reset button state
    const icon = button.querySelector('i');
    icon.className = 'bi bi-heart';
    icon.style.animation = '';
  } finally {
    button.disabled = false;
  }
}

// Remove product from wishlist
async function removeFromWishlist(productId, button) {
  try {
    // Disable button during request
    button.disabled = true;
    const icon = button.querySelector('i');
    const originalIcon = icon.className;
    icon.className = 'bi bi-arrow-repeat';
    icon.style.animation = 'spin 1s linear infinite';

    const response = await fetch(`/wishlist/remove/${productId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.success) {
      // Update button appearance
      icon.className = 'bi bi-heart';
      icon.style.animation = '';
      button.classList.remove('btn-danger');
      button.classList.add('btn-outline-secondary');
      button.title = 'Add to Wishlist';
      button.dataset.inWishlist = 'false';

      // Show success toast
      safeWishlistToast('success', 'Product removed from your wishlist');

      // Update wishlist count if available
      if (data.wishlistCount !== undefined) {
        updateWishlistCounter(data.wishlistCount);
      }

      // If we're on the wishlist page, remove the product card with animation
      if (window.location.pathname.includes('/wishlist')) {
        const productCard = button.closest('.col-6, .col-md-4, .col-lg-3');
        if (productCard) {
          productCard.style.transition = 'all 0.3s ease';
          productCard.style.opacity = '0';
          productCard.style.transform = 'scale(0.8)';
          
          setTimeout(() => {
            productCard.remove();
            
            // Check if wishlist is empty
            const remainingProducts = document.querySelectorAll('.product-card');
            if (remainingProducts.length === 0) {
              setTimeout(() => {
                location.reload();
              }, 500);
            }
          }, 300);
        }
      }
    } else {
      throw new Error(data.message || 'Failed to remove from wishlist');
    }
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    safeWishlistToast('error', error.message || 'Failed to remove product from wishlist. Please try again.');
    
    // Reset button state
    const icon = button.querySelector('i');
    icon.className = 'bi bi-heart-fill';
    icon.style.animation = '';
  } finally {
    button.disabled = false;
  }
}

// Update wishlist counter in navbar
function updateWishlistCounter(count) {
  const wishlistCounter = document.querySelector('#wishlistCount, .wishlist-count');
  if (wishlistCounter) {
    if (count > 0) {
      wishlistCounter.textContent = count;
      wishlistCounter.style.display = 'flex';
    } else {
      wishlistCounter.style.display = 'none';
    }
  }
}

// Handle wishlist button clicks
function handleWishlistClick(button, productId) {
  const isInWishlist = button.dataset.inWishlist === 'true' || 
                      button.classList.contains('btn-danger') ||
                      button.querySelector('i').classList.contains('bi-heart-fill');

  if (isInWishlist) {
    removeFromWishlist(productId, button);
  } else {
    addToWishlist(productId, button);
  }
}

// Initialize wishlist functionality
function initializeWishlistFunctionality() {
  console.log('Wishlist.js: Initializing wishlist functionality...');
  
  configureWishlistToastr();

  // Add event listeners to all wishlist buttons
  document.addEventListener('click', function(e) {
    if (e.target.closest('.wishlist-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const button = e.target.closest('.wishlist-btn');
      const productId = button.dataset.id;
      
      if (!productId) {
        console.error('Product ID not found on wishlist button');
        safeWishlistToast('error', 'Unable to identify product. Please refresh the page.');
        return;
      }

      // Check if user is authenticated (this should be handled by the server-side template)
      // The authentication check is already handled in the shop.ejs template
      
      handleWishlistClick(button, productId);
    }
  });

  console.log('Wishlist.js: Initialization complete');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWishlistFunctionality);
} else {
  // DOM is already loaded
  initializeWishlistFunctionality();
}

// Make functions globally available
window.addToWishlist = addToWishlist;
window.removeFromWishlist = removeFromWishlist;
window.handleWishlistClick = handleWishlistClick;
window.updateWishlistCounter = updateWishlistCounter;

console.log('Wishlist.js: External script initialization complete');

// Add CSS for spin animation if not already present
if (!document.querySelector('#wishlist-spin-animation')) {
  const style = document.createElement('style');
  style.id = 'wishlist-spin-animation';
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}