const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, default: ''},
    slug: {type: String, unique: true},
    image: {type: String, default: ''}, // ADD THIS LINE
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

categorySchema.post('save', async function(doc, next) {
    if (this.isModified('categoryOffer')) {
        console.log(`🔄 Category offer changed for ${doc.name}: ${doc.categoryOffer}%`);
        
        try {
            const Product = mongoose.model('Product');
            const products = await Product.find({ 
                category: doc._id, 
                isDeleted: false 
            });
            
            console.log(`📦 Updating prices for ${products.length} products...`);
            
            for (const product of products) {
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
