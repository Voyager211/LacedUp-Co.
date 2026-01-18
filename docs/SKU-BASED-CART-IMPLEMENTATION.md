# SKU-Based Cart System Implementation

## Overview

This document outlines the implementation of a SKU-based cart system for the LacedUp e-commerce platform. The system has been upgraded from a product-centric approach to a variant-centric approach, allowing users to add different sizes of the same product as separate cart items.

## Key Changes

### 1. Cart Model Updates (`models/Cart.js`)

**Previous Structure:**
```javascript
items: [{
  productId: ObjectId,
  quantity: Number,
  price: Number,
  totalPrice: Number
}]
```

**New Structure:**
```javascript
items: [{
  productId: ObjectId,        // Reference to Product
  variantId: ObjectId,        // Reference to specific variant
  sku: String,                // Store the variant SKU for easy identification
  size: String,               // Store size for display purposes
  quantity: Number,
  price: Number,              // Variant-specific price
  totalPrice: Number
}]
```

### 2. Cart Controller Updates (`controllers/user/cart-controller.js`)

#### Key Functions Modified:

**addToCart:**
- Now requires `variantId` parameter
- Validates variant existence and stock
- Checks variant-specific stock availability
- Stores variant information (SKU, size) in cart items
- Uses variant-specific pricing

**updateCartQuantity:**
- Now requires both `productId` and `variantId`
- Validates variant-specific stock limits
- Updates prices based on current variant pricing

**removeFromCart:**
- Now supports variant-specific removal
- Can remove specific variant or all variants of a product

**loadCart:**
- Validates variant existence for each cart item
- Updates prices based on current variant pricing
- Filters out items with missing variants

### 3. Frontend Updates

#### Cart JavaScript (`public/js/user/cart.js`)

**addToCartWithVariant Function:**
- Sends `variantId` along with `productId`
- Enhanced error handling for variant-specific errors

#### Cart View (`views/user/cart.ejs`)

**Display Enhancements:**
- Shows size information for each cart item
- Displays SKU for identification
- Variant-specific stock status
- Size-specific out-of-stock messages

### 4. Migration System

#### Migration Script (`migrations/cart-sku-migration.js`)

**Functions:**
- `migrateCartToSKUBased()`: Converts existing cart data
- `rollbackCartMigration()`: Reverts changes if needed
- `validateMigration()`: Validates migration results

#### Migration Runner (`scripts/run-cart-migration.js`)

**Usage:**
```bash
# Run migration
node scripts/run-cart-migration.js migrate

# Validate migration
node scripts/run-cart-migration.js validate

# Rollback if needed
node scripts/run-cart-migration.js rollback
```

## Benefits of SKU-Based Cart

### 1. Proper Variant Tracking
- Different sizes of the same product are treated as separate cart items
- Users can add multiple sizes of the same product
- Clear distinction between variants in cart display

### 2. Accurate Stock Management
- Stock validation at variant level, not product level
- Prevents overselling of specific sizes
- Real-time stock checking for each variant

### 3. Enhanced User Experience
- Clear size information displayed in cart
- Size-specific stock status messages
- Better inventory visibility for users

### 4. Improved Order Fulfillment
- Accurate picking with specific SKUs
- Clear size information for warehouse operations
- Reduced fulfillment errors

### 5. Better Inventory Control
- Variant-specific stock tracking
- Accurate inventory reporting
- Size-specific sales analytics

## API Changes

### Add to Cart Endpoint

**Previous:**
```javascript
POST /cart/add
{
  "productId": "product_id",
  "quantity": 1
}
```

**New:**
```javascript
POST /cart/add
{
  "productId": "product_id",
  "variantId": "variant_id",
  "quantity": 1
}
```

### Update Cart Endpoint

**Previous:**
```javascript
POST /cart/update
{
  "productId": "product_id",
  "quantity": 2
}
```

**New:**
```javascript
POST /cart/update
{
  "productId": "product_id",
  "variantId": "variant_id",
  "quantity": 2
}
```

### Remove from Cart Endpoint

**Previous:**
```javascript
POST /cart/remove
{
  "productId": "product_id"
}
```

**New:**
```javascript
POST /cart/remove
{
  "productId": "product_id",
  "variantId": "variant_id"  // Optional - removes specific variant
}
```

## Error Handling

### New Error Codes

- `VARIANT_NOT_FOUND`: Requested variant doesn't exist
- `VARIANT_OUT_OF_STOCK`: Specific size is out of stock
- `VARIANT_INSUFFICIENT_STOCK`: Not enough stock for requested size
- `CART_VARIANT_LIMIT`: Maximum quantity reached for variant

### Enhanced Error Messages

- Size-specific stock messages
- Variant-specific availability information
- Clear distinction between product and variant errors

## Database Considerations

### Indexing
Consider adding indexes for better performance:
```javascript
// Cart collection indexes
db.carts.createIndex({ "userId": 1 })
db.carts.createIndex({ "items.productId": 1, "items.variantId": 1 })
db.carts.createIndex({ "items.sku": 1 })
```

### Data Integrity
- Ensure variant references are valid
- Regular cleanup of orphaned cart items
- Validate SKU uniqueness

## Testing Considerations

### Test Scenarios

1. **Adding Variants to Cart:**
   - Add same product with different sizes
   - Verify separate cart items created
   - Test stock validation per variant

2. **Updating Quantities:**
   - Update quantity for specific variant
   - Verify other variants unaffected
   - Test stock limits per variant

3. **Removing Items:**
   - Remove specific variant
   - Verify other variants remain
   - Test bulk removal operations

4. **Stock Validation:**
   - Test variant-specific stock checks
   - Verify out-of-stock handling
   - Test stock limit enforcement

5. **Migration Testing:**
   - Test migration with existing data
   - Verify data integrity after migration
   - Test rollback functionality

## Deployment Steps

### 1. Pre-Deployment
- Backup existing cart data
- Test migration script in staging
- Validate all cart operations

### 2. Deployment
- Deploy updated code
- Run migration script
- Validate migration results

### 3. Post-Deployment
- Monitor cart operations
- Check for any data inconsistencies
- Verify user experience

## Monitoring and Maintenance

### Key Metrics to Monitor
- Cart conversion rates by variant
- Stock accuracy per variant
- Cart abandonment by size availability
- Migration success rate

### Regular Maintenance
- Clean up orphaned cart items
- Validate variant references
- Update prices based on current offers
- Monitor cart performance

## Backward Compatibility

The implementation includes backward compatibility features:
- Support for legacy cart items without variant information
- Graceful handling of missing variants
- Migration path for existing data

## Future Enhancements

### Potential Improvements
1. **Wishlist Integration:** Extend variant support to wishlist
2. **Bulk Operations:** Add bulk variant operations
3. **Cart Analytics:** Variant-specific cart analytics
4. **Inventory Alerts:** Low stock alerts per variant
5. **Price History:** Track variant price changes

### Performance Optimizations
1. **Caching:** Cache variant information
2. **Batch Operations:** Optimize bulk cart operations
3. **Database Optimization:** Improve query performance
4. **Real-time Updates:** WebSocket-based cart updates

## Conclusion

The SKU-based cart system provides a robust foundation for variant-specific e-commerce operations. It improves inventory accuracy, enhances user experience, and provides better business insights while maintaining backward compatibility with existing data.

The implementation follows best practices for data migration, error handling, and user experience, ensuring a smooth transition from the previous product-centric approach to the new variant-centric system.