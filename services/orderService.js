const Order = require('../models/Order');
const Return = require('../models/Return');
const walletService = require('./walletService');
const Product = require('../models/Product');
const mongoose = require('mongoose');
// const { sendNotification } = require('./notificationService'); // Optional - for future use
// const { logActivity } = require('./auditService'); // Optional - for future use
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  getOrderStatusArray,
  getPaymentStatusArray,
  getCancellationReasonsArray,
  getReturnReasonsArray,

} = require('../constants/orderEnums');



const completePaymentOnDelivery = async (orderId) => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    // Only process COD orders
    if (order.paymentMethod !== 'cod') {
      return { success: false, message: 'Not a COD order' };
    }

    // Only process if order is being delivered
    if (order.status !== ORDER_STATUS.DELIVERED) {
      return { success: false, message: 'Order not in delivered status' };
    }

    // Update payment status to completed (cash collected)
    order.paymentStatus = PAYMENT_STATUS.COMPLETED;
    
    // Update all items payment status
    order.items.forEach(item => {
      if (item.status === ORDER_STATUS.DELIVERED) {
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
      }
    });

    await order.save();

    return {
      success: true,
      message: 'COD payment marked as completed',
      order: order
    };

  } catch (error) {
    console.error('Error completing COD payment:', error);
    throw error;
  }
};

// Calculate order status based on item statuses 
// ✅ FIXED: Only count actually processed returns, not requests
function calculateOrderStatus(items) {
    const pendingItems = items.filter(item => item.status === ORDER_STATUS.PENDING);
    const processingItems = items.filter(item => item.status === ORDER_STATUS.PROCESSING);
    const shippedItems = items.filter(item => item.status === ORDER_STATUS.SHIPPED);
    const deliveredItems = items.filter(item => item.status === ORDER_STATUS.DELIVERED);
    const cancelledItems = items.filter(item => item.status === ORDER_STATUS.CANCELLED);
    
    // ✅ FIXED: Only count items with actual "Returned" status, not return requests
    const returnedItems = items.filter(item => item.status === ORDER_STATUS.RETURNED);
    
    // ✅ FIXED: Don't consider items with pending return requests as returned
    const processingReturnItems = items.filter(item => item.status === ORDER_STATUS.PROCESSING_RETURN);

    const totalItems = items.length;

    // All items cancelled
    if (cancelledItems.length === totalItems) {
        return ORDER_STATUS.CANCELLED;
    }

    // All items returned (actually processed, not just requested)
    if (returnedItems.length === totalItems) {
        return ORDER_STATUS.RETURNED;
    }

    // ✅ ENHANCED: Handle processing return status
    if (processingReturnItems.length > 0) {
        if (processingReturnItems.length === totalItems) {
            return ORDER_STATUS.PROCESSING_RETURN; // All items processing return
        } else {
            // Some items processing return, others delivered/shipped
            if (deliveredItems.length > 0) {
                return ORDER_STATUS.DELIVERED; // ✅ Stay "Delivered" during return processing
            }
            if (shippedItems.length > 0) {
                return ORDER_STATUS.SHIPPED;
            }
        }
    }

    // Mixed returns and other statuses (only actual returns, not requests)
    if (returnedItems.length > 0) {
        if (deliveredItems.length > 0) {
            return ORDER_STATUS.PARTIALLY_RETURNED; // ✅ Only when actually returned
        }
        if (shippedItems.length > 0) {
            return ORDER_STATUS.PARTIALLY_RETURNED;
        }
    }

    // Mixed cancellations
    if (cancelledItems.length > 0) {
        if (deliveredItems.length > 0) {
            return ORDER_STATUS.PARTIALLY_DELIVERED;
        }
        if (shippedItems.length > 0) {
            return ORDER_STATUS.PARTIALLY_CANCELLED;
        }
        return ORDER_STATUS.PARTIALLY_CANCELLED;
    }

    // All items delivered
    if (deliveredItems.length === totalItems) {
        return ORDER_STATUS.DELIVERED;
    }

    // All items shipped
    if (shippedItems.length === totalItems) {
        return ORDER_STATUS.SHIPPED;
    }

    // Mixed statuses
    if (deliveredItems.length > 0) {
        return ORDER_STATUS.PARTIALLY_DELIVERED;
    }
    
    if (shippedItems.length > 0) {
        return ORDER_STATUS.PARTIALLY_DELIVERED;
    }

    // All processing
    if (processingItems.length === totalItems) {
        return ORDER_STATUS.PROCESSING;
    }

    // Default
    return ORDER_STATUS.PENDING;
}



/**
 * Update order status with history
 * @param {String} orderId - Order ID
 * @param {String} newStatus - New status to set
 * @param {String} notes - Optional notes
 * @param {String} updatedBy - Who updated the status
 * @returns {Object} - Result object
 */
const updateOrderStatus = async (orderId, newStatus, notes = '') => {
  try {
    const order = await Order.findOne({ orderId }).populate('user');
    if (!order) {
      throw new Error('Order not found');
    }

    const oldStatus = order.status;
    
    console.log(`🔄 Updating order ${orderId}: ${oldStatus} → ${newStatus}`);
    console.log(`📋 Order has ${order.items.length} items`);
    
    // Update order status
    order.status = newStatus;
    order.statusHistory.push({
      status: newStatus,
      updatedAt: new Date(),
      notes: notes || `Status updated from ${oldStatus} to ${newStatus}`
    });

    // ✅ ENHANCED: Update all items to match order status and their payment statuses
    let itemsUpdated = 0;
    order.items.forEach((item, index) => {
      const oldItemStatus = item.status;
      const oldPaymentStatus = item.paymentStatus;
      
      console.log(`🔄 Processing item ${index + 1}/${order.items.length}:`, {
        itemId: item._id,
        oldStatus: oldItemStatus,
        oldPaymentStatus: oldPaymentStatus
      });
      
      // Update item status to match order status
      item.status = newStatus;
      
      // Add to item status history
      item.statusHistory.push({
        status: newStatus,
        updatedAt: new Date(),
        notes: `Item status updated to match order status: ${newStatus}`
      });

      // ✅ CRITICAL: Update item payment status based on new status
      const paymentChanged = updateAutomatedPaymentStatus(order, item, newStatus);
      
      console.log(`✅ Item ${index + 1} updated:`, {
        status: `${oldItemStatus} → ${item.status}`,
        payment: `${oldPaymentStatus} → ${item.paymentStatus}`,
        paymentChanged: paymentChanged
      });

      itemsUpdated++;
    });

    // ✅ AUTOMATED: Recalculate order-level payment status
    order.paymentStatus = calculatePaymentStatus(order);

    console.log(`💾 Saving order with ${itemsUpdated} items updated`);
    console.log(`📊 Final order payment status: ${order.paymentStatus}`);

    await order.save();

    console.log(`✅ Order ${orderId} updated successfully:`);
    console.log(`   Order Status: ${oldStatus} → ${order.status}`);
    console.log(`   Order Payment: ${order.paymentStatus}`);
    console.log(`   Items Updated: ${itemsUpdated}`);

    return {
      success: true,
      message: `Order status updated successfully. All ${itemsUpdated} items and payment statuses updated automatically.`,
      order: order
    };

  } catch (error) {
    console.error('❌ Error updating order status:', error);
    throw error;
  }
};

/**
 * Cancel entire order
 * @param {String} orderId - Order ID
 * @param {String} reason - Cancellation reason
 * @param {String} cancelledBy - Who cancelled the order
 * @returns {Object} - Result object
 */
const cancelOrder = async (orderId, reason = '', cancelledBy = null) => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order can be cancelled
    if (!canCancelOrder(order)) {
      throw new Error('Order cannot be cancelled in current status');
    }

    // ✅ ENHANCED: COD Cancellation Payment Status Logic
    let newPaymentStatus = order.paymentStatus;
    
    if (order.paymentMethod === 'cod') {
      newPaymentStatus = PAYMENT_STATUS.CANCELLED; // ✅ NEW: Set to 'Cancelled' for COD
      console.log(`🔄 COD order cancelled - Payment status set to 'Cancelled' for order: ${orderId}`);
    } else if (order.paymentStatus === PAYMENT_STATUS.COMPLETED) {
      newPaymentStatus = PAYMENT_STATUS.REFUNDED;
      console.log(`🔄 Online payment order cancelled - Payment status set to 'Refunded' for order: ${orderId}`);
    } else {
      newPaymentStatus = PAYMENT_STATUS.CANCELLED;
      console.log(`🔄 Unpaid order cancelled - Payment status set to 'Cancelled' for order: ${orderId}`);
    }

    // Update order status
    order.status = ORDER_STATUS.CANCELLED;
    order.paymentStatus = newPaymentStatus;
    order.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      notes: reason ? `Order cancelled. Reason: ${reason}` : 'Order cancelled',
      updatedAt: new Date()
    });

    // Update all cancellable items
    let updatedItemsCount = 0;
    order.items.forEach(item => {
      if ([ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING].includes(item.status)) {
        item.status = ORDER_STATUS.CANCELLED;
        item.paymentStatus = newPaymentStatus; // ✅ NEW: Apply same payment status logic to items
        item.cancellationReason = reason;
        item.cancellationDate = new Date();
        item.statusHistory.push({
          status: ORDER_STATUS.CANCELLED,
          notes: reason ? `Item cancelled. Reason: ${reason}` : 'Item cancelled',
          updatedAt: new Date()
        });
        updatedItemsCount++;
      }
    });

    await order.save();

    console.log(`Order ${orderId} cancelled. Items affected: ${updatedItemsCount}, Payment status: ${newPaymentStatus}`);

    return { 
      success: true, 
      order, 
      itemsAffected: updatedItemsCount,
      message: 'Order cancelled successfully'
    };
  } catch (error) {
    console.error('Error cancelling order:', error);
    throw error;
  }
};

// ✅ NEW: Add Payment Status Calculation Method
const calculatePaymentStatus = (order) => {
  const itemPaymentStatuses = order.items.map(item => item.paymentStatus);
  
  // All cancelled
  if (itemPaymentStatuses.every(status => status === PAYMENT_STATUS.CANCELLED)) {
    return PAYMENT_STATUS.CANCELLED;
  }
  
  // All completed
  if (itemPaymentStatuses.every(status => status === PAYMENT_STATUS.COMPLETED)) {
    return PAYMENT_STATUS.COMPLETED;
  }
  
  // All refunded
  if (itemPaymentStatuses.every(status => status === PAYMENT_STATUS.REFUNDED)) {
    return PAYMENT_STATUS.REFUNDED;
  }
  
  // Mix of completed and others
  if (itemPaymentStatuses.some(status => status === PAYMENT_STATUS.COMPLETED)) {
    return PAYMENT_STATUS.PARTIALLY_COMPLETED;
  }
  
  // Mix of refunded and others
  if (itemPaymentStatuses.some(status => status === PAYMENT_STATUS.REFUNDED)) {
    return PAYMENT_STATUS.PARTIALLY_REFUNDED;
  }
  
  // Default to pending
  return PAYMENT_STATUS.PENDING;
};


// Comprehensive automated payment status update
// ✅ FIXED: Separate logic for return request vs return approval
const updateAutomatedPaymentStatus = (order, item, newItemStatus) => {
  console.log('🔄 Updating payment status automatically:', {
    itemId: item._id,
    newStatus: newItemStatus,
    oldPaymentStatus: item.paymentStatus,
    paymentMethod: order.paymentMethod
  });

  const oldPaymentStatus = item.paymentStatus;

  switch (newItemStatus) {
    case ORDER_STATUS.DELIVERED:
      if (order.paymentMethod === 'cod') {
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
        console.log(`✅ COD item delivered - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
      }
      break;

    case ORDER_STATUS.CANCELLED:
      // ✅ ENHANCED: Always set to CANCELLED for cancelled items
      if (order.paymentMethod === 'cod') {
        item.paymentStatus = PAYMENT_STATUS.CANCELLED;
        console.log(`✅ COD item cancelled - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
      } else {
        // Online payments
        if (oldPaymentStatus === PAYMENT_STATUS.COMPLETED) {
          item.paymentStatus = PAYMENT_STATUS.REFUNDED;
          console.log(`✅ Online paid item cancelled - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
        } else {
          item.paymentStatus = PAYMENT_STATUS.CANCELLED;
          console.log(`✅ Online unpaid item cancelled - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
        }
      }
      break;

    case ORDER_STATUS.PROCESSING_RETURN:
      // Payment status unchanged during return request
      console.log(`ℹ️ Return request - Payment status unchanged: ${item.paymentStatus}`);
      break;

    case ORDER_STATUS.RETURNED:
      // Only when return is approved should payment status change
      if (order.paymentMethod === 'cod') {
        if (oldPaymentStatus === PAYMENT_STATUS.COMPLETED) {
          item.paymentStatus = PAYMENT_STATUS.REFUNDED;
          console.log(`✅ COD return approved - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
        } else {
          item.paymentStatus = PAYMENT_STATUS.CANCELLED;
          console.log(`✅ COD return approved - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
        }
      } else {
        if (oldPaymentStatus === PAYMENT_STATUS.COMPLETED) {
          item.paymentStatus = PAYMENT_STATUS.REFUNDED;
          console.log(`✅ Online return approved - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
        } else {
          item.paymentStatus = PAYMENT_STATUS.CANCELLED;
          console.log(`✅ Online return approved - Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
        }
      }
      break;

    default:
      // For other statuses, don't change payment status
      console.log(`ℹ️ Status "${newItemStatus}" - Payment status unchanged: ${item.paymentStatus}`);
      break;
  }

  // ✅ ENSURE: Payment status is never undefined
  if (!item.paymentStatus) {
    item.paymentStatus = PAYMENT_STATUS.PENDING;
    console.log(`⚠️ Payment status was undefined, set to PENDING`);
  }

  const changed = item.paymentStatus !== oldPaymentStatus;
  if (changed) {
    console.log(`✅ Payment status changed: ${oldPaymentStatus} → ${item.paymentStatus}`);
  }

  return changed;
};




/**
 * Cancel individual item
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} reason - Cancellation reason
 * @param {String} cancelledBy - Who cancelled the item
 * @returns {Object} - Result object
 */
const cancelItem = async (orderId, itemId, reason = '', notes = '', cancelledBy = null) => {
  try {
    const order = await Order.findOne({ orderId }).populate('user');
    if (!order) {
      throw new Error('Order not found');
    }

    const item = order.items.id(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Check if item can be cancelled
    if (!canCancelItem(order, itemId)) {
      throw new Error('Item cannot be cancelled in current status');
    }

    const oldStatus = item.status;
    const oldPaymentStatus = item.paymentStatus;

    // Update item status
    item.status = ORDER_STATUS.CANCELLED;
    item.cancellationReason = reason;
    item.cancellationDate = new Date();

    // ✅ AUTOMATED: Update payment status using new automated logic
    updateAutomatedPaymentStatus(order, item, ORDER_STATUS.CANCELLED);

    // Add to status history
    item.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      updatedAt: new Date(),
      notes: `Cancelled: ${reason}${notes ? ` - ${notes}` : ''}`
    });

    // ✅ AUTOMATED: Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: newOrderStatus === ORDER_STATUS.CANCELLED ? 'All items cancelled' : 'Order status updated due to item cancellation',
        updatedAt: new Date()
      });
    }

    // ✅ AUTOMATED: Recalculate order payment status
    order.paymentStatus = calculatePaymentStatus(order);

    await order.save();

    console.log(`✅ Item ${itemId} cancelled successfully:`);
    console.log(`   Status: ${oldStatus} → ${item.status}`);
    console.log(`   Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
    console.log(`   Order Status: ${order.status}`);
    console.log(`   Order Payment: ${order.paymentStatus}`);

    return { 
      success: true, 
      order, 
      newOrderStatus,
      message: 'Item cancelled successfully. Payment status updated automatically.'
    };
  } catch (error) {
    console.error('Error cancelling item:', error);
    throw error;
  }
};


/**
 * Update individual item status
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} newStatus - New status
 * @param {String} notes - Optional notes
 * @returns {Object} - Result object
 */


/**
 * Return entire order
 * @param {String} orderId - Order ID
 * @param {String} reason - Return reason
 * @returns {Object} - Result object
 */
const returnOrder = async (orderId, reason = '') => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order can be returned
    if (!canReturnOrder(order)) {
      throw new Error('Order can only be returned when delivered');
    }

    // Update order status
    order.status = ORDER_STATUS.RETURNED;
    order.statusHistory.push({
      status: ORDER_STATUS.RETURNED,  // ✅ FIXED: Was 'Returned'
      notes: reason ? `Order returned. Reason: ${reason}` : 'Order returned',
      updatedAt: new Date()
    });

    // Update all delivered items status
    let returnedItemsCount = 0;
    order.items.forEach(item => {
      if (item.status === ORDER_STATUS.DELIVERED) {
        item.status = ORDER_STATUS.RETURNED;  // ✅ FIXED: Was 'Returned'
        item.returnReason = reason;
        item.returnRequestDate = new Date();
        item.statusHistory.push({
          status: ORDER_STATUS.RETURNED,  // ✅ FIXED: Was 'Returned'
          notes: reason ? `Item returned. Reason: ${reason}` : 'Item returned',
          updatedAt: new Date()
        });
        returnedItemsCount++;
      }
    });

    await order.save();

    console.log(`Order ${orderId} returned. Items affected: ${returnedItemsCount}`);

    return { 
      success: true, 
      order, 
      itemsAffected: returnedItemsCount,
      message: 'Order return processed successfully'
    };
  } catch (error) {
    console.error('Error returning order:', error);
    throw error;
  }
};


/**
 * Return individual item
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} reason - Return reason
 * @param {String} returnedBy - Who initiated the return
 * @returns {Object} - Result object
 */
const returnItem = async (orderId, itemId, reason = '', notes = '', returnedBy = null) => {
  try {
    const order = await Order.findOne({ orderId }).populate('user');
    if (!order) {
      throw new Error('Order not found');
    }

    const item = order.items.id(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // ✅ ADD: Debug logging to see current status
    console.log('🔍 RETURN DEBUG - Item Status Check:');
    console.log('   Order ID:', orderId);
    console.log('   Item ID:', itemId);
    console.log('   Current Item Status:', item.status);
    console.log('   Order Status:', order.status);
    console.log('   Can Return Check:', canReturnItem(order, itemId));

    // ✅ UPDATED: Allow returns from both Delivered and Processing Return status
    const allowedStatusesForReturn = [ORDER_STATUS.DELIVERED, ORDER_STATUS.PROCESSING_RETURN];
    
    if (!allowedStatusesForReturn.includes(item.status)) {
      console.log(`❌ Item status validation failed. Current status: ${item.status}, Allowed: ${allowedStatusesForReturn.join(', ')}`);
      throw new Error(`Item cannot be returned in current status: ${item.status}. Must be Delivered or Processing Return.`);
    }

    const oldStatus = item.status;
    const oldPaymentStatus = item.paymentStatus;

    // ✅ UPDATED: When called from approveItemReturn, set to RETURNED, otherwise PROCESSING_RETURN
    if (item.status === ORDER_STATUS.PROCESSING_RETURN) {
      // This is approval - set to RETURNED
      item.status = ORDER_STATUS.RETURNED;
    } else {
      // This is initial request - set to PROCESSING_RETURN
      item.status = ORDER_STATUS.PROCESSING_RETURN;
    }
    
    item.returnReason = reason;
    item.returnRequestDate = new Date();

    // ✅ AUTOMATED: Update payment status using new automated logic
    updateAutomatedPaymentStatus(order, item, item.status);

    // Add to status history
    item.statusHistory.push({
      status: item.status,
      updatedAt: new Date(),
      notes: `Return ${item.status === ORDER_STATUS.RETURNED ? 'approved' : 'requested'}: ${reason}${notes ? ` - ${notes}` : ''}`
    });

    // ✅ AUTOMATED: Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: 'Order status updated due to item return request',
        updatedAt: new Date()
      });
    }

    // ✅ AUTOMATED: Recalculate order payment status
    order.paymentStatus = calculatePaymentStatus(order);

    await order.save();

    console.log(`✅ Item ${itemId} return processed successfully:`);
    console.log(`   Status: ${oldStatus} → ${item.status}`);
    console.log(`   Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
    console.log(`   Order Status: ${order.status}`);
    console.log(`   Order Payment: ${order.paymentStatus}`);

    return { 
      success: true, 
      order, 
      newOrderStatus,
      message: 'Item return processed successfully. Payment status updated automatically.'
    };
  } catch (error) {
    console.error('Error processing item return:', error);
    throw error;
  }
};

const canReturnItem = (order, itemId) => {
  const item = order.items.id(itemId);
  if (!item) {
    console.log('❌ canReturnItem: Item not found');
    return false;
  }
  
  // ✅ UPDATED: Allow returns from both Delivered and Processing Return status
  const allowedStatusesForReturn = [ORDER_STATUS.DELIVERED, ORDER_STATUS.PROCESSING_RETURN];
  
  console.log('🔍 canReturnItem Debug:');
  console.log('   Item Status:', item.status);
  console.log('   Allowed Statuses:', allowedStatusesForReturn);
  console.log('   Can Return:', allowedStatusesForReturn.includes(item.status));
  
  return allowedStatusesForReturn.includes(item.status);
};



// Create return request for entire order
const requestOrderReturn = async (orderId, reason = '', requestedBy = null) => {
  try {
    const order = await Order.findOne({ orderId: orderId })
      .populate('user')
      .populate({
        path: 'items.productId',
        select: 'productName mainImage'
      });

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order can be returned (only delivered orders)
    if (order.status !== ORDER_STATUS.DELIVERED) {
      throw new Error('Only delivered orders can be returned');
    }

    // Get all delivered items
    const deliveredItems = order.items.filter(item => item.status === ORDER_STATUS.DELIVERED);
    
    if (deliveredItems.length === 0) {
      throw new Error('No delivered items found to return');
    }

    // Check if return requests already exist for any items
    const existingReturns = await Return.find({
      orderId: orderId,
      userId: order.user._id,
      status: { $in: ['Pending', 'Approved', 'Processing'] }
    });

    if (existingReturns.length > 0) {
      throw new Error('Return requests already exist for some items in this order');
    }

    // Create return requests for all delivered items
    const returnRequests = [];
    for (const item of deliveredItems) {
      const returnRequest = new Return({
        orderId: orderId,
        itemId: item._id,
        userId: order.user._id,
        productId: item.productId ? item.productId._id : item.productId,
        productName: item.productId ? item.productId.productName : 'Product Name',
        productImage: item.productId ? item.productId.mainImage : null,
        sku: item.sku,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        reason: reason || 'Customer requested return',
        status: 'Pending'
      });

      await returnRequest.save();
      returnRequests.push(returnRequest);

      // Update item status to 'Processing Return'
      item.status = ORDER_STATUS.PROCESSING_RETURN;  // ✅ FIXED: Was 'Processing Return'
      item.returnReason = reason;
      item.returnRequestDate = new Date();
      item.statusHistory.push({
        status: ORDER_STATUS.PROCESSING_RETURN,  // ✅ FIXED: Was 'Processing Return'
        notes: reason ? `Return requested for entire order. Reason: ${reason}` : 'Return requested for entire order',
        updatedAt: new Date()
      });
    }

    // Update order status to 'Processing Return'
    order.status = ORDER_STATUS.PROCESSING_RETURN;  // ✅ FIXED: Was 'Processing Return'
    order.statusHistory.push({
      status: ORDER_STATUS.PROCESSING_RETURN,  // ✅ FIXED: Was 'Processing Return'
      notes: 'Return requested for entire order',
      updatedAt: new Date()
    });

    await order.save();

    console.log(`Return requests created for order ${orderId}. Items affected: ${returnRequests.length}`);

    return { 
      success: true, 
      order, 
      returnRequests,
      itemsAffected: returnRequests.length,
      message: `Return requests submitted for ${returnRequests.length} items`
    };

  } catch (error) {
    console.error('Error creating order return request:', error);
    throw error;
  }
};


/**
 * Create return request for individual item
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} reason - Return reason
 * @param {String} requestedBy - Who requested the return
 * @returns {Object} - Result object
 */
const requestItemReturn = async (orderId, itemId, reason = '', requestedBy = null) => {
  try {
    const order = await Order.findOne({ orderId: orderId })
      .populate('user')
      .populate({
        path: 'items.productId',
        select: 'productName mainImage'
      });

    if (!order) {
      throw new Error('Order not found');
    }

    const item = order.items.id(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Check if item can be returned (only delivered items)
    if (item.status !== ORDER_STATUS.DELIVERED) {
      throw new Error('Item can only be returned when delivered');
    }

    // Check if return request already exists for this item
    const existingReturn = await Return.findOne({
      orderId: orderId,
      itemId: itemId,
      status: { $in: ['Pending', 'Approved', 'Processing'] }
    });

    if (existingReturn) {
      throw new Error('Return request already exists for this item');
    }

    // Create return request
    const returnRequest = new Return({
      orderId: orderId,
      itemId: itemId,
      userId: order.user._id,
      productId: item.productId ? item.productId._id : item.productId,
      productName: item.productId ? item.productId.productName : 'Product Name',
      productImage: item.productId ? item.productId.mainImage : null,
      sku: item.sku,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      reason: reason || 'Customer requested return',
      status: 'Pending'
    });

    await returnRequest.save();

    // Update item status to 'Processing Return'
    item.status = ORDER_STATUS.PROCESSING_RETURN;  // ✅ FIXED: Was 'Processing Return'
    item.returnReason = reason;
    item.returnRequestDate = new Date();
    item.statusHistory.push({
      status: ORDER_STATUS.PROCESSING_RETURN,  // ✅ FIXED: Was 'Processing Return'
      notes: reason ? `Return requested. Reason: ${reason}` : 'Return requested',
      updatedAt: new Date()
    });

    // Recalculate order status based on all item statuses
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: 'Order status updated due to item return request',
        updatedAt: new Date()
      });
    }

    await order.save();

    console.log(`Return request created for item ${itemId} in order ${orderId}. Return ID: ${returnRequest.returnId}`);

    return { 
      success: true, 
      order, 
      returnRequest,
      newOrderStatus,
      message: 'Return request submitted successfully'
    };

  } catch (error) {
    console.error('Error creating item return request:', error);
    throw error;
  }
};


const approveItemReturn = async (returnId, approvedBy = null, customRefundAmount = null) => {
  try {
    // 1. Get and validate return request
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }
    
    if (returnRequest.status !== 'Pending') {
      throw new Error('Only pending return requests can be approved');
    }

    // 2. Get the order to validate
    const order = await Order.findOne({ orderId: returnRequest.orderId });
    if (!order) {
      throw new Error('Associated order not found');
    }

    const item = order.items.id(returnRequest.itemId);
    if (!item) {
      throw new Error('Associated item not found in order');
    }

    // ✅ FIXED: Check if item is already returned
    if (item.status === ORDER_STATUS.RETURNED) {
      console.log('✅ Item already returned, just updating return request status');
      
      // Item is already returned, just update the return request
      const refundAmount = customRefundAmount || returnRequest.totalPrice;
      returnRequest.status = 'Approved';
      returnRequest.refundAmount = refundAmount;
      returnRequest.approvedAt = new Date();
      returnRequest.approvedBy = approvedBy;
      returnRequest.refundStatus = 'Processed';
      returnRequest.refundMethod = 'Wallet';
      await returnRequest.save();

      // Add refund to user wallet
      await walletService.addReturnRefund(
        returnRequest.userId.toString(),
        refundAmount,
        returnRequest.orderId,
        returnRequest._id.toString()
      );

      console.log(`Return approved: ${returnRequest.returnId} for ₹${refundAmount}, wallet credited`);

      return {
        success: true,
        order: order,
        returnRequest: returnRequest,
        refundAmount: refundAmount,
        message: 'Return request approved successfully. Amount credited to user wallet.'
      };
    }

    // ✅ ORIGINAL LOGIC: For items not yet returned
    // 3. Use existing returnItem() function to complete the return
    const returnResult = await returnItem(
      returnRequest.orderId,
      returnRequest.itemId,
      returnRequest.reason,
      approvedBy
    );

    // 4. Update Return document status
    const refundAmount = customRefundAmount || returnRequest.totalPrice;
    returnRequest.status = 'Approved';
    returnRequest.refundAmount = refundAmount;
    returnRequest.approvedAt = new Date();
    returnRequest.approvedBy = approvedBy;
    returnRequest.refundStatus = 'Processed';
    returnRequest.refundMethod = 'Wallet';
    await returnRequest.save();

    // 5. Restore product stock
    const product = await Product.findById(returnRequest.productId);
    if (product) {
      const variant = product.variants.find(v => 
        v._id.toString() === (item.variantId ? item.variantId.toString() : item.productId.toString())
      );
      
      if (variant) {
        variant.stock += returnRequest.quantity;
        await product.save();
        console.log(`Stock restored: Added ${returnRequest.quantity} units to ${product.productName} (${returnRequest.size})`);
      }
    }

    // 6. Add refund to user wallet
    await walletService.addReturnRefund(
      returnRequest.userId.toString(),
      refundAmount,
      returnRequest.orderId,
      returnRequest._id.toString()
    );

    console.log(`Return approved: ${returnRequest.returnId} for ₹${refundAmount}, stock restored, wallet credited`);

    return {
      success: true,
      order: returnResult.order,
      returnRequest: returnRequest,
      refundAmount: refundAmount,
      message: 'Return request approved successfully. Stock updated and amount credited to user wallet.'
    };

  } catch (error) {
    console.error('Error approving item return:', error);
    throw error;
  }
};


// ✅ ADD: Missing approveOrderReturn function
const approveOrderReturn = async (orderId, approvedBy = null) => {
  try {
    // 1. Find all pending return requests for this order
    const returnRequests = await Return.find({
      orderId: orderId,
      status: 'Pending'
    });
    
    if (returnRequests.length === 0) {
      throw new Error('No pending return requests found for this order');
    }

    // 2. Get the order to validate
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    // 3. Use existing returnOrder() function to complete all returns
    const returnResult = await returnOrder(orderId, returnRequests[0].reason);

    let totalRefundAmount = 0;
    const approvedReturns = [];

    // 4. Process each return request
    for (const returnRequest of returnRequests) {
      const item = order.items.id(returnRequest.itemId);
      if (!item) {
        console.warn(`Item ${returnRequest.itemId} not found in order ${orderId}`);
        continue;
      }

      // Update Return document
      const refundAmount = returnRequest.totalPrice;
      returnRequest.status = 'Approved';
      returnRequest.refundAmount = refundAmount;
      returnRequest.approvedAt = new Date();
      returnRequest.approvedBy = approvedBy;
      returnRequest.refundStatus = 'Processed';
      returnRequest.refundMethod = 'wallet';
      await returnRequest.save();

      // Restore product stock
      const product = await Product.findById(returnRequest.productId);
      if (product) {
        const variant = product.variants.find(v => 
          v._id.toString() === (item.variantId ? item.variantId.toString() : item.productId.toString())
        );
        
        if (variant) {
          variant.stock += returnRequest.quantity;
          await product.save();
          console.log(`Stock restored: Added ${returnRequest.quantity} units to ${product.productName} (${returnRequest.size})`);
        }
      }

      totalRefundAmount += refundAmount;
      approvedReturns.push(returnRequest);
    }

    // 5. Add total refund amount to user wallet
    if (totalRefundAmount > 0 && returnRequests.length > 0) {
      await walletService.addReturnRefund(
        returnRequests[0].userId.toString(),
        totalRefundAmount,
        orderId,
        'BULK_' + Date.now() // Bulk return identifier
      );
    }

    console.log(`Order return approved: ${orderId}, ${approvedReturns.length} items, total refund: ₹${totalRefundAmount}`);

    return {
      success: true,
      order: returnResult.order,
      returnRequests: approvedReturns,
      itemsAffected: approvedReturns.length,
      totalRefundAmount: totalRefundAmount,
      message: `All return requests approved successfully. ${approvedReturns.length} items returned, ₹${totalRefundAmount} refunded to wallet.`
    };

  } catch (error) {
    console.error('Error approving order return:', error);
    throw error;
  }
};

// ✅ ADD: Missing rejectItemReturn function
const rejectItemReturn = async (returnId, rejectedBy = null, rejectionReason = '') => {
  try {
    // 1. Get and validate return request
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }
    
    if (returnRequest.status !== 'Pending') {
      throw new Error('Only pending return requests can be rejected');
    }

    // 2. Get the order and item
    const order = await Order.findOne({ orderId: returnRequest.orderId });
    if (!order) {
      throw new Error('Associated order not found');
    }

    const item = order.items.id(returnRequest.itemId);
    if (!item) {
      throw new Error('Associated item not found in order');
    }

    // 3. Update Return document status to rejected
    returnRequest.status = 'Rejected';
    returnRequest.rejectedAt = new Date();
    returnRequest.rejectedBy = rejectedBy;
    returnRequest.rejectionReason = rejectionReason || 'Return request rejected by admin';
    await returnRequest.save();

    // 4. Update item status back to ORDER_STATUS.DELIVERED (since return is rejected)
    item.status = ORDER_STATUS.DELIVERED;
    item.statusHistory.push({
      status: ORDER_STATUS.DELIVERED,
      notes: `Return request rejected. Reason: ${rejectionReason || 'Rejected by admin'}`,
      updatedAt: new Date()
    });

    // 5. Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: 'Order status updated due to return request rejection',
        updatedAt: new Date()
      });
    }

    await order.save();

    console.log(`Return rejected: ${returnRequest.returnId}, item status reverted to Delivered`);

    return {
      success: true,
      order: order,
      returnRequest: returnRequest,
      newOrderStatus: newOrderStatus,
      message: 'Return request rejected successfully. Item status reverted to delivered.'
    };

  } catch (error) {
    console.error('Error rejecting item return:', error);
    throw error;
  }
};

// ✅ ADD: Missing rejectOrderReturn function
const rejectOrderReturn = async (orderId, rejectedBy = null, rejectionReason = '') => {
  try {
    // 1. Find all pending return requests for this order
    const returnRequests = await Return.find({
      orderId: orderId,
      status: 'Pending'
    });
    
    if (returnRequests.length === 0) {
      throw new Error('No pending return requests found for this order');
    }

    // 2. Get the order
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    const rejectedReturns = [];

    // 3. Process each return request
    for (const returnRequest of returnRequests) {
      const item = order.items.id(returnRequest.itemId);
      if (!item) {
        console.warn(`Item ${returnRequest.itemId} not found in order ${orderId}`);
        continue;
      }

      // Update Return document to rejected
      returnRequest.status = 'Rejected';
      returnRequest.rejectedAt = new Date();
      returnRequest.rejectedBy = rejectedBy;
      returnRequest.rejectionReason = rejectionReason || 'Return request rejected by admin';
      await returnRequest.save();

      // Update item status back to ORDER_STATUS.DELIVERED
      item.status = ORDER_STATUS.DELIVERED;
      item.statusHistory.push({
        status: ORDER_STATUS.DELIVERED,
        notes: `Return request rejected. Reason: ${rejectionReason || 'Rejected by admin'}`,
        updatedAt: new Date()
      });

      rejectedReturns.push(returnRequest);
    }

    // 4. Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: 'Order status updated due to return requests rejection',
        updatedAt: new Date()
      });
    }

    await order.save();

    console.log(`Order returns rejected: ${orderId}, ${rejectedReturns.length} items rejected`);

    return {
      success: true,
      order: order,
      returnRequests: rejectedReturns,
      itemsAffected: rejectedReturns.length,
      newOrderStatus: newOrderStatus,
      message: `All return requests rejected successfully. ${rejectedReturns.length} items reverted to delivered status.`
    };

  } catch (error) {
    console.error('Error rejecting order return:', error);
    throw error;
  }
};

const getValidTransitions = (currentStatus) => {
  const transitions = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
    [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.PROCESSING_RETURN],
    [ORDER_STATUS.PROCESSING_RETURN]: [ORDER_STATUS.RETURNED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.RETURNED]: []
  };
  
  return transitions[currentStatus] || [];
};

const isValidStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = getValidTransitions(currentStatus);
  return validTransitions.includes(newStatus);
};


module.exports = {
  // Status Management Functions
  updateAutomatedPaymentStatus,
  calculateOrderStatus,
  calculatePaymentStatus,
  completePaymentOnDelivery,
  updateOrderStatus,

  // Cancellation Functions  
  cancelOrder,
  cancelItem,

  // Return Functions
  returnOrder,
  returnItem,
  requestOrderReturn,
  requestItemReturn,

  // Return Management (Admin Functions)
  approveItemReturn,
  approveOrderReturn,
  rejectItemReturn,
  rejectOrderReturn,

  getValidTransitions,
  isValidStatusTransition
};