const ORDER_STATUS = {
  PENDING: 'Pending',
  PROCESSING: 'Processing', 
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PARTIALLY_CANCELLED: 'Partially Cancelled',
  RETURNED: 'Returned',
  PARTIALLY_RETURNED: 'Partially Returned',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  PROCESSING_RETURN: 'Processing Return'
};

const PAYMENT_STATUS = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_COMPLETED: 'Partially Completed',
  PARTIALLY_REFUNDED: 'Partially Refunded'
};

const CANCELLATION_REASONS = {
  ORDERED_BY_MISTAKE: 'Ordered by mistake',
  FOUND_BETTER_PRICE: 'Found a better price elsewhere',
  DELIVERY_TIME_LONG: 'Delivery time too long',
  PAYMENT_ISSUE: 'Payment issue',
  DUPLICATE_ORDER: 'Duplicate order',
  CHANGED_MIND: 'Changed my mind',
  PRODUCT_OUT_OF_STOCK: 'Product went out of stock',
  WRONG_SIZE: 'Wrong size selected',
  INCORRECT_ADDRESS: 'Incorrect or incomplete shipping address',
  SWITCHED_PRODUCT: 'Switched to a different product',
  OTHER: 'Other'
};

const RETURN_REASONS = {
  SIZE_TOO_SMALL: 'Size too small',
  SIZE_TOO_LARGE: 'Size too large',
  WRONG_ITEM: 'Wrong item received',
  ITEM_DAMAGED: 'Item damaged or defective',
  NOT_AS_DESCRIBED: 'Item not as described',
  CHANGED_MIND: 'Changed my mind',
  MULTIPLE_SIZES_TRIAL: 'Ordered multiple sizes for trial',
  RECEIVED_LATE: 'Received too late',
  QUALITY_UNSATISFACTORY: 'Product quality not satisfactory',
  UNCOMFORTABLE: 'Footwear is uncomfortable',
  COLOR_MISMATCH: 'Color doesn\'t match the image',
  FOUND_BETTER_PRICE: 'Found a better price elsewhere',
  OTHER: 'Other'
};

const PAYMENT_METHODS = {
  COD: 'cod',
  CARD: 'card',
  UPI: 'upi',
  NETBANKING: 'netbanking'
};

const RETURN_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected', 
  COMPLETED: 'Completed'
};

// Helper functions to get arrays for Mongoose enum validation
const getOrderStatusArray = () => Object.values(ORDER_STATUS);
const getPaymentStatusArray = () => Object.values(PAYMENT_STATUS);
const getCancellationReasonsArray = () => Object.values(CANCELLATION_REASONS);
const getReturnReasonsArray = () => Object.values(RETURN_REASONS);
const getPaymentMethodsArray = () => Object.values(PAYMENT_METHODS);
const getReturnStatusArray = () => Object.values(RETURN_STATUS);

module.exports = {
  ORDER_STATUS,
  PAYMENT_STATUS,
  CANCELLATION_REASONS,
  RETURN_REASONS,
  PAYMENT_METHODS,
  RETURN_STATUS,   
  
  // Helper functions
  getOrderStatusArray,
  getPaymentStatusArray,
  getCancellationReasonsArray,
  getReturnReasonsArray,
  getPaymentMethodsArray,
  getReturnStatusArray
};
