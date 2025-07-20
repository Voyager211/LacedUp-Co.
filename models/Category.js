const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, default: ''},
    slug: {type: String, unique: true},
    categoryOffer: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    isActive: { type: Boolean, default: true },
    isDeleted: {type: Boolean, default: false}
}, {timestamps: true});

categorySchema.pre('save', function(next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, {lower: true, strict: true});
    }
    next();
});

// IMPROVED: Hook to update product prices when category offer changes
categorySchema.post('save', async function(doc, next) {
    // Only trigger if categoryOffer was modified
    if (this.isModified('categoryOffer')) {
        console.log(`🔄 Category offer changed for ${doc.name}: ${doc.categoryOffer}%`);
        
        try {
            // Import Product model (avoid circular dependency)
            const Product = mongoose.model('Product');
            
            // Find all products in this category
            const products = await Product.find({ 
                category: doc._id, 
                isDeleted: false 
            });
            
            console.log(`📦 Updating prices for ${products.length} products...`);
            
            // Update each product to recalculate prices
            for (const product of products) {
                // Set flag to cache prices during save
                product.set('_cachePrices', true);
                await product.save();
            }
            
            console.log(`✅ Updated prices for all ${doc.name} products`);
        } catch (error) {
            console.error(`❌ Error updating product prices for category ${doc.name}:`, error);
        }
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);