const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const Address = require('../../models/Address');
const User = require('../../models/User');

// Helper function to calculate variant-specific final price
const calculateVariantFinalPrice = (product, variant) => {
  try {
    // Try to use product's calculateVariantFinalPrice method if it exists
    if (typeof product.calculateVariantFinalPrice === 'function') {
      return product.calculateVariantFinalPrice(variant);
    }
    
    // Fallback to variant base price or product regular price
    return variant.basePrice || product.regularPrice || 0;
  } catch (error) {
    console.error('Error calculating variant price:', error);
    return variant.basePrice || product.regularPrice || 0;
  }
};

// Place order
exports.placeOrder = async (req, res) => {
  try {
    console.log('=== PLACE ORDER REQUEST ===');
    console.log('Request body:', req.body);
    console.log('User from req.user:', req.user);
    console.log('User from session:', req.session.userId);
    
    const userId = req.user ? req.user._id : req.session.userId;
    console.log('Final userId:', userId);
    
    const { deliveryAddressId, paymentMethod } = req.body;
    console.log('Delivery Address ID:', deliveryAddressId);
    console.log('Payment Method:', paymentMethod);

    // Validate input
    if (!deliveryAddressId || !paymentMethod) {
      console.log('Validation failed: Missing deliveryAddressId or paymentMethod');
      return res.status(400).json({
        success: false,
        message: 'Delivery address and payment method are required'
      });
    }

    if (!userId) {
      console.log('Validation failed: No user ID found');
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [
          {
            path: 'category',
            select: 'name isListed isDeleted isActive categoryOffer'
          },
          {
            path: 'brand',
            select: 'name isActive isDeleted brandOffer'
          }
        ]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Get delivery address
    const userAddresses = await Address.findOne({ userId });
    if (!userAddresses || !userAddresses.address) {
      return res.status(400).json({
        success: false,
        message: 'No addresses found'
      });
    }

    const deliveryAddress = userAddresses.address.find(addr => addr._id.toString() === deliveryAddressId);
    if (!deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address not found'
      });
    }

    // Validate cart items and calculate totals
    let validItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalItemCount = 0;
    let stockIssues = [];

    for (const item of cart.items) {
      // Check if product exists and is available
      if (!item.productId ||
          !item.productId.isListed ||
          item.productId.isDeleted) {
        stockIssues.push({
          productName: item.productId ? item.productId.productName : 'Unknown Product',
          size: item.size,
          quantity: item.quantity,
          error: 'Product is no longer available'
        });
        continue;
      }

      // Check category and brand availability
      if ((item.productId.category &&
          (item.productId.category.isListed === false || item.productId.category.isDeleted === true || item.productId.category.isActive === false)) ||
          (item.productId.brand && (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true))) {
        stockIssues.push({
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity,
          error: 'Product category or brand is no longer available'
        });
        continue;
      }

      // Check variant availability
      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            error: 'Product variant not found'
          });
          continue;
        }

        if (variant.stock === 0) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: 0,
            error: `Size ${item.size} is out of stock`
          });
          continue;
        }

        if (variant.stock < item.quantity) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: variant.stock,
            error: `Only ${variant.stock} items available for size ${item.size}`
          });
          continue;
        }

        // Calculate prices
        const regularPrice = item.productId.regularPrice;
        const salePrice = calculateVariantFinalPrice(item.productId, variant);
        const quantity = item.quantity;
        
        subtotal += regularPrice * quantity;
        totalItemCount += quantity;
        
        const itemDiscount = (regularPrice - salePrice) * quantity;
        totalDiscount += itemDiscount;

        validItems.push({
          productId: item.productId._id,
          variantId: item.variantId,
          sku: item.sku,
          size: item.size,
          quantity: quantity,
          price: salePrice,
          totalPrice: salePrice * quantity,
          regularPrice: regularPrice
        });

        // Update product stock
        variant.stock -= quantity;
        await item.productId.save();
      }
    }

    // If there are any stock issues, return error instead of placing partial order
    if (stockIssues.length > 0) {
      let errorMessage = 'Some items in your cart have stock issues and cannot be ordered:\n\n';
      stockIssues.forEach((item, index) => {
        errorMessage += `${index + 1}. ${item.productName}`;
        if (item.size) {
          errorMessage += ` (Size: ${item.size})`;
        }
        errorMessage += `\n   ${item.error}\n\n`;
      });
      errorMessage += 'Please return to your cart to fix these issues before placing your order.';

      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items found in cart',
        code: 'NO_VALID_ITEMS'
      });
    }

    // Calculate final amounts
    const amountAfterDiscount = subtotal - totalDiscount;
    const shipping = amountAfterDiscount > 500 ? 0 : 50;
    const total = amountAfterDiscount + shipping;

    // Generate order ID
    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);

    // Create order
    const newOrder = new Order({
      orderId: orderId,
      user: userId,
      items: validItems.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      })),
      deliveryAddress: {
        name: deliveryAddress.name,
        addressType: deliveryAddress.addressType,
        landMark: deliveryAddress.landMark,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        pincode: deliveryAddress.pincode,
        phone: deliveryAddress.phone,
        altPhone: deliveryAddress.altPhone
      },
      paymentMethod: paymentMethod,
      subtotal: Math.round(subtotal),
      totalDiscount: Math.round(totalDiscount),
      amountAfterDiscount: Math.round(amountAfterDiscount),
      shipping: shipping,
      totalAmount: Math.round(total),
      totalItemCount: totalItemCount,
      status: 'Pending',
      paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Completed'
    });

    await newOrder.save();

    // Clear cart
    cart.items = [];
    await cart.save();

    // For COD, redirect to success page
    if (paymentMethod === 'cod') {
      return res.json({
        success: true,
        message: 'Order placed successfully',
        orderId: orderId,
        redirectUrl: `/order-success/${orderId}`
      });
    }

    // For other payment methods, handle payment processing here
    // For now, just redirect to success page
    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: orderId,
      redirectUrl: `/order-success/${orderId}`
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place order'
    });
  }
};

// Load order success page
exports.loadOrderSuccess = async (req, res) => {
  try {
    console.log('=== ORDER SUCCESS PAGE REQUEST ===');
    console.log('OrderId:', req.params.orderId);
    console.log('User ID:', req.user ? req.user._id : req.session.userId);
    
    const { orderId } = req.params;
    const userId = req.user ? req.user._id : req.session.userId;

    if (!userId) {
      console.log('No user ID found, redirecting to login');
      return res.redirect('/login');
    }

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      console.log('User not found, redirecting to login');
      return res.redirect('/login');
    }
    console.log('User found:', user.fullname);

    // Get order details with populated product data
    const order = await Order.findOne({ orderId: orderId, user: userId })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage subImages regularPrice salePrice'
      });

    if (!order) {
      console.log('Order not found for orderId:', orderId);
      return res.status(404).send('Order not found');
    }
    console.log('Order found:', order.orderId, 'with', order.items.length, 'items');

    // Create order data with proper product information
    const orderData = {
      orderId: order.orderId,
      items: order.items.map(item => {
        const itemObj = item.toObject();
        
        // Ensure product data is available
        if (item.productId && typeof item.productId === 'object') {
          itemObj.productId = {
            _id: item.productId._id,
            productName: item.productId.productName || 'Product Name',
            mainImage: item.productId.mainImage || null,
            subImages: item.productId.subImages || []
          };
        } else {
          // Fallback if product is not populated
          itemObj.productId = {
            _id: itemObj.productId,
            productName: 'Product Name',
            mainImage: null,
            subImages: []
          };
        }
        
        return itemObj;
      }),
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      totalDiscount: order.totalDiscount,
      amountAfterDiscount: order.amountAfterDiscount,
      shipping: order.shipping,
      total: order.totalAmount,
      totalItemCount: order.totalItemCount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt
    };

    console.log('Order data prepared with product info:', orderData.items.map(item => ({
      productName: item.productId.productName,
      hasImage: !!item.productId.mainImage
    })));

    console.log('About to render order-success page...');

    res.render('user/order-success', {
      user,
      orderData,
      title: 'Order Placed Successfully',
      layout: 'user/layouts/user-layout',
      active: 'orders'
    });

    console.log('Order success page rendered successfully');

  } catch (error) {
    console.error('Error loading order success page:', error);
    res.status(500).send('Error loading order success page: ' + error.message);
  }
};

// Get all orders for user
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user orders
    const orders = await Order.find({ user: userId })
      .populate({
        path: 'items.productId',
        select: 'productName mainImage subImages'
      })
      .sort({ createdAt: -1 });

    res.render('user/orders', {
      user,
      orders,
      title: 'My Orders',
      layout: 'user/layouts/user-layout',
      active: 'orders'
    });

  } catch (error) {
    console.error('Error loading orders:', error);
    res.status(500).render('errors/server-error', { 
      message: 'Error loading orders',
      error: error.message 
    });
  }
};

// Enhanced place order with stock validation
exports.placeOrderWithValidation = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.userId;
    const { deliveryAddressId, paymentMethod } = req.body;

    // First, validate cart stock
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: [{
          path: 'category',
          select: 'name isListed isDeleted isActive categoryOffer'
        }, {
          path: 'brand',
          select: 'name isActive isDeleted brandOffer'
        }]
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty',
        code: 'EMPTY_CART'
      });
    }

    // Validate stock and availability for all items
    const stockIssues = [];
    for (const item of cart.items) {
      if (!item.productId || !item.productId.isListed || item.productId.isDeleted) {
        stockIssues.push({
          productName: item.productId ? item.productId.productName : 'Unknown Product',
          size: item.size,
          quantity: item.quantity,
          error: 'Product is no longer available'
        });
        continue;
      }

      // Check category and brand availability
      if ((item.productId.category &&
          (item.productId.category.isListed === false || item.productId.category.isDeleted === true || item.productId.category.isActive === false)) ||
          (item.productId.brand && (item.productId.brand.isActive === false || item.productId.brand.isDeleted === true))) {
        stockIssues.push({
          productName: item.productId.productName,
          size: item.size,
          quantity: item.quantity,
          error: 'Product category or brand is no longer available'
        });
        continue;
      }

      if (item.variantId) {
        const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
        if (!variant || variant.stock === 0 || variant.stock < item.quantity) {
          stockIssues.push({
            productName: item.productId.productName,
            size: item.size,
            quantity: item.quantity,
            availableStock: variant ? variant.stock : 0,
            error: variant ? `Only ${variant.stock} items available` : 'Product variant not found'
          });
        }
      }
    }

    if (stockIssues.length > 0) {
      let errorMessage = 'Some items in your cart have stock issues and cannot be ordered:\n\n';
      stockIssues.forEach((item, index) => {
        errorMessage += `${index + 1}. ${item.productName}`;
        if (item.size) {
          errorMessage += ` (Size: ${item.size})`;
        }
        errorMessage += `\n   ${item.error}\n\n`;
      });
      errorMessage += 'Please return to your cart to fix these issues before placing your order.';

      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: 'STOCK_VALIDATION_FAILED',
        invalidItems: stockIssues
      });
    }

    // If validation passes, proceed with original place order logic
    return exports.placeOrder(req, res);

  } catch (error) {
    console.error('Error in place order validation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate and place order',
      code: 'VALIDATION_ERROR'
    });
  }
};