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

module.exports = mongoose.model('Category', categorySchema);