import jsQR from 'jsqr'

/** Giải mã QR từ một khung hình/ảnh vẽ lên canvas. */
export const decodeFromCanvas = (canvas, source, width, height) => {
  if (!width || !height) return null
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, width, height)
  const image = ctx.getImageData(0, 0, width, height)
  return jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })?.data || null
}

