const mongoose = require('mongoose');
const slugify = require('slugify');

const brandSchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, default: ''},
    slug: {type: String, unique: true},
    image: {type: String, default: ''}, // ADD THIS LINE
    brandOffer: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    isActive: { type: Boolean, default: true },
    isDeleted: {type: Boolean, default: false}
}, {timestamps: true});

brandSchema.pre('save', function(next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, {lower: true, strict: true});
    }
    next();
});

brandSchema.post('save', async function(doc, next) {
    if (this.isModified('brandOffer')) {
        console.log(`Brand offer changed for ${doc.name}: ${doc.brandOffer}%`);
        
        try {
            const Product = mongoose.model('Product');
            const products = await Product.find({ 
                brand: doc._id, 
                isDeleted: false 
            });
            
            console.log(` Updating prices for ${products.length} products...`);
            
            for (const product of products) {
                product.set('_cachePrices', true);
                await product.save();
            }
            
            console.log(` Updated prices for all ${doc.name} products`);
        } catch (error) {
            console.error(` Error updating product prices for brand ${doc.name}:`, error);
        }
    }
    next();
});

module.exports = mongoose.model('Brand', brandSchema);
