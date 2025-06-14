const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const processImages = async (files) => {
  const processed = [];

  for (const file of files) {
    const filename = `${Date.now()}-${file.originalname.split('.')[0]}.webp`;
    const outputPath = path.join('public/uploads/products', filename);

    await sharp(file.buffer)
      .resize(800, 800, { fit: 'cover', position: 'center' })
      .webp()
      .toFile(outputPath);

    processed.push({ url: `/uploads/products/${filename}`, filename });
  }

  return processed;
};

module.exports = { processImages };
