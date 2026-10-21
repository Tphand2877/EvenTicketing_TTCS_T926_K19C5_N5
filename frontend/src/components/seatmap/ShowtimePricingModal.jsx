import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { getShowtimeCategories, updateCategoryPrices } from '../../services/eventService'
import { formatDateTime, formatPrice, getErrorMessage } from '../event/eventFormat'

// Bảng màu mặc định đồng bộ với sơ đồ ghế
const CATEGORY_PALETTE = [
  { bg: '#ec4899', text: 'text-pink-700', badge: 'bg-pink-50 border-pink-200' },
  { bg: '#6366f1', text: 'text-indigo-700', badge: 'bg-indigo-50 border-indigo-200' },
  { bg: '#10b981', text: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200' },
  { bg: '#f59e0b', text: 'text-amber-700', badge: 'bg-amber-50 border-amber-200' },
  { bg: '#8b5cf6', text: 'text-purple-700', badge: 'bg-purple-50 border-purple-200' },
  { bg: '#06b6d4', text: 'text-cyan-700', badge: 'bg-cyan-50 border-cyan-200' },
]

/**
 * S-15 / T-35: Màn hình đặt giá vé cho từng hạng ghế của suất diễn.
 *
 * AC1: Nhập giá cho từng hạng và lưu -> sơ đồ hiện đúng giá.
 * AC4: Nhập giá âm hoặc không phải số -> bị chặn ngay tại ô (in-field validation).
 * NFR: Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực.
 */
export default function ShowtimePricingModal({ showtime, eventTitle, onClose, onSuccess }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [prices, setPrices]         = useState({})       // categoryId -> string value in input
  const [errors, setErrors]         = useState({})       // categoryId -> error string
  const [globalError, setGlobalError] = useState(null)
  const [globalSuccess, setGlobalSuccess] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setGlobalError(null)

    getShowtimeCategories(showtime.id)
      .then((data) => {
        if (cancelled) return
        setCategories(data || [])
        // Khởi tạo giá trị ban đầu cho các ô input
        const initialPrices = {}
        data.forEach((c) => {
          initialPrices[c.id] = c.price !== null && c.price !== undefined ? String(c.price) : ''
        })
        setPrices(initialPrices)
      })
      .catch((err) => {
        if (cancelled) return
        setGlobalError(getErrorMessage(err, 'Không tải được danh sách hạng ghế.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [showtime.id])

  /**
   * AC4 & NFR: Kiểm tra giá trị nhập của từng ô
   */
  const validateField = (val) => {
    if (val === undefined || val === null || val === '') {
      return 'Vui lòng nhập giá vé.'
    }
    if (typeof val === 'string' && val.includes('.')) {
      return 'Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực.'
    }
    const num = Number(val)
    if (Number.isNaN(num)) {
      return 'Giá vé phải là số hợp lệ.'
    }
    if (!Number.isInteger(num)) {
      return 'Giá lưu bằng số nguyên đơn vị đồng, không dùng số thực.'
    }
    if (num < 0) {
      return 'Giá vé không được là số âm.'
    }
    return null
  }

  const handlePriceChange = (categoryId, value) => {
    setPrices((prev) => ({ ...prev, [categoryId]: value }))
    // AC4: Kiểm tra và chặn ngay tại ô khi người dùng nhập
    const fieldError = validateField(value)
    setErrors((prev) => ({ ...prev, [categoryId]: fieldError }))
    setGlobalError(null)
  }

  const handleApplyPreset = (multiplier = 1) => {
    const base = Number(showtime.price) || 100000
    const newPrices = {}
    const newErrors = {}
    categories.forEach((c, idx) => {
      // Ví dụ: hạng đầu (VIP) giá cao hơn các hạng sau
      const factor = idx === 0 ? 1.5 : 1.0 - idx * 0.15
      const calculated = Math.max(Math.round(base * factor * multiplier / 1000) * 1000, 10000)
      newPrices[c.id] = String(calculated)
      newErrors[c.id] = null
    })
    setPrices(newPrices)
    setErrors(newErrors)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGlobalError(null)
    setGlobalSuccess(null)

    // AC4: Kiểm tra toàn bộ các ô trước khi lưu
    const newErrors = {}
    let hasError = false
    const pricePayload = []

    categories.forEach((cat) => {
      const val = prices[cat.id]
      const err = validateField(val)
      if (err) {
        newErrors[cat.id] = err
        hasError = true
      } else {
        pricePayload.push({
          id: cat.id,
          price: Number(val),
        })
      }
    })

    setErrors(newErrors)

    if (hasError) {
      setGlobalError('Vui lòng sửa các lỗi giá vé tại các ô được đánh dấu trước khi lưu.')
      return
    }

    setSaving(true)
    try {
      const res = await updateCategoryPrices(showtime.id, pricePayload)
      setGlobalSuccess(res?.message || 'Đã cập nhật giá vé thành công!')
      setTimeout(() => {
        onSuccess?.(res)
      }, 1000)
    } catch (err) {
      setGlobalError(getErrorMessage(err, 'Lỗi khi cập nhật giá vé.'))
    } finally {
      setSaving(false)
    }
  }

  const totalSeats = categories.reduce((sum, c) => sum + (c.seat_count || 0), 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-2xl w-full overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 p-6 text-white relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-semibold mb-2">
                <span>🏷️</span>
                <span>Đặt giá theo hạng ghế (S-15)</span>
              </div>
              <h2 id="pricing-modal-title" className="text-xl font-bold">
                Đặt giá vé cho từng hạng ghế
              </h2>
              <p className="text-pink-100 text-xs mt-1">
                {eventTitle ? `${eventTitle} • ` : ''}
                {formatDateTime(showtime.starts_at)}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors text-lg"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {globalError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-2.5"
            >
              <span className="text-lg leading-none shrink-0">⚠️</span>
              <div>
                <strong className="font-semibold block">Chưa thể lưu giá vé:</strong>
                <span>{globalError}</span>
              </div>
            </div>
          )}

          {globalSuccess && (
            <div
              role="status"
              className="p-3.5 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl flex items-center gap-2.5"
            >
              <span className="text-lg leading-none shrink-0">✅</span>
              <span>{globalSuccess}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 space-y-3">
              <div className="w-8 h-8 border-3 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
              <span className="text-sm">Đang tải danh sách hạng ghế…</span>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 px-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-3">
              <span className="text-4xl block">🗺️</span>
              <h3 className="font-semibold text-gray-800">Chưa có hạng ghế nào</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Suất diễn này chưa được nạp sơ đồ ghế. Vui lòng nạp sơ đồ ghế từ tệp JSON trước khi đặt giá cho từng hạng ghế.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary text-xs px-4 py-2 mt-2"
              >
                Đóng
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Thanh gợi ý áp dụng nhanh */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                <span className="text-gray-600 font-medium">
                  Tổng cộng: <strong className="text-gray-900">{categories.length} hạng ghế</strong> &bull; {totalSeats} ghế
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 hidden sm:inline">Gợi ý nhanh:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(1)}
                    className="px-2.5 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium"
                  >
                    Gợi ý phân tầng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const base = Number(showtime.price) || 200000
                      const newPrices = {}
                      categories.forEach((c) => { newPrices[c.id] = String(base) })
                      setPrices(newPrices)
                      setErrors({})
                    }}
                    className="px-2.5 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium"
                  >
                    Đồng giá cơ bản
                  </button>
                </div>
              </div>

              {/* Danh sách từng hạng ghế để nhập giá (AC1, AC4) */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {categories.map((cat, idx) => {
                  const palette = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]
                  const val = prices[cat.id] ?? ''
                  const fieldError = errors[cat.id]
                  const percent = totalSeats > 0 ? Math.round(((cat.seat_count || 0) / totalSeats) * 100) : 0

                  return (
                    <div
                      key={cat.id}
                      className={`p-4 rounded-2xl border transition-colors ${
                        fieldError
                          ? 'border-red-300 bg-red-50/40'
                          : 'border-gray-200 bg-white hover:border-pink-200 hover:bg-pink-50/20'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Thông tin hạng ghế */}
                        <div className="flex items-center gap-3">
                          <span
                            className="w-4 h-4 rounded-md shadow-sm shrink-0"
                            style={{ backgroundColor: palette.bg }}
                            aria-hidden="true"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-gray-900 text-sm">
                                {cat.name}
                              </h4>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${palette.badge} ${palette.text}`}>
                                {cat.seat_count} ghế ({percent}%)
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-400 block mt-0.5">
                              Giá hiện tại: {formatPrice(cat.price)}
                            </span>
                          </div>
                        </div>

                        {/* Ô nhập giá vé (AC4: chặn ngay tại ô nếu âm hoặc không phải số) */}
                        <div className="w-full sm:w-56 shrink-0 space-y-1">
                          <div className="relative">
                            <input
                              id={`price-input-${cat.id}`}
                              type="number"
                              min="0"
                              step="1000"
                              required
                              aria-label={`Giá vé cho hạng ${cat.name}`}
                              aria-invalid={Boolean(fieldError)}
                              aria-describedby={fieldError ? `error-text-${cat.id}` : undefined}
                              placeholder="Nhập giá vé (₫)"
                              value={val}
                              onChange={(e) => handlePriceChange(cat.id, e.target.value)}
                              className={`w-full px-3 py-2 pr-8 text-sm rounded-xl border transition-all text-right font-semibold ${
                                fieldError
                                  ? 'border-red-500 bg-white text-red-900 focus:ring-2 focus:ring-red-200 focus:outline-none'
                                  : 'border-gray-300 bg-white text-gray-900 focus:border-pink-500 focus:ring-2 focus:ring-pink-100 focus:outline-none'
                              }`}
                            />
                            <span className="absolute right-3 top-2.5 text-xs text-gray-400 font-medium pointer-events-none">
                              ₫
                            </span>
                          </div>

                          {/* Hiển thị lỗi ngay tại ô (AC4) */}
                          {fieldError && (
                            <p
                              id={`error-text-${cat.id}`}
                              role="alert"
                              className="text-[11px] font-medium text-red-600 flex items-center gap-1"
                            >
                              <span>✕</span>
                              <span>{fieldError}</span>
                            </p>
                          )}

                          {/* Preview giá dạng tiền tệ khi hợp lệ */}
                          {!fieldError && val !== '' && !Number.isNaN(Number(val)) && (
                            <p className="text-[11px] text-emerald-600 font-medium text-right">
                              &asymp; {Number(val).toLocaleString('vi-VN')} VNĐ
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving || Object.values(errors).some(Boolean)}
                  className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2 shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang lưu giá vé…</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Lưu giá vé</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

ShowtimePricingModal.propTypes = {
  showtime: PropTypes.shape({
    id: PropTypes.number.isRequired,
    starts_at: PropTypes.string,
    price: PropTypes.number,
  }).isRequired,
  eventTitle: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
}
