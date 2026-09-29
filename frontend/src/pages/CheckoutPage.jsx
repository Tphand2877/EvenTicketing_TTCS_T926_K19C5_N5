import { Link } from 'react-router-dom'
import Header from '../components/common/Header'
import Footer from '../components/common/Footer'

export default function CheckoutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Thanh toán</h1>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Form */}
          <div className="md:col-span-3 card-auth space-y-4">
            <h2 className="font-semibold text-gray-900">Thông tin người mua</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Họ và tên</label>
              <input type="text" className="input-field" placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email nhận vé</label>
              <input type="email" className="input-field" placeholder="ban@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Số điện thoại</label>
              <input type="tel" className="input-field" placeholder="0912 345 678" />
            </div>

            <h2 className="font-semibold text-gray-900 pt-2">Phương thức thanh toán</h2>
            <div className="space-y-2">
              {['Chuyển khoản ngân hàng', 'Ví MoMo', 'Ví ZaloPay', 'Thẻ tín dụng / Ghi nợ'].map((m) => (
                <label key={m} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-pink-400 hover:bg-pink-50/50 transition-all">
                  <input type="radio" name="payment" className="text-pink-600" />
                  <span className="text-sm text-gray-700">{m}</span>
                </label>
              ))}
            </div>

            <button className="btn-primary mt-2">Xác nhận đặt vé</button>
          </div>

          {/* Summary */}
          <div className="md:col-span-2">
            <div className="card-auth sticky top-20">
              <h2 className="font-semibold text-gray-900 mb-4">Tóm tắt đơn hàng</h2>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Hòa nhạc Symphony</span>
                  <span>350,000₫</span>
                </div>
                <div className="flex justify-between">
                  <span>Số lượng</span>
                  <span>× 2</span>
                </div>
                <div className="flex justify-between">
                  <span>Phí dịch vụ</span>
                  <span>35,000₫</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
                  <span>Tổng cộng</span>
                  <span className="text-gradient">735,000₫</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
