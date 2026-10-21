// Hàm định dạng dùng chung cho các component sự kiện (SCRUM-80)

export const CATEGORIES = ['Âm nhạc', 'Công nghệ', 'Thể thao', 'Giải trí', 'Nghệ thuật', 'Khác']

const CATEGORY_STYLES = {
  'Âm nhạc':    { color: 'from-violet-500 to-purple-600', emoji: '🎵' },
  'Công nghệ':  { color: 'from-blue-500 to-cyan-600',     emoji: '💻' },
  'Thể thao':   { color: 'from-green-500 to-emerald-600', emoji: '⚽' },
  'Giải trí':   { color: 'from-orange-400 to-pink-500',   emoji: '🎤' },
  'Nghệ thuật': { color: 'from-rose-400 to-pink-600',     emoji: '🖼️' },
}

const DEFAULT_STYLE = { color: 'from-indigo-500 to-purple-600', emoji: '🎫' }

export const getCategoryStyle = (category) => CATEGORY_STYLES[category] || DEFAULT_STYLE

export const formatPrice = (value) =>
  value === null || value === undefined ? 'Chưa có giá' : `${Number(value).toLocaleString('vi-VN')}₫`

export const formatPriceRange = (minPrice, maxPrice, fallbackPrice) => {
  const min = minPrice != null ? Number(minPrice) : null
  const max = maxPrice != null ? Number(maxPrice) : null
  if (min != null && max != null) {
    if (min === max) return formatPrice(min)
    return `${formatPrice(min)} - ${formatPrice(max)}`
  }
  if (min != null) return `Từ ${formatPrice(min)}`
  if (max != null) return `Đến ${formatPrice(max)}`
  if (fallbackPrice != null) return formatPrice(fallbackPrice)
  return 'Chưa có giá'
}

export const formatDateTime = (iso) =>
  iso
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : 'Chưa có lịch diễn'

export const getErrorMessage = (err, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') =>
  err?.response?.data?.message || fallback

