// Debug version for SKU-based cart system

document.addEventListener('DOMContentLoaded', function() {

  
  // Check if size buttons exist
  const sizeButtons = document.querySelectorAll('.size-btn');
 
  
  // Check if add to cart button exists
  const addToCartBtn = document.querySelector('.add-to-cart-btn');

  
  // Override the existing addToCart function
  window.addToCart = async function(productId, variant) {
    
    
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
       
        
        const productVariants = window.productVariants || [];
       
        
        if (productVariants[variantIndex]) {
          variantId = productVariants[variantIndex]._id;
         
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
        alert('Added to cart successfully!');
        // Update cart count if function exists
        if (window.updateNavbarCartCount) {
          window.updateNavbarCartCount(result.cartCount);
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