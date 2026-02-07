// Fix for SKU-based cart system in product details page

document.addEventListener('DOMContentLoaded', function() {
  // Override the existing addToCart function to use variantId
  window.addToCart = async function(productId, variant) {
    if (!variant) {
      Swal.fire({
        icon: 'warning',
        title: 'Size Required',
        text: 'Please select a size before adding to cart.',
        confirmButtonColor: '#e03a2f'
      });
      return;
    }

    // Get the variantId from the selected variant
    const sizeButtons = document.querySelectorAll('.size-btn');
    let variantId = null;
    
    // Find the active size button to get the variantId
    sizeButtons.forEach(button => {
      if (button.classList.contains('active')) {
        // Get the variant ID from the product variants array
        const variantIndex = parseInt(button.dataset.variantIndex);
        const productVariants = window.productVariants || [];
        if (productVariants[variantIndex]) {
          variantId = productVariants[variantIndex]._id;
        }
        // Also try to get it from data attribute if available
        if (!variantId && button.dataset.variantId) {
          variantId = button.dataset.variantId;
        }
      }
    });

    if (!variantId) {
      console.error('Available product variants:', window.productVariants);
      console.error('Selected variant:', variant);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Unable to identify the selected variant. Please try again.',
        confirmButtonColor: '#e03a2f'
      });
      return;
    }

    

    try {
      const response = await fetch('/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: productId,
          variantId: variantId,
          quantity: 1
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Show success message
        Swal.fire({
          icon: 'success',
          title: 'Added to Cart!',
          text: result.message || 'Product added to cart successfully.',
          confirmButtonColor: '#28a745',
          timer: 2000,
          showConfirmButton: false
        });

        // Update cart count in navbar if it exists
        if (window.updateNavbarCartCount) {
          window.updateNavbarCartCount(result.cartCount);
        }
      } else {
        // Handle different error types
        if (result.code === 'OUT_OF_STOCK') {
          Swal.fire({
            icon: 'error',
            title: 'Out of Stock',
            text: result.message,
            confirmButtonColor: '#e03a2f'
          });
        } else if (result.code === 'INSUFFICIENT_STOCK') {
          Swal.fire({
            icon: 'warning',
            title: 'Insufficient Stock',
            text: result.message,
            confirmButtonColor: '#e03a2f'
          });
        } else if (result.code === 'CART_QUANTITY_LIMIT') {
          Swal.fire({
            icon: 'warning',
            title: 'Quantity Limit',
            text: result.message,
            confirmButtonColor: '#e03a2f'
          });
        } else {
          throw new Error(result.message || 'Failed to add product to cart');
        }
      }
    } catch (error) {
      console.error('Add to cart error:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to add product to cart. Please try again.',
        confirmButtonColor: '#e03a2f'
      });
    }
  };

  });