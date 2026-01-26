const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderEnums');

/**
 * Generate a unique order ID for testing
 */
function generateOrderId() {
  return `ORD-TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create test user
 */
async function createTestUser() {
  const User = require('../models/User');
  
  const testUser = new User({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    password: 'hashedpassword123',
    phone: '9876543210',
    isVerified: true
  });
  
  await testUser.save();
  return testUser;
}


/**
 * Create test category
 */
async function createTestCategory() {
  const Category = require('../models/Category');
  
  const testCategory = new Category({
    name: `Test Category ${Date.now()}`,
    description: 'Test category for testing',
    isListed: true
  });
  
  await testCategory.save();
  return testCategory;
}

/**
 * Create test brand
 */
async function createTestBrand() {
  const Brand = require('../models/Brand');
  
  const testBrand = new Brand({
    name: `Test Brand ${Date.now()}`,
    description: 'Test brand for testing',
    isListed: true
  });
  
  await testBrand.save();
  return testBrand;
}


/**
 * Create test product
 */
async function createTestProduct(name = 'Test Product') {
  const Product = require('../models/Product');
  
  // Create real brand and category
  const brand = await createTestBrand();
  const category = await createTestCategory();
  
  // Create unique name with timestamp
  const uniqueName = `${name} ${Date.now()}`;
  
  const testProduct = new Product({
    productName: uniqueName,                     // ✅ Unique name
    description: 'Test product description',
    category: category._id,
    brand: brand._id,
    gender: 'Unisex',
    regularPrice: 2000,
    salePrice: 1500,
    mainImage: 'test-image.jpg',
    features: 'Test feature 1, Test feature 2, Test feature 3',
    variants: [
      {
        size: '8',
        stock: 100,
        sku: `SKU-TEST-8-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        basePrice: 1800
      },
      {
        size: '9',
        stock: 100,
        sku: `SKU-TEST-9-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        basePrice: 1800
      },
      {
        size: '10',
        stock: 100,
        sku: `SKU-TEST-10-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        basePrice: 1800
      }
    ],
    isListed: true
  });
  
  await testProduct.save();
  return testProduct;
}




/**
 * Create test address
 */
async function createTestAddress(userId) {
  const Address = require('../models/Address');
  
  const testAddress = new Address({
    userId: userId,
    address: [
      {
        name: 'Test User',
        phone: '9876543210',
        addressLine1: '123 Test Street',
        addressLine2: 'Test Area',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
        country: 'India',
        landMark: 'Near Test Landmark',           // ✅ Added
        addressType: 'Home',                       // ✅ Added
        isDefault: true
      }
    ]
  });
  
  await testAddress.save();
  return testAddress;
}



/**
 * Create test order with specified configuration
 */
async function createTestOrder(config = {}) {
  const Order = require('../models/Order');
  
  const {
    itemCount = 3,
    paymentMethod = 'cod',
    paymentStatus = PAYMENT_STATUS.PENDING,
    orderStatus = ORDER_STATUS.PENDING,
    itemStatus = ORDER_STATUS.PENDING,
    itemPaymentStatus = PAYMENT_STATUS.PENDING,
    userId = null,
    addressId = null
  } = config;
  
  // Create user if not provided
  const user = userId || await createTestUser();
  const address = addressId || await createTestAddress(user._id);
  
  // Create products
  const products = [];
  for (let i = 0; i < itemCount; i++) {
    const product = await createTestProduct(`Test Product ${i + 1}`);
    products.push(product);
  }
  
  // Create order items with explicit pricing
  const items = products.map((product, index) => {
    const itemPrice = 1500;  // Use fixed test price
    const itemQuantity = 1;
    
    return {
      productId: product._id,
      variantId: product.variants[0]._id,
      sku: product.variants[0].sku,
      size: product.variants[0].size,
      quantity: itemQuantity,
      price: itemPrice,
      totalPrice: itemPrice * itemQuantity,
      status: itemStatus,
      paymentStatus: itemPaymentStatus,
      statusHistory: [{
        status: itemStatus,
        updatedAt: new Date(),
        notes: 'Initial order status'
      }]
    };
  });
  
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = subtotal;  // No shipping for test orders
  
  const order = new Order({
    orderId: generateOrderId(),
    user: user._id,
    items: items,
    subtotal: subtotal,
    totalAmount: totalAmount,
    amountAfterDiscount: totalAmount,
    finalAmount: totalAmount,
    totalItemCount: items.length,
    deliveryAddress: {
      addressId: address._id,
      addressIndex: 0
    },
    paymentMethod: paymentMethod,
    paymentStatus: paymentStatus,
    status: orderStatus,
    statusHistory: [{
      status: orderStatus,
      updatedAt: new Date(),
      notes: 'Order created'
    }]
  });
  
  // Add payment IDs for online payments
  if (paymentMethod === 'wallet' && paymentStatus === PAYMENT_STATUS.COMPLETED) {
    // Simulate wallet payment
    order.walletAmountUsed = totalAmount;
  } else if (paymentMethod === 'upi' && paymentStatus === PAYMENT_STATUS.COMPLETED) {
    order.razorpayPaymentId = `pay_test_${Date.now()}`;
    order.razorpayOrderId = `order_test_${Date.now()}`;
  } else if (paymentMethod === 'paypal' && paymentStatus === PAYMENT_STATUS.COMPLETED) {
    order.paypalCaptureId = `capture_test_${Date.now()}`;
  }
  
  await order.save();
  
  return order;
}


/**
 * Cleanup test data
 */
async function cleanupTestData(orderIds = []) {
  const Order = require('../models/Order');
  const User = require('../models/User');
  const Product = require('../models/Product');
  const Address = require('../models/Address');
  const Return = require('../models/Return');
  const Brand = require('../models/Brand');           // ✅ Added
  const Category = require('../models/Category');     // ✅ Added
  
  // Delete test orders
  for (const orderId of orderIds) {
    const order = await Order.findOne({ orderId });
    if (order) {
      // Delete related returns
      await Return.deleteMany({ orderId: order.orderId });
      
      // Delete products and their brands/categories
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          // Delete brand and category
          await Brand.findByIdAndDelete(product.brand);          // ✅ Added
          await Category.findByIdAndDelete(product.category);    // ✅ Added
          
          // Delete product
          await Product.findByIdAndDelete(item.productId);
        }
      }
      
      // Delete address
      if (order.deliveryAddress && order.deliveryAddress.addressId) {
        await Address.findByIdAndDelete(order.deliveryAddress.addressId);
      }
      
      // Delete user
      await User.findByIdAndDelete(order.user);
      
      // Delete order
      await Order.findOneAndDelete({ orderId: order.orderId });
    }
  }
}


module.exports = {
  generateOrderId,
  createTestUser,
  createTestCategory,
  createTestBrand,
  createTestProduct,
  createTestAddress,
  createTestOrder,
  cleanupTestData
};
