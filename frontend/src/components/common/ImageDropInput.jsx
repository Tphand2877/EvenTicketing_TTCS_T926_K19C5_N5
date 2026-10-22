import { useState, useRef } from 'react'
import apiClient from '../../services/apiClient'

/**
 * Component nhập ảnh thông minh:
 * - Hỗ trợ kéo & thả ảnh trực tiếp (Drag & Drop) hoặc bấm tải file từ máy
 * - Hỗ trợ nhập/dán URL ảnh trực tiếp (https://... hoặc /images/...)
 * - Hiển thị ảnh xem trước (Live Preview) và nút xóa ảnh
 * - Hỗ trợ các nút chọn nhanh mẫu có sẵn (presets)
 */
export default function ImageDropInput({
  label,
  value = '',
  onChange,
  placeholder = 'Dán link ảnh (https://...) hoặc kéo thả tệp ảnh vào đây',
  presets = [],
  helpText = '',
}) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  const handleFileProcess = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Vui lòng chọn tệp định dạng hình ảnh (PNG, JPG, SVG, WebP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Dung lượng ảnh tối đa 5 MB.')
      return
    }

    setUploadError('')
    setUploading(true)

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Data = e.target.result
        try {
          const res = await apiClient.post('/upload/image', {
            image: base64Data,
            name: file.name,
          })
          if (res.data?.url) {
            onChange(res.data.url)
          } else {
            onChange(base64Data)
          }
        } catch {
          // Fallback lưu trực tiếp base64 nếu API upload có vấn đề
          onChange(base64Data)
        } finally {
          setUploading(false)
        }
      }
      reader.onerror = () => {
        setUploadError('Không thể đọc file ảnh.')
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setUploadError('Đã xảy ra lỗi khi xử lý tệp.')
      setUploading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileProcess(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleClear = () => {
    onChange('')
    setUploadError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-bold text-gray-700">
          {label}
        </label>
      )}

      {/* Vùng kéo thả hoặc tải ảnh */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !value && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-4 text-center transition-all ${
          dragOver
            ? 'border-pink-500 bg-pink-50/70 scale-[1.01]'
            : value
              ? 'border-gray-200 bg-gray-50/50'
              : 'border-gray-300 bg-white hover:border-pink-400 hover:bg-pink-50/20 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileProcess(f)
          }}
        />

        {value ? (
          /* Đã có ảnh -> Hiển thị xem trước */
          <div className="flex items-center gap-3 text-left">
            <div className="w-20 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-900 shrink-0 flex items-center justify-center shadow-xs">
              <img
                src={value}
                alt="Xem trước"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            </div>
            <div className="flex-1 min-w-0 text-xs">
              <p className="font-bold text-gray-900 truncate">{value.startsWith('data:') ? 'Ảnh đã tải từ máy tính' : value}</p>
              <p className="text-[11px] text-emerald-600 font-medium">✓ Ảnh đã sẵn sàng</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                className="px-2.5 py-1 text-[11px] font-semibold text-pink-600 bg-white hover:bg-pink-50 border border-pink-200 rounded-lg shadow-xs"
              >
                Đổi ảnh
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
                className="px-2 py-1 text-[11px] font-bold text-gray-400 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 rounded-lg shadow-xs"
                title="Xóa ảnh"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          /* Chưa có ảnh -> Hướng dẫn kéo thả hoặc bấm tải */
          <div className="py-2 space-y-1 select-none">
            <div className="text-2xl mb-1">{uploading ? '⏳' : '🖼️'}</div>
            <p className="text-xs font-semibold text-gray-700">
              {uploading ? 'Đang tải ảnh lên…' : 'Kéo thả tệp ảnh vào đây hoặc bấm để chọn'}
            </p>
            <p className="text-[11px] text-gray-400">
              Hỗ trợ PNG, JPG, SVG, WebP (Tối đa 5 MB)
            </p>
          </div>
        )}
      </div>

      {uploadError && (
        <p className="text-[11px] text-red-600 font-medium">{uploadError}</p>
      )}

      {/* Ô nhập / dán Link ảnh trực tiếp */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value.startsWith('data:') ? '' : value}
          onChange={(e) => {
            setUploadError('')
            onChange(e.target.value)
          }}
          placeholder={placeholder}
          className="input-field text-xs flex-1 py-2"
        />
        {value && !value.startsWith('data:') && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-2 text-xs text-gray-400 hover:text-red-600 border border-gray-200 rounded-xl bg-white"
            title="Xóa link"
          >
            ✕
          </button>
        )}
      </div>

      {/* Presets (Chọn nhanh mẫu) */}
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] text-gray-500 font-medium">Mẫu gợi ý:</span>
          {presets.map((preset) => (
            <button
              key={preset.url}
              type="button"
              onClick={() => {
                setUploadError('')
                onChange(preset.url)
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                value === preset.url
                  ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {helpText && (
        <p className="text-[11px] text-gray-400">{helpText}</p>
      )}
    </div>
  )
}
