// Debug version for SKU-based cart system

document.addEventListener('DOMContentLoaded', function() {
  console.log('Product details debug script loaded');
  console.log('Product variants:', window.productVariants);
  
  // Check if size buttons exist
  const sizeButtons = document.querySelectorAll('.size-btn');
  console.log('Size buttons found:', sizeButtons.length);
  
  // Check if add to cart button exists
  const addToCartBtn = document.querySelector('.add-to-cart-btn');
  console.log('Add to cart button found:', !!addToCartBtn);
  
  // Override the existing addToCart function
  window.addToCart = async function(productId, variant) {
    console.log('addToCart called with:', { productId, variant });
    
    if (!variant) {
      console.error('No variant provided');
      alert('Please select a size before adding to cart.');
      return;
    }

    // Get the variantId from the selected variant
    const sizeButtons = document.querySelectorAll('.size-btn');
    let variantId = null;
    let activeButton = null;
    
    // Find the active size button
    sizeButtons.forEach(button => {
      if (button.classList.contains('active')) {
        activeButton = button;
        const variantIndex = parseInt(button.dataset.variantIndex);
        console.log('Active button variant index:', variantIndex);
        
        const productVariants = window.productVariants || [];
        console.log('Available variants:', productVariants);
        
        if (productVariants[variantIndex]) {
          variantId = productVariants[variantIndex]._id;
          console.log('Found variant ID:', variantId);
        }
      }
    });

    if (!variantId) {
      console.error('Could not find variant ID');
      console.error('Active button:', activeButton);
      console.error('Product variants:', window.productVariants);
      alert('Unable to identify the selected variant. Please try again.');
      return;
    }

    console.log('Sending request to /cart/add with:', {
      productId: productId,
      variantId: variantId,
      quantity: 1
    });

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

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response data:', result);

      if (response.ok && result.success) {
        alert('Added to cart successfully!');
        // Update cart count if function exists
        if (window.updateCartCount) {
          window.updateCartCount(result.cartCount);
        }
      } else {
        console.error('Add to cart failed:', result);
        alert('Failed to add to cart: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Add to cart error:', error);
      alert('Error adding to cart: ' + error.message);
    }
  };
});