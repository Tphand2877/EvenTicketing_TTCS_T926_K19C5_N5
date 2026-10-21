import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { validateSeatMapContent } from './seatMapFileValidator'
import SeatMapGridPreview from './SeatMapGridPreview'
import { importSeatMap } from '../../services/eventService'
import { getErrorMessage } from '../event/eventFormat'

/**
 * S-06 / T-14: Màn hình tải lên hiện lỗi và xem trước lưới ghế.
 *
 * Tiêu chí chấp nhận (ACs):
 *  - AC1: Thiếu trường bắt buộc ở một ghế -> từ chối toàn bộ, chỉ rõ ghế nào thiếu trường nào.
 *  - AC2: Hai ghế trùng hàng và số -> từ chối, chỉ ra cặp trùng.
 *  - AC3: Nhiều lỗi -> hiển thị đầy đủ danh sách lỗi trong một lần.
 *  - AC4: Không phải JSON hợp lệ -> báo lỗi định dạng kèm vị trí ký tự, không hiện lỗi 500.
 *  - AC5: Hợp lệ -> xem trước lưới ghế đúng số hàng, số ghế, màu theo hạng trước khi xác nhận nạp.
 *  - NFR: Giới hạn kích thước tệp 5 MB; kiểm tra trước khi ghi CSDL.
 */
export default function SeatMapUploadModal({ showtime, eventTitle, onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [validationResult, setValidationResult] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [serverSuccess, setServerSuccess] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [filterError, setFilterError] = useState('')
  const fileInputRef = useRef(null)

  const processFile = (selectedFile) => {
    if (!selectedFile) return
    setServerError(null)
    setServerSuccess(null)
    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const res = validateSeatMapContent(text, selectedFile.size)
      setValidationResult(res)
    }
    reader.onerror = () => {
      setValidationResult({
        isValid: false,
        isSyntaxError: false,
        errors: ['Không thể đọc nội dung tệp. Vui lòng thử lại.'],
      })
    }
    reader.readAsText(selectedFile)
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) processFile(f)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleConfirmImport = async () => {
    if (!validationResult?.isValid || !validationResult?.data?.seats) return
    setUploading(true)
    setServerError(null)
    try {
      const res = await importSeatMap(showtime.id, { seats: validationResult.data.seats })
      setServerSuccess(res.message || `Đã nạp thành công ${validationResult.data.seats.length} ghế!`)
      if (onSuccess) {
        setTimeout(() => {
          onSuccess(res)
        }, 1200)
      }
    } catch (err) {
      setServerError(getErrorMessage(err, 'Lỗi khi nạp sơ đồ ghế lên máy chủ.'))
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadSample = () => {
    const sample = {
      seats: [
        { row: 'A', number: 1, category: 'VIP' },
        { row: 'A', number: 2, category: 'VIP' },
        { row: 'A', number: 3, category: 'VIP' },
        { row: 'A', number: 4, category: 'VIP' },
        { row: 'B', number: 1, category: 'Thường' },
        { row: 'B', number: 2, category: 'Thường' },
        { row: 'B', number: 3, category: 'Thường' },
        { row: 'B', number: 4, category: 'Thường' },
      ],
    }
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'seat-map-sample.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const errors = validationResult?.errors || []
  const filteredErrors = filterError
    ? errors.filter((err) => err.toLowerCase().includes(filterError.toLowerCase()))
    : errors

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-pink-100 text-pink-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Nạp & Xem trước sơ đồ ghế</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Suất #{showtime.id} • {eventTitle} (Sức chứa hiện tại: {showtime.capacity || 0} ghế)
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
            title="Đóng"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Thông báo từ server */}
          {serverError && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex items-start gap-3 text-red-800 text-sm">
              <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <span className="font-semibold block">Lỗi từ máy chủ:</span>
                <span className="text-red-700">{serverError}</span>
              </div>
            </div>
          )}

          {serverSuccess && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3 text-emerald-800 text-sm">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold">{serverSuccess}</span>
            </div>
          )}

          {/* Vùng chọn / kéo thả tệp */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-pink-500 bg-pink-50/50 scale-[1.01]'
                : file
                  ? 'border-gray-300 bg-gray-50/50 hover:border-pink-400'
                  : 'border-gray-200 hover:border-pink-400 hover:bg-pink-50/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="max-w-md mx-auto flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center mb-3 shadow-sm">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">
                {file ? file.name : 'Kéo thả tệp JSON sơ đồ ghế vào đây hoặc bấm để chọn'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Định dạng JSON • Giới hạn tối đa 5 MB • Tối đa 10.000 ghế, 50 hạng
              </p>
              {file && (
                <span className="inline-block mt-2 text-xs font-medium text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full">
                  Kích thước: {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
          </div>

          {/* Công cụ hỗ trợ tải mẫu */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>Yêu cầu tệp có cấu trúc: <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded">seats: [&#123; row, number, category &#125;]</code></span>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="text-pink-600 hover:text-pink-700 font-semibold hover:underline flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Tải tệp JSON mẫu
            </button>
          </div>

          {/* ── BẢNG LỖI KHI TỆP SAI (AC1, AC2, AC3, AC4) ──────────────── */}
          {validationResult && !validationResult.isValid && (
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 text-red-800">
                  <span className="p-1.5 rounded-lg bg-red-100 text-red-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </span>
                  <div>
                    <h4 className="font-bold text-sm">
                      {validationResult.isSyntaxError
                        ? 'Lỗi định dạng tệp (JSON không hợp lệ)'
                        : `Tệp sơ đồ không hợp lệ (Phát hiện ${errors.length} lỗi)`}
                    </h4>
                    <p className="text-xs text-red-600 mt-0.5">
                      Toàn bộ tệp bị từ chối. Vui lòng sửa các lỗi bên dưới rồi tải lại tệp.
                    </p>
                  </div>
                </div>

                {errors.length > 5 && (
                  <input
                    type="text"
                    placeholder="Lọc lỗi (vd: Ghế #2)..."
                    value={filterError}
                    onChange={(e) => setFilterError(e.target.value)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                )}
              </div>

              {/* Danh sách lỗi chi tiết */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {filteredErrors.map((errMsg, idx) => {
                  const matchLabel = errMsg.match(/^(Ghế #\d+):/i)
                  const label = matchLabel ? matchLabel[1] : null
                  const content = label ? errMsg.slice(label.length + 1).trim() : errMsg

                  return (
                    <div
                      key={idx}
                      className="text-xs bg-white border border-red-200/80 rounded-xl p-3 flex items-start gap-2.5 text-gray-800 shadow-2xs"
                    >
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-bold flex items-center justify-center shrink-0 text-[10px]">
                        {idx + 1}
                      </span>
                      <div className="flex-1 leading-relaxed">
                        {label ? (
                          <>
                            <span className="font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded mr-1.5">
                              {label}
                            </span>
                            <span>{content}</span>
                          </>
                        ) : (
                          <span className="font-mono text-red-700">{errMsg}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── XEM TRƯỚC LƯỚI GHẾ KHI TỆP HỢP LỆ (AC5) ───────────────── */}
          {validationResult?.isValid && validationResult?.preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Xem trước lưới ghế sơ đồ
                </h4>
                <span className="text-xs text-gray-500">
                  Kiểm tra kỹ trước khi bấm xác nhận nạp
                </span>
              </div>

              <SeatMapGridPreview preview={validationResult.preview} />
            </div>
          )}
        </div>

        {/* ── Footer / Nút hành động ────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-100 transition-colors"
          >
            Đóng
          </button>

          <div className="flex items-center gap-3">
            {file && (
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setValidationResult(null)
                  setServerError(null)
                  setServerSuccess(null)
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Chọn tệp khác
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!validationResult?.isValid || uploading}
              className={`px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center gap-2 ${
                validationResult?.isValid && !uploading
                  ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-pink-200'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {uploading ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Đang ghi vào CSDL…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Xác nhận nạp sơ đồ ({validationResult?.preview?.totalSeats || 0} ghế)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

SeatMapUploadModal.propTypes = {
  showtime: PropTypes.shape({
    id: PropTypes.number.isRequired,
    capacity: PropTypes.number,
    starts_at: PropTypes.string,
  }).isRequired,
  eventTitle: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
}
