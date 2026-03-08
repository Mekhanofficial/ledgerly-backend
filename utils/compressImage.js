const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const removeFileIfExists = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to remove image file:', error?.message || error);
  }
};

async function compressImage(filePath) {
  const extension = path.extname(filePath);
  const compressedPath = filePath.replace(extension, '-compressed.jpg');

  try {
    await sharp(filePath)
      .rotate()
      .resize({ width: 1000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toFile(compressedPath);

    removeFileIfExists(filePath);
    return compressedPath;
  } catch (error) {
    removeFileIfExists(compressedPath);
    throw error;
  }
}

module.exports = compressImage;
