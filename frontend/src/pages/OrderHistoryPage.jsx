import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'
import Modal from '../components/common/Modal'
import { getMyOrders, getOrderDetail, initiatePayment } from '../services/orderService'

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'paid', label: 'Đã thanh toán' },
  { key: 'pending', label: 'Chờ thanh toán' },
  { key: 'expired', label: 'Đã hết hạn' },
  { key: 'cancelled', label: 'Đã hủy' },
  { key: 'needs_review', label: 'Đang đối soát' },
]

const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0)

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'N/A'
  try {
    return new Date(dateStr).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

const renderStatusBadge = (status) => {
  switch (status) {
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Đã thanh toán
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Chờ thanh toán
        </span>
      )
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Đã hết hạn
        </span>
      )
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Đã hủy
        </span>
      )
    case 'needs_review':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          Đang đối soát
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {status}
        </span>
      )
  }
}

/**
 * Đơn chờ thanh toán: gọi API thanh toán S-18 rồi chuyển sang cổng (MoMo).
 * Đơn đã thanh toán: mở vé điện tử (S-25).
 */
function OrderActions({ order, size = 'sm' }) {
  const [state, setState] = useState({ busy: false, message: '' })
  const pad = size === 'sm' ? 'px-4 py-1.5 rounded-lg' : 'px-5 py-2 rounded-xl'

  const pay = async () => {
    setState({ busy: true, message: '' })
    try {
      const payment = await initiatePayment(order.id)
      if (payment?.redirectUrl) {
        window.location.assign(payment.redirectUrl)
        return
      }
      setState({ busy: false, message: 'Đang tạo yêu cầu thanh toán, vui lòng thử lại sau vài giây.' })
    } catch (err) {
      setState({ busy: false, message: err.response?.data?.message || 'Không tạo được yêu cầu thanh toán.' })
    }
  }

  if (order.status === 'paid') {
    return (
      <Link to={`/my-tickets?orderId=${order.id}`}
        className={`${pad} text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors`}>
        Xem vé
      </Link>
    )
  }
  if (order.status !== 'pending') return null
  return (
    <>
      {state.message && <span className="text-xs text-red-600">{state.message}</span>}
      <button type="button" onClick={pay} disabled={state.busy}
        className={`${pad} text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 shadow-sm transition-all disabled:opacity-60`}>
        {state.busy ? 'Đang chuyển…' : 'Thanh toán ngay'}
      </button>
    </>
  )
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalOrders: 0, totalPages: 1 })
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail Modal state
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const fetchOrders = useCallback(async (page = 1, status = activeTab) => {
    setLoading(true)
    setError(null)
    try {
      const res = await getMyOrders({ page, limit: 10, status })
      if (res.success && res.data) {
        setOrders(res.data.orders || [])
        setPagination(res.data.pagination || { page, limit: 10, totalOrders: 0, totalPages: 1 })
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải lịch sử đơn hàng. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchOrders(1, activeTab)
  }, [fetchOrders, activeTab])

  const handleTabChange = (key) => {
    setActiveTab(key)
    fetchOrders(1, key)
  }

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchOrders(newPage, activeTab)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleOpenDetail = async (orderId) => {
    setSelectedOrderId(orderId)
    setLoadingDetail(true)
    setDetailError(null)
    setDetailOrder(null)
    try {
      const res = await getOrderDetail(orderId)
      if (res.success && res.data) {
        setDetailOrder(res.data)
      }
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Không thể tải chi tiết đơn hàng.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleCloseDetail = () => {
    setSelectedOrderId(null)
    setDetailOrder(null)
    setDetailError(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Lịch sử đơn hàng của tôi
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Xem lại các đơn vé đã đặt, tra cứu tình trạng thanh toán và chi tiết chỗ ngồi.
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-3">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-md shadow-pink-100'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => fetchOrders(pagination.page, activeTab)}
              className="text-red-700 font-semibold underline ml-3"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse">
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-2">
                    <div className="h-5 w-48 bg-gray-200 rounded" />
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                  </div>
                  <div className="h-6 w-24 bg-gray-200 rounded-full" />
                </div>
                <div className="h-4 w-full bg-gray-100 rounded mb-2" />
                <div className="h-4 w-2/3 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          /* Empty state */
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm my-8">
            <div className="text-6xl mb-4">🎟️</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Chưa có đơn hàng nào</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
              {activeTab === 'all'
                ? 'Bạn chưa đặt vé cho sự kiện nào. Hãy khám phá ngay các sự kiện hấp dẫn đang mở bán!'
                : `Không tìm thấy đơn hàng nào ở trạng thái "${STATUS_TABS.find((t) => t.key === activeTab)?.label}".`}
            </p>
            <Link
              to="/events"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-pink-600 shadow-md hover:shadow-lg transition-all"
            >
              Khám phá sự kiện
            </Link>
          </div>
        ) : (
          /* Orders List (AC1 & AC3: Newest first with status, event, seats, total amount) */
          <div className="space-y-4">
            {orders.map((order) => {
              const seatLabels = (order.seats || [])
                .map((s) => `${s.row_label}${s.seat_number}`)
                .join(', ')

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-medium text-gray-400">
                          Mã đơn: #{order.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          Đặt lúc: {formatDateTime(order.created_at)}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-gray-900 mt-1">
                        {order.event?.title || 'Sự kiện âm nhạc / biểu diễn'}
                      </h2>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto">
                      {renderStatusBadge(order.status)}
                    </div>
                  </div>

                  {/* Order Details Body */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <span className="text-xs text-gray-400 block mb-0.5">Thời gian biểu diễn</span>
                      <span className="font-medium text-gray-700">
                        {formatDateTime(order.showtime?.starts_at)}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400 block mb-0.5">Địa điểm</span>
                      <span className="font-medium text-gray-700 truncate block">
                        {order.event?.venue || 'Chưa cập nhật'}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400 block mb-0.5">Số lượng ghế</span>
                      <span className="font-medium text-gray-900">
                        {order.seat_count || (order.seats?.length || 0)} ghế
                        {seatLabels && (
                          <span className="text-xs text-gray-500 block truncate">
                            ({seatLabels})
                          </span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400 block mb-0.5">Tổng tiền</span>
                      <span className="font-bold text-pink-600 text-base">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => handleOpenDetail(order.id)}
                      className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Xem chi tiết
                    </button>
                    <OrderActions order={order} />
                  </div>
                </div>
              )
            })}

            {/* Pagination Controls (NFR: Phân trang) */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-2xl shadow-sm mt-6">
                <div className="text-xs sm:text-sm text-gray-500">
                  Hiển thị trang <span className="font-medium text-gray-900">{pagination.page}</span> /{' '}
                  <span className="font-medium text-gray-900">{pagination.totalPages}</span> (Tổng{' '}
                  <span className="font-medium text-gray-900">{pagination.totalOrders}</span> đơn)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={!pagination.hasPrevPage && pagination.page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Trang trước
                  </button>

                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={!pagination.hasNextPage && pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Order Detail Modal */}
      <Modal
        isOpen={!!selectedOrderId}
        onClose={handleCloseDetail}
        title="Chi tiết đơn hàng"
        size="lg"
      >
        {loadingDetail ? (
          <div className="p-6 text-center text-gray-500">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Đang tải chi tiết đơn hàng...</p>
          </div>
        ) : detailError ? (
          <div className="p-6 text-center text-red-600">
            <p className="text-sm">{detailError}</p>
          </div>
        ) : detailOrder ? (
          <div className="p-6 space-y-5 text-sm">
            {/* Header info */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <h4 className="font-bold text-lg text-gray-900">
                  {detailOrder.event?.title || 'Sự kiện'}
                </h4>
                <p className="text-gray-500 text-xs mt-0.5">
                  Mã đơn: <span className="font-mono">{detailOrder.id}</span>
                </p>
              </div>
              <div>{renderStatusBadge(detailOrder.status)}</div>
            </div>

            {/* Event & Showtime info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-400">Địa điểm:</span>
                <span className="font-medium text-gray-800">{detailOrder.event?.venue || 'Chưa cập nhật'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Suất diễn:</span>
                <span className="font-medium text-gray-800">{formatDateTime(detailOrder.showtime?.starts_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Thời gian đặt:</span>
                <span className="font-medium text-gray-800">{formatDateTime(detailOrder.created_at)}</span>
              </div>
              {detailOrder.expires_at && detailOrder.status === 'pending' && (
                <div className="flex justify-between text-amber-600">
                  <span>Hạn thanh toán:</span>
                  <span className="font-medium">{formatDateTime(detailOrder.expires_at)}</span>
                </div>
              )}
            </div>

            {/* Seats List */}
            <div>
              <h5 className="font-semibold text-gray-800 mb-2 text-xs uppercase tracking-wider text-gray-500">
                Danh sách ghế ({detailOrder.seats?.length || 0})
              </h5>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {(detailOrder.seats || []).map((s, idx) => (
                  <div key={s.id || idx} className="flex justify-between items-center px-4 py-2.5 text-xs bg-white">
                    <div>
                      <span className="font-bold text-gray-800">
                        Hàng {s.row_label} - Ghế {s.seat_number}
                      </span>
                      <span className="text-gray-400 ml-2">({s.category_name})</span>
                    </div>
                    <span className="font-medium text-gray-700">
                      {formatCurrency(s.unit_price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <span className="font-bold text-gray-800">Tổng thanh toán:</span>
              <span className="text-xl font-bold text-pink-600">
                {formatCurrency(detailOrder.total_amount)}
              </span>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Đóng
              </button>
              <OrderActions order={detailOrder} size="md" />
            </div>
          </div>
        ) : null}
      </Modal>

      <Footer />
    </div>
  )
}
