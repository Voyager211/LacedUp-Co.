const Brand = require('../models/Brand'); // Adjust path as needed

// Brand code mappings
function getBrandCode(brandName) {
  const brandMap = {
    'Nike': 'NK',
    'Adidas': 'AD',
    'New Balance': 'NB',
    'Under Armour': 'UA',
    'Dolce & Gabbana': 'DG',
    'Cariuma': 'CA',
    'Lacoste': 'LC',
    'Keds': 'KD',
    'Zara': 'ZR',
    'Golden Goose': 'GG',
    'On': 'ON'
  };
  return brandMap[brandName] || brandName.substring(0, 2).toUpperCase();
}

// Generate product code from product name
function getProductCode(productName) {
  return productName
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .split(' ')
    .map(word => word.substring(0, 3)) // Take first 3 chars of each word
    .join('')
    .substring(0, 6) // Limit to 6 characters
    .toUpperCase();
}

// Generate variant code from size
function getVariantCode(size) {
  return size
    .replace(/[^a-zA-Z0-9]/g, '') // Remove spaces and special chars
    .toUpperCase();
}

// Generate base SKU for product
async function generateBaseSKU(brandId, productName) {
  try {
    // Look up brand name from brand collection
    const brand = await Brand.findById(brandId);
    if (!brand) {
      throw new Error('Brand not found');
    }
    
    const brandCode = getBrandCode(brand.name);
    const productCode = getProductCode(productName);
    
    return `${brandCode}-${productCode}`;
  } catch (error) {
    throw new Error(`Failed to generate base SKU: ${error.message}`);
  }
}

// Generate variant SKU
async function generateVariantSKU(brandId, productName, size) {
  try {
    // Look up brand name from brand collection
    const brand = await Brand.findById(brandId);
    if (!brand) {
      throw new Error('Brand not found');
    }
    
    const brandCode = getBrandCode(brand.name);
    const productCode = getProductCode(productName);
    const variantCode = getVariantCode(size);
    
    return `${brandCode}-${productCode}-${variantCode}`;
  } catch (error) {
    throw new Error(`Failed to generate variant SKU: ${error.message}`);
  }
}

// Check if SKU already exists
async function isSkuUnique(sku, ProductModel, excludeProductId = null) {
  const query = {
    $or: [
      { baseSKU: sku },
      { 'variants.sku': sku }
    ]
  };
  
  if (excludeProductId) {
    query._id = { $ne: excludeProductId };
  }
  
  const existingProduct = await ProductModel.findOne(query);
  return !existingProduct;
}

module.exports = {
  getBrandCode,
  getProductCode,
  getVariantCode,
  generateBaseSKU,
  generateVariantSKU,
  isSkuUnique
};
