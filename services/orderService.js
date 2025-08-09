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
const calculateOrderStatus = (items) => {
  const itemStatuses = items.map(item => item.status);
  const uniqueStatuses = [...new Set(itemStatuses)];
  
  // ✅ Use enum constants instead of hardcoded strings
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.CANCELLED) {
    return ORDER_STATUS.CANCELLED;
  }
  
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.RETURNED) {
    return ORDER_STATUS.RETURNED;
  }
  
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.DELIVERED) {
    return ORDER_STATUS.DELIVERED;
  }
  
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.SHIPPED) {
    return ORDER_STATUS.SHIPPED;
  }
  
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.PROCESSING) {
    return ORDER_STATUS.PROCESSING;
  }
  
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.PENDING) {
    return ORDER_STATUS.PENDING;
  }
  
  if (uniqueStatuses.length === 1 && uniqueStatuses[0] === ORDER_STATUS.PROCESSING_RETURN) {
    return ORDER_STATUS.PROCESSING_RETURN;
  }
  
  // Handle mixed statuses
  if (itemStatuses.includes(ORDER_STATUS.CANCELLED) && !itemStatuses.every(status => status === ORDER_STATUS.CANCELLED)) {
    return ORDER_STATUS.PARTIALLY_CANCELLED;
  }
  
  if (itemStatuses.includes(ORDER_STATUS.RETURNED) && !itemStatuses.every(status => status === ORDER_STATUS.RETURNED)) {
    return ORDER_STATUS.PARTIALLY_RETURNED;
  }
  
  if (itemStatuses.includes(ORDER_STATUS.DELIVERED) && !itemStatuses.every(status => status === ORDER_STATUS.DELIVERED)) {
    return ORDER_STATUS.PARTIALLY_DELIVERED;
  }
  
  // Status priority using enum constants
  const statusPriority = {
    [ORDER_STATUS.PENDING]: 1,
    [ORDER_STATUS.PROCESSING]: 2,
    [ORDER_STATUS.SHIPPED]: 3,
    [ORDER_STATUS.DELIVERED]: 4,
    [ORDER_STATUS.PROCESSING_RETURN]: 5,
    [ORDER_STATUS.RETURNED]: 6,
    [ORDER_STATUS.CANCELLED]: 7
  };
  
  const maxPriority = Math.max(...itemStatuses.map(status => statusPriority[status] || 0));
  return Object.keys(statusPriority).find(status => statusPriority[status] === maxPriority) || ORDER_STATUS.PENDING;
};


/**
 * Update order status with history
 * @param {String} orderId - Order ID
 * @param {String} newStatus - New status to set
 * @param {String} notes - Optional notes
 * @param {String} updatedBy - Who updated the status
 * @returns {Object} - Result object
 */
const updateOrderStatus = async (orderId, newStatus, notes = '', updatedBy = null) => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }


    const oldStatus = order.status;
    
    // Update status
    order.status = newStatus;

    // Auto-complete COD payment when order is delivered
    if (newStatus === ORDER_STATUS.DELIVERED && order.paymentMethod === 'cod') {
      order.paymentStatus = PAYMENT_STATUS.COMPLETED; // Cash collected at delivery
    }

    // Update items status and payment status
    order.items.forEach(item => {
      // Update item status
      item.status = newStatus;
      
      // ✅ ADD: Update item payment status for COD deliveries
      if (newStatus === ORDER_STATUS.DELIVERED && order.paymentMethod === 'cod') {
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
      }
    });



    order.statusHistory.push({
      status: newStatus,
      notes: notes,
      updatedAt: new Date()
    });


    await order.save();


    // Log activity (when implemented)
    // await logActivity({
    //   type: 'ORDER_STATUS_UPDATE',
    //   orderId: order.orderId,
    //   oldStatus,
    //   newStatus,
    //   notes,
    //   updatedBy
    // });


    // Send notification (when implemented)
    // await sendNotification({
    //   userId: order.user,
    //   type: 'ORDER_STATUS_CHANGED',
    //   orderId: order.orderId,
    //   status: newStatus,
    //   message: `Your order #${order.orderId} status has been updated to ${newStatus}`
    // });


    console.log(`Order ${orderId} status updated from ${oldStatus} to ${newStatus}`);


    return { 
      success: true, 
      order, 
      oldStatus, 
      newStatus,
      message: `Order status updated to ${newStatus}` 
    };
  } catch (error) {
    console.error('Error updating order status:', error);
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

    // Determine payment status for entire order
    let newPaymentStatus = order.paymentStatus;
    
    if (order.paymentMethod === 'cod') {
      newPaymentStatus = PAYMENT_STATUS.PENDING;
    } else if (order.paymentStatus === PAYMENT_STATUS.COMPLETED) {
      newPaymentStatus = PAYMENT_STATUS.REFUNDED;
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
        item.paymentStatus = newPaymentStatus;
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


    // Log activity (when implemented)
    // await logActivity({
    //   type: 'ORDER_CANCELLED',
    //   orderId: order.orderId,
    //   reason,
    //   itemsAffected: updatedItemsCount,
    //   cancelledBy
    // });


    console.log(`Order ${orderId} cancelled. Items affected: ${updatedItemsCount}`);


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


/**
 * Cancel individual item
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} reason - Cancellation reason
 * @param {String} cancelledBy - Who cancelled the item
 * @returns {Object} - Result object
 */
const cancelItem = async (orderId, itemId, reason = '', cancelledBy = null) => {
  try {
    const order = await Order.findOne({ orderId: orderId });
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

    // Payment status logic based on payment method
    let newPaymentStatus = item.paymentStatus; // Default: keep current

    if (order.paymentMethod === 'cod') {
      // COD orders - no payment taken yet
      newPaymentStatus = PAYMENT_STATUS.PENDING;
    } else if (item.paymentStatus === PAYMENT_STATUS.COMPLETED) {
      // Online paid orders - initiate refund
      newPaymentStatus = PAYMENT_STATUS.REFUNDED;
    }

    // Update item status
    item.status = ORDER_STATUS.CANCELLED;
    item.paymentStatus = newPaymentStatus;
    item.cancellationReason = reason;
    item.cancellationDate = new Date();
    item.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      notes: reason ? `Item cancelled. Reason: ${reason}` : 'Item cancelled',
      updatedAt: new Date()
    });


    // Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: newOrderStatus === ORDER_STATUS.CANCELLED ? 'All items cancelled' : 'Order status updated due to item cancellation',
        updatedAt: new Date()
      });
    }


    await order.save();


    // Log activity (when implemented)
    // await logActivity({
    //   type: 'ITEM_CANCELLED',
    //   orderId: order.orderId,
    //   itemId: itemId,
    //   reason,
    //   newOrderStatus,
    //   cancelledBy
    // });


    // Send notification (when implemented)
    // await sendNotification({
    //   userId: order.user,
    //   type: 'ITEM_CANCELLED',
    //   orderId: order.orderId,
    //   itemId: itemId,
    //   message: `Item in order #${order.orderId} has been cancelled`
    // });


    console.log(`Item ${itemId} in order ${orderId} cancelled. New order status: ${newOrderStatus}`);


    return { 
      success: true, 
      order, 
      newOrderStatus,
      message: 'Item cancelled successfully'
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
const updateItemStatus = async (orderId, itemId, newStatus, notes = '') => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }


    const item = order.items.id(itemId);
    if (!item) {
      throw new Error('Item not found');
    }


    const oldStatus = item.status;

    // Validate status transition
    if (!isValidStatusTransition(oldStatus, newStatus)) {
      throw new Error(`Invalid status transition from '${oldStatus}' to '${newStatus}'. Allowed transitions from '${oldStatus}': ${getValidTransitions(oldStatus).join(', ') || 'None'}`);
    }


    // Update item status
    item.status = newStatus;
    item.statusHistory.push({
      status: newStatus,
      notes: notes || `Item status updated to ${newStatus}`,
      updatedAt: new Date()
    });


    // Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: `Order status updated to ${newOrderStatus} due to item status changes`,
        updatedAt: new Date()
      });
    }


    await order.save();


    console.log(`Item ${itemId} status updated from ${oldStatus} to ${newStatus}. Order status: ${newOrderStatus}`);


    return { 
      success: true, 
      order, 
      newOrderStatus,
      oldItemStatus: oldStatus,
      newItemStatus: newStatus,
      message: 'Item status updated successfully'
    };
  } catch (error) {
    console.error('Error updating item status:', error);
    throw error;
  }
};


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
const returnItem = async (orderId, itemId, reason = '', completedBy = null) => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    const item = order.items.id(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Check if item can be returned
    if (!canReturnItem(order, itemId)) {
      throw new Error('Item can only be returned when delivered');
    }

    // ✅ ADD: Store old payment status for logging
    const oldPaymentStatus = item.paymentStatus;

    // COMPLETE the return (not just request)
    item.status = ORDER_STATUS.RETURNED;
    item.returnReason = reason;
    item.returnRequestDate = new Date();
    
    // ✅ ADD: Handle payment status for returns based on payment method
    if (order.paymentMethod === 'cod') {
      if (item.paymentStatus === PAYMENT_STATUS.COMPLETED) {
        // COD order was delivered and cash collected - needs refund
        item.paymentStatus = PAYMENT_STATUS.REFUNDED;
        console.log(`💰 COD Refund required for item ${itemId} - Cash needs to be returned to customer`);
      } else {
        // COD order was never delivered - no refund needed
        item.paymentStatus = PAYMENT_STATUS.PENDING;
        console.log(`📦 COD item ${itemId} returned before delivery - No refund needed`);
      }
    } else {
      // Online orders - always refund (for when you implement online payments)
      item.paymentStatus = PAYMENT_STATUS.REFUNDED;
      console.log(`💳 Online payment refund initiated for item ${itemId}`);
    }

    item.statusHistory.push({
      status: ORDER_STATUS.RETURNED,
      notes: reason ? `Item return completed. Reason: ${reason}` : 'Item return completed',
      updatedAt: new Date()
    });

    // Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: 'Order status updated due to completed return',
        updatedAt: new Date()
      });
    }

    await order.save();

    // ✅ ENHANCED: More detailed logging with payment status changes
    console.log(`Item ${itemId} in order ${orderId} return completed. New order status: ${newOrderStatus}`);
    if (oldPaymentStatus !== item.paymentStatus) {
      console.log(`Payment status updated: ${oldPaymentStatus} → ${item.paymentStatus}`);
    }

    return { 
      success: true, 
      order, 
      newOrderStatus,
      oldPaymentStatus,        // ✅ ADD: Include in return for logging
      newPaymentStatus: item.paymentStatus,  // ✅ ADD: Include in return
      message: 'Item return completed successfully'
    };
  } catch (error) {
    console.error('Error completing item return:', error);
    throw error;
  }
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
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Get and validate return request
    const returnRequest = await Return.findById(returnId).session(session);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }
    
    if (returnRequest.status !== 'Pending') {
      throw new Error('Only pending return requests can be approved');
    }

    // 2. Get the order to validate
    const order = await Order.findOne({ orderId: returnRequest.orderId }).session(session);
    if (!order) {
      throw new Error('Associated order not found');
    }

    const item = order.items.id(returnRequest.itemId);
    if (!item) {
      throw new Error('Associated item not found in order');
    }

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
    returnRequest.refundMethod = 'wallet';
    await returnRequest.save({ session });

    // 5. Restore product stock
    const product = await Product.findById(returnRequest.productId).session(session);
    if (product) {
      const variant = product.variants.find(v => 
        v._id.toString() === (item.variantId ? item.variantId.toString() : item.productId.toString())
      );
      
      if (variant) {
        variant.stock += returnRequest.quantity;
        await product.save({ session });
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

    await session.commitTransaction();

    console.log(`Return approved: ${returnRequest.returnId} for ₹${refundAmount}, stock restored, wallet credited`);

    return {
      success: true,
      order: returnResult.order,
      returnRequest: returnRequest,
      refundAmount: refundAmount,
      message: 'Return request approved successfully. Stock updated and amount credited to user wallet.'
    };

  } catch (error) {
    await session.abortTransaction();
    console.error('Error approving item return:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Approve all pending return requests for an order
 * @param {String} orderId - Order ID
 * @param {String} approvedBy - Who approved the returns
 * @returns {Object} - Result object
 */
const approveOrderReturn = async (orderId, approvedBy = null) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Find all pending return requests for this order
    const returnRequests = await Return.find({
      orderId: orderId,
      status: 'Pending'
    }).session(session);
    
    if (returnRequests.length === 0) {
      throw new Error('No pending return requests found for this order');
    }

    // 2. Get the order to validate
    const order = await Order.findOne({ orderId: orderId }).session(session);
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
      await returnRequest.save({ session });

      // Restore product stock
      const product = await Product.findById(returnRequest.productId).session(session);
      if (product) {
        const variant = product.variants.find(v => 
          v._id.toString() === (item.variantId ? item.variantId.toString() : item.productId.toString())
        );
        
        if (variant) {
          variant.stock += returnRequest.quantity;
          await product.save({ session });
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

    await session.commitTransaction();

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
    await session.abortTransaction();
    console.error('Error approving order return:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Reject individual item return request
 * @param {String} returnId - Return request ID
 * @param {String} rejectedBy - Who rejected the return
 * @param {String} rejectionReason - Reason for rejection
 * @returns {Object} - Result object
 */
const rejectItemReturn = async (returnId, rejectedBy = null, rejectionReason = '') => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Get and validate return request
    const returnRequest = await Return.findById(returnId).session(session);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }
    
    if (returnRequest.status !== 'Pending') {
      throw new Error('Only pending return requests can be rejected');
    }

    // 2. Get the order and item
    const order = await Order.findOne({ orderId: returnRequest.orderId }).session(session);
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
    await returnRequest.save({ session });

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

    await order.save({ session });
    await session.commitTransaction();

    console.log(`Return rejected: ${returnRequest.returnId}, item status reverted to Delivered`);

    return {
      success: true,
      order: order,
      returnRequest: returnRequest,
      newOrderStatus: newOrderStatus,
      message: 'Return request rejected successfully. Item status reverted to delivered.'
    };

  } catch (error) {
    await session.abortTransaction();
    console.error('Error rejecting item return:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Reject all pending return requests for an order
 * @param {String} orderId - Order ID
 * @param {String} rejectedBy - Who rejected the returns
 * @param {String} rejectionReason - Reason for rejection
 * @returns {Object} - Result object
 */
const rejectOrderReturn = async (orderId, rejectedBy = null, rejectionReason = '') => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Find all pending return requests for this order
    const returnRequests = await Return.find({
      orderId: orderId,
      status: 'Pending'
    }).session(session);
    
    if (returnRequests.length === 0) {
      throw new Error('No pending return requests found for this order');
    }

    // 2. Get the order
    const order = await Order.findOne({ orderId: orderId }).session(session);
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
      await returnRequest.save({ session });

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

    await order.save({ session });
    await session.commitTransaction();

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
    await session.abortTransaction();
    console.error('Error rejecting order return:', error);
    throw error;
  } finally {
    session.endSession();
  }
};








// Validation functions


/**
 * Check if order can be cancelled
 * @param {Object} order - Order object
 * @returns {Boolean}
 */
const canCancelOrder = (order) => {
  return [ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING].includes(order.status);
};


/**
 * Check if order can be returned
 * @param {Object} order - Order object
 * @returns {Boolean}
 */
const canReturnOrder = (order) => {
  return order.status === ORDER_STATUS.DELIVERED;
};


/**
 * Check if individual item can be cancelled
 * @param {Object} order - Order object
 * @param {String} itemId - Item ID
 * @returns {Boolean}
 */
const canCancelItem = (order, itemId) => {
  const item = order.items.id(itemId);
  return item && [ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING].includes(item.status);
};


/**
 * Check if individual item can be returned
 * @param {Object} order - Order object
 * @param {String} itemId - Item ID
 * @returns {Boolean}
 */
const canReturnItem = (order, itemId) => {
  const item = order.items.id(itemId);
  return item && item.status === ORDER_STATUS.DELIVERED;
};


/**
 * Validate if status transition is allowed
 * @param {String} currentStatus - Current status
 * @param {String} newStatus - New status to transition to
 * @returns {Boolean}
 */
const isValidStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
    [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.PROCESSING_RETURN, ORDER_STATUS.RETURNED],
    [ORDER_STATUS.PROCESSING_RETURN]: [ORDER_STATUS.RETURNED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.RETURNED]: []
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
};



/**
 * Get valid transitions for a given status
 * @param {String} currentStatus - Current status
 * @returns {Array} - Array of valid next statuses
 */
const getValidTransitions = (currentStatus) => {
  const validTransitions = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
    [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.PROCESSING_RETURN, ORDER_STATUS.RETURNED],
    [ORDER_STATUS.PROCESSING_RETURN]: [ORDER_STATUS.RETURNED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.RETURNED]: []
  };

  return validTransitions[currentStatus] || [];
};



/**
 * Get order with all validations and status info
 * @param {String} orderId - Order ID
 * @returns {Object} - Enhanced order object
 */
const getOrderWithStatus = async (orderId) => {
  try {
    const order = await Order.findOne({ orderId: orderId })
      .populate('user')
      .populate('items.productId');


    if (!order) {
      throw new Error('Order not found');
    }


    // Add validation flags for each item
    const enhancedItems = order.items.map(item => ({
      ...item.toObject(),
      canCancel: canCancelItem(order, item._id),
      canReturn: canReturnItem(order, item._id)
    }));


    return {
      ...order.toObject(),
      items: enhancedItems,
      canCancelOrder: canCancelOrder(order),
      canReturnOrder: canReturnOrder(order)
    };
  } catch (error) {
    console.error('Error getting order with status:', error);
    throw error;
  }
};



module.exports = {
  completePaymentOnDelivery,
  calculateOrderStatus,
  updateOrderStatus,
  cancelOrder,
  cancelItem,
  updateItemStatus,
  returnOrder,                
  returnItem,                 
  requestOrderReturn,        
  requestItemReturn,
  approveOrderReturn,         
  approveItemReturn,  
  rejectOrderReturn,          
  rejectItemReturn,                   
  canCancelOrder,
  canReturnOrder,
  canCancelItem,
  canReturnItem,
  getOrderWithStatus,
  isValidStatusTransition,
  getValidTransitions
};

