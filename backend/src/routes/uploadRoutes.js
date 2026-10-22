const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSecureRouter } = require('../middleware/secureRoute');

const createUploadRouter = () => {
  const router = createSecureRouter();

  // Đảm bảo thư mục lưu trữ tồn tại
  const publicUploadDir = path.resolve(__dirname, '../../../frontend/public/uploads');
  const distUploadDir = path.resolve(__dirname, '../../../frontend/dist/uploads');

  [publicUploadDir, distUploadDir].forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}
  });

  router.post('/image', { public: true }, async (req, res) => {
    try {
      const { image, name } = req.body || {};
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ success: false, message: 'Dữ liệu ảnh không hợp lệ.' });
      }

      // Xử lý Base64 Data URL: "data:image/png;base64,iVBORw..."
      let mimeType = 'image/png';
      let extension = 'png';
      let base64Data = image;

      const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
        else if (mimeType.includes('svg')) extension = 'svg';
        else if (mimeType.includes('webp')) extension = 'webp';
        else if (mimeType.includes('gif')) extension = 'gif';
      } else if (name && path.extname(name)) {
        extension = path.extname(name).replace('.', '').toLowerCase();
      }

      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(413).json({ success: false, message: 'Kích thước ảnh tối đa 5 MB.' });
      }

      const uniqueName = `upload_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${extension}`;
      const publicFilePath = path.join(publicUploadDir, uniqueName);
      fs.writeFileSync(publicFilePath, buffer);

      try {
        const distFilePath = path.join(distUploadDir, uniqueName);
        fs.writeFileSync(distFilePath, buffer);
      } catch {}

      const url = `/uploads/${uniqueName}`;
      return res.status(201).json({
        success: true,
        message: 'Tải ảnh lên thành công.',
        url,
      });
    } catch (err) {
      console.error('[Upload] Error saving image:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi khi lưu ảnh máy chủ.' });
    }
  });

  return router;
};

module.exports = { createUploadRouter };
