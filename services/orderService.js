const Order = require('../models/Order');
const Return = require('../models/Return');
const walletService = require('./paymentProviders/walletService');
const Product = require('../models/Product');
const mongoose = require('mongoose');
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

    if (order.paymentMethod !== 'cod') {
      return { success: false, message: 'Not a COD order' };
    }

    if (order.status !== ORDER_STATUS.DELIVERED) {
      return { success: false, message: 'Order not in delivered status' };
    }

    order.paymentStatus = PAYMENT_STATUS.COMPLETED;
    

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


function calculateOrderStatus(items) {
  // Counters (all start at 0)
  let pending = 0, processing = 0, shipped = 0, delivered = 0, 
      cancelled = 0, failed = 0, processingReturn = 0, returned = 0;

  // ✅ FIX: Loop over items and access .status property
  for (const item of items) {
    console.log('📊 DEBUG Item status:', item.status); // ✅ DEBUG
    switch (item.status) {  // ✅ Access the status property
      case ORDER_STATUS.PENDING:
        pending++;
        break;
      case ORDER_STATUS.PROCESSING:
        processing++;
        break;
      case ORDER_STATUS.SHIPPED:
        shipped++;
        break;
      case ORDER_STATUS.DELIVERED:
        delivered++;
        break;
      case ORDER_STATUS.CANCELLED:
        cancelled++;
        break;
      case ORDER_STATUS.FAILED:
        failed++;
        break;
      case ORDER_STATUS.PROCESSING_RETURN:
        processingReturn++;
        break;
      case ORDER_STATUS.RETURNED:
        returned++;
        break;
    }
  }

  const total = items.length;
  const activeItems = total - cancelled; // active = not cancelled

  console.log('📊 DEBUG Counts:', { // ✅ DEBUG
    total, 
    delivered, 
    cancelled, 
    shipped, 
    processing, 
    pending,
    returned, 
    processingReturn, 
    failed,
    activeItems
  });

  // Failed (if any failed)
  if (failed > 0) {
    console.log('📊 DEBUG Result: Failed'); // ✅ DEBUG
    return failed === total ? ORDER_STATUS.FAILED : 'Failed';
  }

  // 1. All cancelled
  if (cancelled === total) {
    console.log('📊 DEBUG Result: All Cancelled'); // ✅ DEBUG
    return ORDER_STATUS.CANCELLED;
  }

  // 2. All processing-return
  if (processingReturn === total) {
    console.log('📊 DEBUG Result: All Processing Return'); // ✅ DEBUG
    return ORDER_STATUS.PROCESSING_RETURN;
  }

  // 3. Returned outranks everything
  if (returned > 0) {
    const result = returned === total ? ORDER_STATUS.RETURNED : ORDER_STATUS.PARTIALLY_RETURNED;
    console.log('📊 DEBUG Result: Returned ->', result); // ✅ DEBUG
    return result;
  }

  // 4. Delivered family
  if (delivered > 0) {
    const result = delivered === total ? ORDER_STATUS.DELIVERED : ORDER_STATUS.PARTIALLY_DELIVERED;
    console.log('📊 DEBUG Result: Delivered ->', result, '(delivered:', delivered, 'total:', total, ')'); // ✅ DEBUG
    return result;
  }

  // 5. Shipped vs Processing
  if (activeItems > 0 && shipped === activeItems) {
    console.log('📊 DEBUG Result: Shipped'); // ✅ DEBUG
    return ORDER_STATUS.SHIPPED;
  }

  if (shipped > 0 || processing > 0) {
    console.log('📊 DEBUG Result: Processing'); // ✅ DEBUG
    return ORDER_STATUS.PROCESSING;
  }

  // 6. Default: Pending (every remaining item is still pending)
  console.log('📊 DEBUG Result: Pending (default)'); // ✅ DEBUG
  return ORDER_STATUS.PENDING;
}


 

const isFinalStatus = (status) => {
  const finalStatuses = [
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.FAILED
  ];
  return finalStatuses.includes(status);
};



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

    // Update all items to match order status and their payment statuses
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

    // ✅ NEW: COD Transaction Creation - Only when COD order is delivered
    if (newStatus === ORDER_STATUS.DELIVERED && 
        order.paymentMethod === 'cod' && 
        order.paymentStatus === PAYMENT_STATUS.COMPLETED) {
      
      try {
        console.log(`🔄 Creating COD completion transaction for delivered order ${orderId}`);
        
        const transactionService = require('./transactionService');
        const codTransactionResult = await transactionService.createCODCompletionTransaction({
          userId: order.user._id,
          orderId: orderId,
          amount: order.totalAmount,
          itemDetails: order.items.map(item => ({
            productId: item.productId,
            size: item.size,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice
          }))
        });

        if (codTransactionResult.success) {
          console.log(`✅ COD completion transaction created: ${codTransactionResult.transactionId}`);
          
          // Add transaction reference to order status history
          order.statusHistory.push({
            status: newStatus,
            updatedAt: new Date(),
            notes: `COD payment completed. Transaction ID: ${codTransactionResult.transactionId}`
          });
          
          await order.save(); // Save again with transaction reference
        } else {
          console.warn('⚠️ Failed to create COD completion transaction:', codTransactionResult.error);
        }
        
      } catch (codTxError) {
        console.error('❌ Error creating COD completion transaction:', codTxError.message);
        // Don't throw - allow order status update to succeed even if transaction creation fails
      }
    }

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
 * Update individual item status within an order
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID within the order
 * @param {String} newStatus - New status to set
 * @param {String} notes - Optional notes
 * @param {String} updatedBy - Who updated the status
 * @returns {Object} - Result object with updated order
 */
const updateItemStatus = async (orderId, itemId, newStatus, notes = '', updatedBy = null) => {
  try {
    const order = await Order.findOne({ orderId }).populate('user');
    if (!order) {
      throw new Error('Order not found');
    }

    const item = order.items.id(itemId);
    if (!item) {
      throw new Error('Item not found in order');
    }

    const oldStatus = item.status;
    const oldPaymentStatus = item.paymentStatus;
    
    console.log(`🔄 Updating item ${itemId} status: ${oldStatus} → ${newStatus}`);

    // Validate status transition using existing validation
    if (!isValidStatusTransition(oldStatus, newStatus)) {
      const validTransitions = getValidTransitions(oldStatus);
      throw new Error(`Invalid item status transition from '${oldStatus}' to '${newStatus}'. Valid transitions: ${validTransitions.join(', ')}`);
    }

    // Update item status
    item.status = newStatus;
    
    // Add to item status history
    item.statusHistory.push({
      status: newStatus,
      updatedAt: new Date(),
      notes: notes || `Item status updated from ${oldStatus} to ${newStatus}`,
      updatedBy: updatedBy
    });

    // ✅ AUTOMATED: Update item payment status using existing logic
    updateAutomatedPaymentStatus(order, item, newStatus);

    // ✅ AUTOMATED: Recalculate order-level status based on all items
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: `Order status updated due to item status change: ${oldStatus} → ${newStatus}`,
        updatedAt: new Date(),
        updatedBy: updatedBy
      });
    }

    // ✅ AUTOMATED: Recalculate order-level payment status
    order.paymentStatus = calculatePaymentStatus(order);

    await order.save();

    console.log(`✅ Item ${itemId} status updated successfully:`);
    console.log(`   Item Status: ${oldStatus} → ${item.status}`);
    console.log(`   Item Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
    console.log(`   Order Status: ${order.status}`);
    console.log(`   Order Payment: ${order.paymentStatus}`);

    return {
      success: true,
      message: `Item status updated successfully. Order status recalculated automatically.`,
      order: order,
      itemUpdated: {
        itemId: itemId,
        previousStatus: oldStatus,
        newStatus: item.status,
        previousPaymentStatus: oldPaymentStatus,
        newPaymentStatus: item.paymentStatus
      }
    };

  } catch (error) {
    console.error('❌ Error updating item status:', error);
    throw error;
  }
};



/**
 * Check if order can be cancelled
 * @param {Object} order - Order object
 * @returns {Boolean} - Can cancel or not
 */
const canCancelOrder = (order) => {
  // Order can be cancelled if it's in Pending or Processing status
  const cancellableStatuses = [ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING];
  return cancellableStatuses.includes(order.status);
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

    if (!canCancelOrder(order)) {
      throw new Error('Order cannot be cancelled in current status');
    }

    const originalPaymentStatus = order.paymentStatus;
    const originalPaymentMethod = order.paymentMethod;

    // ✅ Wallet refund for wallet and upi
    if (['wallet', 'upi'].includes(originalPaymentMethod) && originalPaymentStatus === PAYMENT_STATUS.COMPLETED) {
      try {
        console.log(`🔄 Processing wallet refund for cancelled ${originalPaymentMethod.toUpperCase()} order ${orderId}`);
        const refundAmount = order.totalAmount;
        const refundResult = await walletService.addCredit(
          order.user.toString(),
          refundAmount,
          `Refund for cancelled order ${orderId}`,
          orderId
        );

        if (!refundResult.success) {
          console.error('❌ Wallet refund failed', refundResult);
          throw new Error('Failed to process wallet refund');
        }

        console.log(`✅ Wallet refund successful: ₹${refundAmount} credited for order ${orderId}`);
      } catch (refundError) {
        console.error('❌ Error processing wallet refund:', refundError);
        throw new Error('Order cancellation failed: Unable to process wallet refund. Please contact support.');
      }
    }

    // Payment status logic
    let newPaymentStatus = originalPaymentStatus;

    if (originalPaymentMethod === 'cod') {
      newPaymentStatus = PAYMENT_STATUS.CANCELLED;
      console.log(`✅ COD order cancelled - Payment status set to Cancelled for order ${orderId}`);
    } else if (originalPaymentStatus === PAYMENT_STATUS.COMPLETED) {
      newPaymentStatus = PAYMENT_STATUS.REFUNDED;
      console.log(`✅ Online payment order cancelled - Payment status set to Refunded for order ${orderId}`);
    } else {
      newPaymentStatus = PAYMENT_STATUS.CANCELLED;
      console.log(`✅ Unpaid order cancelled - Payment status set to Cancelled for order ${orderId}`);
    }

    // Update order
    order.status = ORDER_STATUS.CANCELLED;
    order.paymentStatus = newPaymentStatus;
    order.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      notes: reason ? `Order cancelled. Reason: ${reason}` : 'Order cancelled',
      updatedAt: new Date()
    });

    // Update items
    let updatedItemsCount = 0;
    order.items.forEach((item) => {
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

    console.log(`✅ Order ${orderId} cancelled. Items affected: ${updatedItemsCount}, Payment status: ${newPaymentStatus}`);

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





// Add Payment Status Calculation Method
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
 * Check if item can be cancelled
 * @param {Object} order - Order object
 * @param {String} itemId - Item ID
 * @returns {Boolean} - Can cancel or not
 */
const canCancelItem = (order, itemId) => {
  const item = order.items.id(itemId);
  if (!item) {
    return false;
  }

// Item can be cancelled if it's in Pending or Processing status
const cancellableStatuses = [ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING];
  return cancellableStatuses.includes(item.status);
};
  
/**
 * Cancel individual item
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} reason - Cancellation reason
 * @param {String} notes - Optional notes
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

    // AUTOMATED: Update payment status using new automated logic
    updateAutomatedPaymentStatus(order, item, ORDER_STATUS.CANCELLED);

    // Add to status history
    item.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      updatedAt: new Date(),
      notes: `Cancelled${reason ? ` - ${reason}` : ''}${notes ? ` - ${notes}` : ''}`
    });

    // ✅ UPDATED: Process partial wallet refund for BOTH wallet AND upi payments
    if (['wallet', 'upi'].includes(order.paymentMethod) && item.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      try {
        console.log(`🔄 Processing wallet refund for cancelled ${order.paymentMethod.toUpperCase()} item ${itemId} in order ${orderId}`);
        const refundAmount = item.totalPrice;
        const refundResult = await walletService.addCredit(
          order.user.id.toString(),
          refundAmount,
          `Refund for cancelled item in order ${orderId}`,
          orderId
        );

        if (!refundResult.success) {
          console.error('❌ Item wallet refund failed', refundResult);
          throw new Error('Failed to process item wallet refund');
        }

        console.log(`✅ Item wallet refund successful: ₹${refundAmount} credited for item ${itemId}`);
      } catch (refundError) {
        console.error('❌ Error processing item wallet refund:', refundError);
        throw new Error('Item cancellation failed: Unable to process wallet refund. Please contact support.');
      }
    }

    // ✅ PayPal refund logic (unchanged)
    if (order.paymentMethod === 'paypal' && item.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      try {
        console.log(`🔄 Processing PayPal refund for cancelled item ${itemId} in order ${orderId}`);
        const captureId = order.paypalCaptureId;

        if (captureId) {
          // Calculate partial refund amount in USD for this specific item
          const itemRefundAmountUSD = (item.totalPrice / 80).toFixed(2);

          // Process partial refund via PayPal
          const paypal = require('@paypal/checkout-server-sdk');
          const paypalClient = require('../paymentProviders/paypal');
          const request = new paypal.payments.CapturesRefundRequest(captureId);
          request.requestBody({
            amount: {
              value: itemRefundAmountUSD,
              currency_code: 'USD'
            }
          });

          const refund = await paypalClient.execute(request);
          console.log(`✅ PayPal partial refund successful for item ${itemId}:`, refund.result.id);
        } else {
          console.warn(`⚠️ No PayPal captureId found for order ${orderId}, skipping PayPal refund`);
        }
      } catch (refundError) {
        console.error('❌ Error processing PayPal item refund:', refundError);
        // Don't throw - allow item cancellation to proceed even if refund fails
      }
    }

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

    // AUTOMATED: Recalculate order payment status
    order.paymentStatus = calculatePaymentStatus(order);

    await order.save();

    console.log(`✅ Item ${itemId} cancelled successfully`);
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
 * Check if order can be returned
 * @param {Object} order - Order object
 * @returns {Boolean} - Can return or not
 */
const canReturnOrder = (order) => {
  // Order can be returned if it's delivered
  return order.status === ORDER_STATUS.DELIVERED;
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
    [ORDER_STATUS.RETURNED]: [],
    [ORDER_STATUS.FAILED] : []
  };
  
  return transitions[currentStatus] || [];
};

const isValidStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = getValidTransitions(currentStatus);
  return validTransitions.includes(newStatus);
};

// Admin only functions
/**
 * Admin-specific cancel entire order (no reason validation required)
 * @param {String} orderId - Order ID
 * @param {String} reason - Cancellation reason (optional, any text allowed)
 * @param {String} cancelledBy - Who cancelled the order
 * @returns {Object} - Result object
 */
const adminCancelOrder = async (orderId, reason = 'Cancelled by admin', cancelledBy = 'admin') => {
  try {
    const order = await Order.findOne({ orderId: orderId }).populate('user');

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order can be cancelled
    if (!canCancelOrder(order)) {
      throw new Error('Order cannot be cancelled in current status');
    }

    // Store original payment info
    const originalPaymentStatus = order.paymentStatus;
    const originalPaymentMethod = order.paymentMethod;

    // ✅ Process wallet refund for BOTH wallet AND upi payments
    if (['wallet', 'upi'].includes(originalPaymentMethod) && originalPaymentStatus === PAYMENT_STATUS.COMPLETED) {
      try {
        console.log(`🔄 Admin: Processing wallet refund for cancelled ${originalPaymentMethod.toUpperCase()} order ${orderId}`);
        const refundAmount = order.totalAmount;
        const refundResult = await walletService.addCredit(
          order.user.id.toString(),
          refundAmount,
          `Refund for order ${orderId} cancelled by admin`,
          orderId
        );

        if (!refundResult.success) {
          console.error('❌ Admin wallet refund failed', refundResult);
          throw new Error('Failed to process wallet refund');
        }

        console.log(`✅ Admin wallet refund successful: ₹${refundAmount} credited for order ${orderId}`);
      } catch (refundError) {
        console.error('❌ Error processing admin wallet refund:', refundError);
        throw new Error('Order cancellation failed: Unable to process wallet refund. Please contact support.');
      }
    }

    // ✅ ENHANCED: COD Cancellation Payment Status Logic
    let newPaymentStatus = originalPaymentStatus;

    if (originalPaymentMethod === 'cod') {
      newPaymentStatus = PAYMENT_STATUS.CANCELLED;
      console.log(`✅ COD order cancelled - Payment status set to Cancelled for order ${orderId}`);
    } else if (originalPaymentStatus === PAYMENT_STATUS.COMPLETED) {
      newPaymentStatus = PAYMENT_STATUS.REFUNDED;
      console.log(`✅ Online payment order cancelled - Payment status set to Refunded for order ${orderId}`);
    } else {
      newPaymentStatus = PAYMENT_STATUS.CANCELLED;
      console.log(`✅ Unpaid order cancelled - Payment status set to Cancelled for order ${orderId}`);
    }

    // Update order status
    order.status = ORDER_STATUS.CANCELLED;
    order.paymentStatus = newPaymentStatus;
    order.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      notes: reason ? `Order cancelled by admin. Reason: ${reason}` : 'Order cancelled by admin',
      updatedAt: new Date()
    });

    // Update all cancellable items
    let updatedItemsCount = 0;
    order.items.forEach((item) => {
      if ([ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING].includes(item.status)) {
        item.status = ORDER_STATUS.CANCELLED;
        item.paymentStatus = newPaymentStatus;
        item.cancellationReason = 'Other'; // Admin cancellations use "Other"
        item.cancellationDate = new Date();
        item.statusHistory.push({
          status: ORDER_STATUS.CANCELLED,
          notes: reason ? `Item cancelled by admin. Reason: ${reason}` : 'Item cancelled by admin',
          updatedAt: new Date()
        });
        updatedItemsCount++;
      }
    });

    await order.save();

    console.log(`✅ Admin cancelled order ${orderId}. Items affected: ${updatedItemsCount}, Payment status: ${newPaymentStatus}`);

    return {
      success: true,
      order,
      itemsAffected: updatedItemsCount,
      message: `Order cancelled successfully by admin. ${updatedItemsCount} items affected.`
    };
  } catch (error) {
    console.error('Error in admin cancel order:', error);
    throw error;
  }
};


const adminCancelItem = async (orderId, itemId, reason = 'Cancelled by admin', cancelledBy = 'admin') => {
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
    item.cancellationReason = 'Other'; // Admin cancellations use "Other"
    item.cancellationDate = new Date();

    // AUTOMATED: Update payment status using automated logic
    updateAutomatedPaymentStatus(order, item, ORDER_STATUS.CANCELLED);

    // Add to status history
    item.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      updatedAt: new Date(),
      notes: `Cancelled by admin: ${reason}`
    });

    // ✅ UPDATED: Process partial wallet refund for BOTH wallet AND upi payments
    if (['wallet', 'upi'].includes(order.paymentMethod) && item.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      try {
        console.log(`🔄 Admin: Processing wallet refund for cancelled ${order.paymentMethod.toUpperCase()} item ${itemId} in order ${orderId}`);
        const refundAmount = item.totalPrice;
        const refundResult = await walletService.addCredit(
          order.user.id.toString(),
          refundAmount,
          `Refund for item cancelled by admin in order ${orderId}`,
          orderId
        );

        if (!refundResult.success) {
          console.error('❌ Admin item wallet refund failed', refundResult);
          throw new Error('Failed to process item wallet refund');
        }

        console.log(`✅ Admin item wallet refund successful: ₹${refundAmount} credited for item ${itemId}`);
      } catch (refundError) {
        console.error('❌ Error processing admin item wallet refund:', refundError);
        throw new Error('Item cancellation failed: Unable to process wallet refund. Please contact support.');
      }
    }

    // ✅ PayPal refund logic (unchanged)
    if (order.paymentMethod === 'paypal' && item.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      try {
        console.log(`🔄 Admin: Processing PayPal refund for cancelled item ${itemId} in order ${orderId}`);
        const captureId = order.paypalCaptureId;

        if (captureId) {
          // Calculate partial refund amount in USD for this specific item
          const itemRefundAmountUSD = (item.totalPrice / 80).toFixed(2);

          // Process partial refund via PayPal
          const paypal = require('@paypal/checkout-server-sdk');
          const paypalClient = require('../paymentProviders/paypal');
          const request = new paypal.payments.CapturesRefundRequest(captureId);
          request.requestBody({
            amount: {
              value: itemRefundAmountUSD,
              currency_code: 'USD'
            }
          });

          const refund = await paypalClient.execute(request);
          console.log(`✅ Admin PayPal partial refund successful for item ${itemId}:`, refund.result.id);
        } else {
          console.warn(`⚠️ No PayPal captureId found for order ${orderId}, skipping PayPal refund`);
        }
      } catch (refundError) {
        console.error('❌ Error processing admin PayPal item refund:', refundError);
        // Don't throw - allow item cancellation to proceed even if refund fails
      }
    }

    // AUTOMATED: Recalculate order status
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: newOrderStatus === ORDER_STATUS.CANCELLED ? 'All items cancelled by admin' : 'Order status updated due to admin item cancellation',
        updatedAt: new Date()
      });
    }

    // AUTOMATED: Recalculate order payment status
    order.paymentStatus = calculatePaymentStatus(order);

    await order.save();

    console.log(`✅ Admin cancelled item ${itemId} successfully:`);
    console.log(`   Status: ${oldStatus} → ${item.status}`);
    console.log(`   Payment: ${oldPaymentStatus} → ${item.paymentStatus}`);
    console.log(`   Order Status: ${order.status}`);
    console.log(`   Order Payment: ${order.paymentStatus}`);

    return { 
      success: true, 
      order, 
      newOrderStatus,
      message: 'Item cancelled successfully by admin. Payment status updated automatically.'
    };
  } catch (error) {
    console.error('Error in admin cancel item:', error);
    throw error;
  }
};




const adminOrderReturnRequest = async (orderId, reason = 'Return requested by admin', requestedBy = 'admin') => {
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

    // ADMIN: Skip checking for existing return requests - admin can override

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
        reason: 'Other', 
        status: 'Pending',
        requestedBy: requestedBy 
      });

      await returnRequest.save();
      returnRequests.push(returnRequest);

      // Update item status to 'Processing Return'
      item.status = ORDER_STATUS.PROCESSING_RETURN;
      item.returnReason = 'Other'; 
      item.returnRequestDate = new Date();
      item.statusHistory.push({
        status: ORDER_STATUS.PROCESSING_RETURN,
        notes: `Return requested by admin. Reason: ${reason}`, 
        updatedAt: new Date()
      });
    }

    // Update order status to 'Processing Return'
    order.status = ORDER_STATUS.PROCESSING_RETURN;
    order.statusHistory.push({
      status: ORDER_STATUS.PROCESSING_RETURN,
      notes: `Return requested by admin for entire order. Reason: ${reason}`, 
      updatedAt: new Date()
    });

    await order.save();

    console.log(`Admin created return requests for order ${orderId}. Items affected: ${returnRequests.length}`);

    return { 
      success: true, 
      order, 
      returnRequests,
      itemsAffected: returnRequests.length,
      message: `Return requests created by admin for ${returnRequests.length} items`
    };

  } catch (error) {
    console.error('Error creating admin order return request:', error);
    throw error;
  }
};

/**
 * Admin-specific create return request for individual item (no reason validation required)
 * @param {String} orderId - Order ID
 * @param {String} itemId - Item ID
 * @param {String} reason - Return reason (optional, any text allowed)
 * @param {String} requestedBy - Who requested the return
 * @returns {Object} - Result object
 */
const adminItemReturnRequest = async (orderId, itemId, reason = 'Return requested by admin', requestedBy = 'admin') => {
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

    // ADMIN: Skip checking for existing return request - admin can override

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
      reason: 'Other', 
      status: 'Pending',
      requestedBy: requestedBy
    });

    await returnRequest.save();

    // Update item status to 'Processing Return'
    item.status = ORDER_STATUS.PROCESSING_RETURN;
    item.returnReason = 'Other'; // 
    item.returnRequestDate = new Date();
    item.statusHistory.push({
      status: ORDER_STATUS.PROCESSING_RETURN,
      notes: `Return requested by admin. Reason: ${reason}`, 
      updatedAt: new Date()
    });

    // Recalculate order status based on all item statuses
    const newOrderStatus = calculateOrderStatus(order.items);
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.statusHistory.push({
        status: newOrderStatus,
        notes: 'Order status updated due to admin return request',
        updatedAt: new Date()
      });
    }

    await order.save();

    console.log(`Admin created return request for item ${itemId} in order ${orderId}. Return ID: ${returnRequest.returnId}`);

    return { 
      success: true, 
      order, 
      returnRequest,
      newOrderStatus,
      message: 'Return request created successfully by admin'
    };

  } catch (error) {
    console.error('Error creating admin item return request:', error);
    throw error;
  }
};


//  Complete COD payment with unified transaction logging
const completeCODPaymentWithTransaction = async (orderId, deliveredBy = 'admin') => {
  try {
    const order = await Order.findOne({ orderId: orderId }).populate('user');
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

    // ✅ Create COD completion transaction using enhanced transaction service
    let codTransactionId = null;
    try {
      const transactionService = require('./transactionService');
      const codTransactionResult = await transactionService.createCODCompletionTransaction({
        userId: order.user._id,
        orderId: orderId,
        amount: order.totalAmount,
        itemDetails: order.items.map(item => ({
          productId: item.productId,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice
        }))
      });

      if (codTransactionResult.success) {
        codTransactionId = codTransactionResult.transactionId;
        console.log(`✅ COD completion transaction created: ${codTransactionId}`);
      } else {
        console.warn('⚠️ Failed to create COD completion transaction:', codTransactionResult.error);
      }
    } catch (codTxError) {
      console.warn('⚠️ COD transaction creation failed:', codTxError.message);
    }

    // Update payment status to completed (cash collected)
    order.paymentStatus = PAYMENT_STATUS.COMPLETED;
    
    // Update all items payment status
    order.items.forEach(item => {
      if (item.status === ORDER_STATUS.DELIVERED) {
        item.paymentStatus = PAYMENT_STATUS.COMPLETED;
      }
    });

    // Add to order status history
    order.statusHistory.push({
      status: order.status,
      notes: `COD payment completed by ${deliveredBy}. ${codTransactionId ? `Transaction: ${codTransactionId}` : 'No unified transaction created'}`,
      updatedAt: new Date()
    });

    await order.save();

    console.log(`✅ Enhanced COD payment completed for order ${orderId}, Transaction: ${codTransactionId || 'N/A'}`);

    return {
      success: true,
      message: 'COD payment marked as completed with enhanced transaction logging',
      order: order,
      transactionId: codTransactionId
    };

  } catch (error) {
    console.error('❌ Error completing enhanced COD payment:', error);
    throw error;
  }
};



module.exports = {
  // Status Management Functions
  updateAutomatedPaymentStatus,
  calculateOrderStatus,
  calculatePaymentStatus,
  completePaymentOnDelivery,
  updateOrderStatus,
  updateItemStatus,

  // Cancellation Functions  
  cancelOrder,
  cancelItem,
  canCancelOrder,
  canCancelItem,

  // Admin Cancellation Functions (no reason validation)
  adminCancelOrder,
  adminCancelItem,

  // Return Functions
  canReturnOrder,      
  canReturnItem,   
  returnOrder,
  returnItem,
  requestOrderReturn,
  requestItemReturn,

  adminOrderReturnRequest,
  adminItemReturnRequest,

  // Return Management (Admin Functions)
  approveItemReturn,
  approveOrderReturn,
  rejectItemReturn,
  rejectOrderReturn,

  getValidTransitions,
  isValidStatusTransition,

  completeCODPaymentWithTransaction,
  completePaymentOnDelivery: completeCODPaymentWithTransaction
};