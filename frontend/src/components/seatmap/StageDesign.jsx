import { useState } from 'react'

/**
 * CẤU HÌNH SƠ ĐỒ KHÁN ĐÀI & SÂN KHẤU CHO TỪNG SỰ KIỆN
 * Thiết kế tỉ mỉ theo chuẩn sơ đồ concert (như show "Anh Trai Vượt Ngàn Chông Gai")
 * và các mô hình sân vận động, hội nghị, eSports riêng biệt.
 */
const EVENT_STAGE_PROFILES = {
  // 1. CONCERT & NHẠC SỐNG (Dựa trên sơ đồ thực tế Anh Trai / Yeah1 / Techcombank)
  symphony: {
    id: 'symphony',
    name: 'SƠ ĐỒ KHÁN ĐÀI SÂN KHẤU CONCERT',
    subTitle: 'Sân khấu Catwalk T-Stage & Các Phân Khu Khán Đài',
    venue: 'Nhà hát Lớn Hà Nội / Sân Vận Động',
    badgeText: '🎤 Mega Concert & Catwalk',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40',
    themeBg: 'bg-gradient-to-b from-[#2d080a] via-[#1c0406] to-[#120203]',
    accentBorder: 'border-red-900/60',
    zones: [
      { name: 'ANH TÀI VIP (Catwalk Pit)', color: 'bg-sky-400', desc: 'Sát sàn diễn Runway Catwalk, tương tác cận cảnh nghệ sĩ' },
      { name: 'SAY HI / ĐẮT GIÁ / TRUYỀN LỬA', color: 'bg-amber-500', desc: 'Khu vực trung tâm đối diện sân khấu chính' },
      { name: 'TIÊU ĐIỂM (Cánh Trái / Phải)', color: 'bg-teal-400', desc: 'Khán đài góc chéo hướng nhìn bao quát toàn bộ sân khấu' },
      { name: 'HỎA CA RỰC RỠ / ĐỈNH NÓC', color: 'bg-rose-600', desc: 'Khán đài cánh hai bên trải nghiệm hiệu ứng âm thanh ánh sáng' },
      { name: 'ANH TÀI / TOÀN NĂNG (VIP Hàng A - B)', color: 'bg-pink-400', desc: 'Khu vực ghế ngồi VIP chính diện, tầm nhìn chuẩn nhất' },
      { name: 'BỀN BỈ / VƯỢT CHÔNG GAI (Hàng C - L)', color: 'bg-purple-600', desc: 'Khán phòng tiêu chuẩn, trọn vẹn không khí đại nhạc hội' },
    ],
    renderFullDiagram: () => (
      <svg viewBox="0 0 840 680" className="w-full h-auto select-none font-sans drop-shadow-xl" fill="none">
        <defs>
          <linearGradient id="concertBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2e0508" />
            <stop offset="40%" stopColor="#1a0204" />
            <stop offset="100%" stopColor="#0c0102" />
          </linearGradient>
          <radialGradient id="stageGlow" cx="50%" cy="25%" r="65%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#7f1d1d" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="catwalkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="vipBoxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>

        {/* Nền phong cách Concert đỏ rực rỡ */}
        <rect x="0" y="0" width="840" height="680" rx="20" fill="url(#concertBg)" stroke="#7f1d1d" strokeWidth="2" />
        <rect x="0" y="0" width="840" height="680" fill="url(#stageGlow)" />

        {/* Header Thương hiệu & Tiêu đề */}
        <g transform="translate(40, 24)">
          <text x="0" y="22" fill="#ef4444" fontSize="11" fontWeight="900" letterSpacing="1.5">YEAH1</text>
          <text x="45" y="22" fill="#ffffff" fontSize="10" fontWeight="bold" opacity="0.8">★ PRODUCTION</text>
          <text x="760" y="22" textAnchor="end" fill="#ffffff" fontSize="10" fontWeight="bold" opacity="0.8">SPONSOR PARTNER ❖</text>
        </g>

        {/* TIÊU ĐỀ CHÍNH SƠ ĐỒ KHÁN ĐÀI SÂN KHẤU */}
        <text x="420" y="70" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="900" letterSpacing="4">
          SƠ ĐỒ KHÁN ĐÀI SÂN KHẤU
        </text>
        <line x1="320" y1="80" x2="520" y2="80" stroke="#ef4444" strokeWidth="2" strokeDasharray="30 8" />

        {/* ─── CỘT CỔNG VÀO BÊN TRÁI ──────────────────────────── */}
        <g transform="translate(30, 110)">
          <rect x="0" y="0" width="135" height="150" rx="8" fill="#450a0a" stroke="#dc2626" strokeWidth="1.2" opacity="0.9" />
          <text x="67" y="22" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">CỔNG VÀO 1</text>
          <text x="67" y="36" textAnchor="middle" fill="#f87171" fontSize="8" fontWeight="600">(HẠNG VÉ)</text>
          <text x="12" y="54" fill="#ffffff" fontSize="8">• Vượt Chông Gai 1</text>
          <text x="12" y="68" fill="#ffffff" fontSize="8">• Bền Bỉ 1 / Toàn Năng 1</text>
          <text x="12" y="82" fill="#ffffff" fontSize="8">• Anh Tài 1 / Cát Tộc 1</text>
          <text x="12" y="96" fill="#ffffff" fontSize="8">• Hỏa Ca Rực Rỡ 1</text>
          <text x="12" y="110" fill="#ffffff" fontSize="8">• Tiêu Điểm 1 / Đỉnh Nóc 1</text>
          <text x="12" y="124" fill="#ffffff" fontSize="8">• Say Hi 1 / Đắt Giá 1</text>
          <text x="12" y="138" fill="#ffffff" fontSize="8">• Truyền Lửa 1</text>

          {/* Dịch vụ biểu tượng */}
          <g transform="translate(8, 165)" opacity="0.8">
            <text x="0" y="12" fill="#fca5a5" fontSize="9">🎫 Cửa soát vé vào</text>
            <text x="0" y="28" fill="#fca5a5" fontSize="9">🥤 Khu ẩm thực F&B</text>
            <text x="0" y="44" fill="#fca5a5" fontSize="9">🏥 Khu trực Y tế</text>
            <text x="0" y="60" fill="#fca5a5" fontSize="9">🚻 Khu vực Vệ sinh</text>
          </g>

          {/* Mũi tên chỉ lối vào */}
          <path d="M 120 250 L 145 250 M 140 245 L 145 250 L 140 255" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
          <text x="10" y="254" fill="#fca5a5" fontSize="9" fontWeight="bold">LỐI VÀO SIÊU SAO 1 ➔</text>
        </g>

        {/* ─── CỘT CỔNG VÀO BÊN PHẢI ─────────────────────────── */}
        <g transform="translate(675, 110)">
          <rect x="0" y="0" width="135" height="150" rx="8" fill="#450a0a" stroke="#dc2626" strokeWidth="1.2" opacity="0.9" />
          <text x="67" y="22" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">CỔNG VÀO 2</text>
          <text x="67" y="36" textAnchor="middle" fill="#f87171" fontSize="8" fontWeight="600">(HẠNG VÉ)</text>
          <text x="12" y="54" fill="#ffffff" fontSize="8">• Vượt Chông Gai 2</text>
          <text x="12" y="68" fill="#ffffff" fontSize="8">• Bền Bỉ 2 / Toàn Năng 2</text>
          <text x="12" y="82" fill="#ffffff" fontSize="8">• Anh Tài 2 / Cát Tộc 2</text>
          <text x="12" y="96" fill="#ffffff" fontSize="8">• Hỏa Ca Rực Rỡ 2</text>
          <text x="12" y="110" fill="#ffffff" fontSize="8">• Tiêu Điểm 2 / Đỉnh Nóc 2</text>
          <text x="12" y="124" fill="#ffffff" fontSize="8">• Say Hi 2 / Đắt Giá 2</text>
          <text x="12" y="138" fill="#ffffff" fontSize="8">• Truyền Lửa 2</text>

          {/* Dịch vụ biểu tượng */}
          <g transform="translate(8, 165)" opacity="0.8">
            <text x="0" y="12" fill="#fca5a5" fontSize="9">🎫 Cửa soát vé vào</text>
            <text x="0" y="28" fill="#fca5a5" fontSize="9">🥤 Khu ẩm thực F&B</text>
            <text x="0" y="44" fill="#fca5a5" fontSize="9">🏥 Khu trực Y tế</text>
            <text x="0" y="60" fill="#fca5a5" fontSize="9">🚻 Khu vực Vệ sinh</text>
          </g>

          <path d="M 15 250 L -10 250 M -5 245 L -10 250 L -5 255" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
          <text x="25" y="254" fill="#fca5a5" fontSize="9" fontWeight="bold">LỐI VÀO SIÊU SAO 2 ➔</text>
        </g>

        {/* ─── KHU VỰC SÂN KHẤU CHÍNH & CATWALK (T-STAGE) ──────── */}
        <g transform="translate(190, 85)">
          {/* Sân khấu chính nền xám */}
          <path d="M 150 15 L 150 35 L 180 35 L 180 15 L 280 15 L 280 35 L 310 35 L 310 15 L 350 15 L 350 55 L 315 55 L 315 85 L 145 85 L 145 55 L 110 55 L 110 15 Z" fill="url(#catwalkGrad)" stroke="#94a3b8" strokeWidth="2" />
          <text x="230" y="45" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900" letterSpacing="3">SÂN KHẤU CHÍNH</text>

          {/* Sàn diễn Catwalk đâm thẳng xuống giữa khán đài */}
          <path d="M 195 85 L 265 85 L 265 240 L 280 255 L 280 280 L 265 295 L 265 315 L 195 315 L 195 295 L 180 280 L 180 255 L 195 240 Z" fill="url(#catwalkGrad)" stroke="#94a3b8" strokeWidth="1.8" />
          <text x="230" y="190" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontWeight="bold" letterSpacing="2" transform="rotate(-90 230 190)">CATWALK RUNWAY</text>

          {/* Các ô VIP CATWALK màu xanh biển (Anh Tài VIP) */}
          <rect x="202" y="105" width="25" height="35" rx="3" fill="url(#vipBoxGrad)" stroke="#ffffff" strokeWidth="1" />
          <text x="214" y="125" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">VIP 1</text>

          <rect x="233" y="105" width="25" height="35" rx="3" fill="url(#vipBoxGrad)" stroke="#ffffff" strokeWidth="1" />
          <text x="245" y="125" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">VIP 2</text>

          <rect x="202" y="150" width="25" height="35" rx="3" fill="url(#vipBoxGrad)" stroke="#ffffff" strokeWidth="1" />
          <text x="214" y="170" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">VIP 3</text>

          <rect x="233" y="150" width="25" height="35" rx="3" fill="url(#vipBoxGrad)" stroke="#ffffff" strokeWidth="1" />
          <text x="245" y="170" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">VIP 4</text>

          {/* Mũi catwalk hình kim cương */}
          <rect x="210" y="248" width="40" height="25" rx="3" fill="url(#vipBoxGrad)" stroke="#ffffff" strokeWidth="1" />
          <text x="230" y="263" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">VIP CATWALK</text>

          <rect x="212" y="285" width="36" height="25" rx="3" fill="url(#vipBoxGrad)" stroke="#ffffff" strokeWidth="1" />
          <text x="230" y="300" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">BỤC SOLO</text>

          {/* ── KHU TRUNG TÂM BÊN TRÁI CATWALK (Cam) ── */}
          <polygon points="50,90 185,90 185,255 80,255" fill="#f97316" stroke="#fbbf24" strokeWidth="1.5" />
          {/* Phân 3 dải */}
          <line x1="95" y1="90" x2="115" y2="255" stroke="#fdba74" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="140" y1="90" x2="150" y2="255" stroke="#fdba74" strokeWidth="1" strokeDasharray="3 3" />
          <text x="75" y="170" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-75 75 170)">SAY HI 1</text>
          <text x="125" y="170" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-82 125 170)">ĐẮT GIÁ 1</text>
          <text x="168" y="170" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-87 168 170)">TRUYỀN LỬA 1</text>

          {/* ── KHU TRUNG TÂM BÊN PHẢI CATWALK (Cam) ── */}
          <polygon points="275,90 410,90 380,255 275,255" fill="#f97316" stroke="#fbbf24" strokeWidth="1.5" />
          <line x1="320" y1="90" x2="310" y2="255" stroke="#fdba74" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="365" y1="90" x2="345" y2="255" stroke="#fdba74" strokeWidth="1" strokeDasharray="3 3" />
          <text x="292" y="170" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-87 292 170)">TRUYỀN LỬA 2</text>
          <text x="335" y="170" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-82 335 170)">ĐẮT GIÁ 2</text>
          <text x="382" y="170" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-75 382 170)">SAY HI 2</text>

          {/* ── CÁNH NGOÀI PHÍA TRÊN (Xanh ngọc / Teal) ── */}
          {/* Cánh trái */}
          <polygon points="-25,125 45,125 70,220 0,220" fill="#0d9488" stroke="#2dd4bf" strokeWidth="1.5" transform="rotate(-15 15 170)" />
          <text x="15" y="175" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(-15 15 175) rotate(-90 15 175)" textAnchor="middle">TIÊU ĐIỂM 1</text>

          {/* Cánh phải */}
          <polygon points="390,125 460,125 435,220 365,220" fill="#0d9488" stroke="#2dd4bf" strokeWidth="1.5" transform="rotate(15 415 170)" />
          <text x="415" y="175" fill="#ffffff" fontSize="9" fontWeight="bold" transform="rotate(15 415 175) rotate(-90 415 175)" textAnchor="middle">TIÊU ĐIỂM 2</text>

          {/* ── CÁNH NGOÀI PHÍA DƯỚI (Đỏ sẫm / Crimson) ── */}
          {/* Góc trái dưới */}
          <polygon points="5,230 75,230 115,340 45,340" fill="#b91c1c" stroke="#f87171" strokeWidth="1.5" transform="rotate(-30 60 285)" />
          <text x="50" y="285" fill="#ffffff" fontSize="8" fontWeight="bold" transform="rotate(-30 50 285) rotate(-90 50 285)" textAnchor="middle">HỎA CA RỰC RỠ 1</text>

          {/* Góc phải dưới */}
          <polygon points="385,230 455,230 415,340 345,340" fill="#b91c1c" stroke="#f87171" strokeWidth="1.5" transform="rotate(30 400 285)" />
          <text x="410" y="285" fill="#ffffff" fontSize="8" fontWeight="bold" transform="rotate(30 410 285) rotate(-90 410 285)" textAnchor="middle">HỎA CA RỰC RỠ 2</text>

          {/* ── CÁC DÃY TẦNG GHẾ BÊN DƯỚI (Ngang) ── */}
          {/* Tầng 1: Hồng nhạt - ANH TÀI 1 & 2 */}
          <g transform="translate(60, 260)">
            <polygon points="30,0 310,0 330,42 10,42" fill="#f472b6" stroke="#fbcfe8" strokeWidth="1.5" />
            <line x1="170" y1="0" x2="170" y2="42" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" />
            <text x="100" y="26" textAnchor="middle" fill="#831843" fontSize="11" fontWeight="900">ANH TÀI 1</text>
            <text x="240" y="26" textAnchor="middle" fill="#831843" fontSize="11" fontWeight="900">ANH TÀI 2</text>
          </g>

          {/* Tầng 2: Hồng đậm - TOÀN NĂNG 1 & 2 (Hàng A-B trên lưới chọn ghế) */}
          <g transform="translate(60, 305)">
            <polygon points="15,0 325,0 335,38 5,38" fill="#db2777" stroke="#f472b6" strokeWidth="1.5" />
            <line x1="170" y1="0" x2="170" y2="38" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" />
            <text x="100" y="24" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">TOÀN NĂNG 1 (VIP A)</text>
            <text x="240" y="24" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">TOÀN NĂNG 2 (VIP B)</text>
          </g>

          {/* Tầng 3: Tím - BỀN BỈ 1 & 2 */}
          <g transform="translate(60, 346)">
            <polygon points="5,0 335,0 345,36 -5,36" fill="#9333ea" stroke="#c084fc" strokeWidth="1.5" />
            <line x1="170" y1="0" x2="170" y2="36" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" />
            <text x="100" y="23" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">BỀN BỈ 1</text>
            <text x="240" y="23" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">BỀN BỈ 2</text>
          </g>

          {/* Tầng 4: Tím đậm - VƯỢT CHÔNG GAI 1 & 2 */}
          <g transform="translate(60, 385)">
            <polygon points="-5,0 345,0 350,36 -10,36" fill="#6b21a8" stroke="#a855f7" strokeWidth="1.5" />
            <line x1="170" y1="0" x2="170" y2="36" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" />
            <text x="100" y="23" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">VƯỢT CHÔNG GAI 1</text>
            <text x="240" y="23" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900">VƯỢT CHÔNG GAI 2</text>
          </g>

          {/* Bàn điều khiển FOH (Âm thanh & Ánh sáng) */}
          <g transform="translate(145, 435)">
            <rect x="0" y="0" width="170" height="26" rx="4" fill="#3f0f13" stroke="#ef4444" strokeWidth="1.5" />
            <text x="85" y="17" textAnchor="middle" fill="#fca5a5" fontSize="8" fontWeight="bold">
              🎛️ BÀN ĐIỀU KHIỂN ÂM THANH ÁNH SÁNG FOH
            </text>
          </g>
        </g>

        {/* Chú thích phía dưới cùng */}
        <g transform="translate(60, 615)">
          <rect x="0" y="0" width="720" height="45" rx="10" fill="#260406" stroke="#7f1d1d" strokeWidth="1" />
          <text x="25" y="27" fill="#f87171" fontSize="10" fontWeight="bold">ĐỐI ỨNG TRÊN LƯỚI CHỌN GHẾ:</text>
          <text x="210" y="27" fill="#ffffff" fontSize="10">
            • <strong className="text-pink-400">Hàng A - B:</strong> Khu Vực VIP (Toàn Năng / Anh Tài) &bull; <strong className="text-purple-400">Hàng C - L:</strong> Khu Vực Tiêu Chuẩn (Bền Bỉ / Vượt Chông Gai)
          </text>
        </g>
      </svg>
    ),
  },

  // 2. BÓNG ĐÁ / SÂN VẬN ĐỘNG V.LEAGUE (SÂN HÀNG ĐẪY)
  football: {
    id: 'football',
    name: 'SƠ ĐỒ KHÁN ĐÀI SÂN VẬN ĐỘNG HÀNG ĐẪY',
    subTitle: 'Sân Cỏ Chuẩn FIFA & Khán Đài 4 Mặt A - B - C - D',
    venue: 'Sân vận động Hàng Đẫy, Hà Nội',
    badgeText: '⚽ Sân vận động V.League',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    themeBg: 'bg-gradient-to-b from-[#062413] via-[#03180c] to-[#020e07]',
    accentBorder: 'border-emerald-900/60',
    zones: [
      { name: 'Khán đài A VIP (Hàng A - B)', color: 'bg-amber-400', desc: 'Ghế bọc đệm VIP chính diện khán đài A, sát đường pitch và cabin HLV' },
      { name: 'Khán đài A Tiêu chuẩn (Hàng C - L)', color: 'bg-emerald-500', desc: 'Góc nhìn toàn cảnh trung tâm sân đấu từ trên cao' },
      { name: 'Khán đài B (CĐV Hà Nội FC)', color: 'bg-indigo-600', desc: 'Khu hội cổ động viên sôi động với cờ và dàn trống' },
      { name: 'Khán đài C & D (Cầu môn 2 đầu)', color: 'bg-teal-500', desc: 'Vị trí sau cầu môn theo dõi những pha làm bàn cận cảnh' },
    ],
    renderFullDiagram: () => (
      <svg viewBox="0 0 840 680" className="w-full h-auto select-none font-sans drop-shadow-xl" fill="none">
        <defs>
          <linearGradient id="stadiumBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#052e16" />
            <stop offset="100%" stopColor="#02140a" />
          </linearGradient>
          <linearGradient id="pitchGrass" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#15803d" />
            <stop offset="25%" stopColor="#16a34a" />
            <stop offset="50%" stopColor="#15803d" />
            <stop offset="75%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="840" height="680" rx="20" fill="url(#stadiumBg)" stroke="#166534" strokeWidth="2" />

        {/* Tiêu đề SVĐ */}
        <text x="420" y="50" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900" letterSpacing="3">
          SÂN VẬN ĐỘNG HÀNG ĐẪY – SƠ ĐỒ CHỖ NGỒI V.LEAGUE
        </text>
        <text x="420" y="70" textAnchor="middle" fill="#86efac" fontSize="11" fontWeight="bold">
          HÀ NỘI FC 🔴 VS 🟢 HOÀNG ANH GIA LAI • TRỰC TIẾP V.LEAGUE 2026
        </text>

        {/* KHÁN ĐÀI B (Phía trên cùng) */}
        <g transform="translate(180, 90)">
          <rect x="0" y="0" width="480" height="60" rx="10" fill="#1e1b4b" stroke="#6366f1" strokeWidth="2" />
          <text x="240" y="35" textAnchor="middle" fill="#c7d2fe" fontSize="14" fontWeight="bold">
            KHÁN ĐÀI B (HỘI CỔ ĐỘNG VIÊN HÀ NỘI FC & DRUMMERS)
          </text>
        </g>

        {/* KHÁN ĐÀI C (Bên Trái) */}
        <g transform="translate(70, 165)">
          <rect x="0" y="0" width="95" height="310" rx="10" fill="#0f766e" stroke="#14b8a6" strokeWidth="2" />
          <text x="47" y="155" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold" transform="rotate(-90 47 155)">
            KHÁN ĐÀI C (CẦU MÔN TRÁI)
          </text>
        </g>

        {/* MẶT SÂN BÓNG ĐÁ TRUNG TÂM (PITCH) */}
        <g transform="translate(180, 165)">
          <rect x="0" y="0" width="480" height="310" rx="12" fill="url(#pitchGrass)" stroke="#ffffff" strokeWidth="3" />
          {/* Vạch vôi */}
          <rect x="20" y="20" width="440" height="270" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
          <line x1="240" y1="20" x2="240" y2="290" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
          <circle cx="240" cy="155" r="55" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
          <circle cx="240" cy="155" r="4" fill="#ffffff" />
          <text x="240" y="162" textAnchor="middle" fontSize="20">⚽</text>

          {/* Vòng cấm 16m50 Trái & Phải */}
          <rect x="20" y="90" width="70" height="130" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
          <rect x="390" y="90" width="70" height="130" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.9" />

          {/* Cabin HLV */}
          <rect x="80" y="275" width="110" height="24" rx="4" fill="#047857" stroke="#34d399" strokeWidth="1.5" />
          <text x="135" y="291" textAnchor="middle" fill="#d1fae5" fontSize="9" fontWeight="bold">CABIN HÀ NỘI FC</text>

          <rect x="290" y="275" width="110" height="24" rx="4" fill="#047857" stroke="#34d399" strokeWidth="1.5" />
          <text x="345" y="291" textAnchor="middle" fill="#d1fae5" fontSize="9" fontWeight="bold">CABIN HAGL</text>
        </g>

        {/* KHÁN ĐÀI D (Bên Phải) */}
        <g transform="translate(675, 165)">
          <rect x="0" y="0" width="95" height="310" rx="10" fill="#0f766e" stroke="#14b8a6" strokeWidth="2" />
          <text x="47" y="155" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold" transform="rotate(90 47 155)">
            KHÁN ĐÀI D (CẦU MÔN PHẢI)
          </text>
        </g>

        {/* KHÁN ĐÀI A (Chính diện bên dưới - Nơi người dùng đang chọn ghế!) */}
        <g transform="translate(180, 490)">
          {/* Khán đài A VIP */}
          <rect x="0" y="0" width="480" height="50" rx="8" fill="#d97706" stroke="#fbbf24" strokeWidth="2.5" />
          <text x="240" y="32" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="900" letterSpacing="1">
            ★ KHÁN ĐÀI A VIP (HÀNG A - B: GHẾ VIP BỌC ĐỆM SÁT SÂN) ★
          </text>

          {/* Khán đài A Tiêu chuẩn */}
          <rect x="0" y="58" width="480" height="55" rx="8" fill="#15803d" stroke="#4ade80" strokeWidth="2" />
          <text x="240" y="92" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">
            KHÁN ĐÀI A TIÊU CHUẨN (HÀNG C - L: TOÀN CẢNH TRUNG TÂM)
          </text>
        </g>

        {/* Chỉ dẫn cổng */}
        <g transform="translate(180, 620)">
          <text x="0" y="20" fill="#86efac" fontSize="11" fontWeight="bold">🚪 CỔNG VÀO KHÁN ĐÀI A: Đường Trịnh Hoài Đức</text>
          <text x="480" y="20" textAnchor="end" fill="#86efac" fontSize="11" fontWeight="bold">🚪 CỔNG KHÁN ĐÀI B: Phố Hàng Cháo</text>
        </g>
      </svg>
    ),
  },

  // 3. HỘI NGHỊ CÔNG NGHỆ (GEM CENTER TECH SUMMIT)
  tech: {
    id: 'tech',
    name: 'SƠ ĐỒ HỘI TRƯỜNG KEYNOTE GEM CENTER',
    subTitle: 'Sân Khấu Màn Hình LED 360° & Khu Vực Đại Biểu C-Level',
    venue: 'GEM Center, TP.HCM',
    badgeText: '💻 Tech Summit Keynote',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    themeBg: 'bg-gradient-to-b from-[#041d33] via-[#021324] to-[#010912]',
    accentBorder: 'border-cyan-900/60',
    zones: [
      { name: 'VIP Delegates (Hàng A - B)', color: 'bg-cyan-400', desc: 'Bàn tròn đại biểu danh dự, nhà đầu tư VC và diễn giả' },
      { name: 'Attendees Stalls (Hàng C - L)', color: 'bg-blue-600', desc: 'Khán phòng chính nhìn trực diện màn hình LED 4K' },
      { name: 'Tech Expo & AI Demo Pods', color: 'bg-teal-500', desc: 'Hai bên sảnh trưng bày trải nghiệm giải pháp công nghệ' },
      { name: 'Networking & Press Lounge', color: 'bg-indigo-500', desc: 'Khu vực phỏng vấn báo chí và kết nối đối tác B2B' },
    ],
    renderFullDiagram: () => (
      <svg viewBox="0 0 840 680" className="w-full h-auto select-none font-sans drop-shadow-xl" fill="none">
        <defs>
          <linearGradient id="techLedWall" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="840" height="680" rx="20" fill="#031525" stroke="#0284c7" strokeWidth="2" />

        <text x="420" y="50" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900" letterSpacing="3">
          VIETNAM TECH SUMMIT 2026 – GRAND BALLROOM GEM CENTER
        </text>

        {/* Màn hình LED cong khổng lồ */}
        <g transform="translate(100, 75)">
          <path d="M 40 35 Q 320 -15 600 35 L 590 60 Q 320 15 50 60 Z" fill="url(#techLedWall)" stroke="#38bdf8" strokeWidth="2" />
          <text x="320" y="42" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900" letterSpacing="4">
            PANORAMIC CURVED LED SCREEN 360° (AI & CLOUD REVOLUTION)
          </text>
        </g>

        {/* Sân khấu Keynote Presentation */}
        <g transform="translate(140, 135)">
          <polygon points="50,10 510,10 470,80 90,80" fill="#0f172a" stroke="#0ea5e9" strokeWidth="2" />
          {/* Bục phát biểu Podium */}
          <rect x="130" y="30" width="45" height="30" rx="4" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.5" />
          <text x="152" y="49" textAnchor="middle" fill="#ffffff" fontSize="11">🎤</text>

          {/* Bàn tọa đàm Panel */}
          <rect x="260" y="32" width="180" height="26" rx="13" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
          <text x="350" y="49" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="bold">PANEL DISCUSSION TABLE</text>
        </g>

        {/* Khu vực triển lãm Tech Expo 2 bên cánh */}
        <g transform="translate(50, 240)">
          <rect x="0" y="0" width="100" height="280" rx="10" fill="#082f49" stroke="#0284c7" strokeWidth="1.5" />
          <text x="50" y="140" textAnchor="middle" fill="#7dd3fc" fontSize="12" fontWeight="bold" transform="rotate(-90 50 140)">
            TECH EXPO & DEMO BOOTHS
          </text>
        </g>
        <g transform="translate(690, 240)">
          <rect x="0" y="0" width="100" height="280" rx="10" fill="#082f49" stroke="#0284c7" strokeWidth="1.5" />
          <text x="50" y="140" textAnchor="middle" fill="#7dd3fc" fontSize="12" fontWeight="bold" transform="rotate(90 50 140)">
            STARTUP AI SHOWCASE
          </text>
        </g>

        {/* Khán phòng đại biểu VIP (Hàng A - B) */}
        <g transform="translate(180, 240)">
          <rect x="0" y="0" width="480" height="80" rx="10" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="2" />
          <text x="240" y="45" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold">
            💎 KHU VỰC ĐẠI BIỂU C-LEVEL & VIP DELEGATES (HÀNG A - B)
          </text>
        </g>

        {/* Khán phòng General Attendees (Hàng C - L) */}
        <g transform="translate(180, 340)">
          <rect x="0" y="0" width="480" height="180" rx="10" fill="#0f172a" stroke="#0284c7" strokeWidth="2" />
          <text x="240" y="95" textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="bold">
            👥 KHÁN PHÒNG KỸ SƯ & KHÁCH MỜI GENERAL (HÀNG C - L)
          </text>
        </g>

        {/* Sảnh Networking & Cổng check-in */}
        <g transform="translate(180, 545)">
          <rect x="0" y="0" width="480" height="60" rx="10" fill="#082f49" stroke="#0284c7" strokeWidth="1.5" />
          <text x="240" y="35" textAnchor="middle" fill="#38bdf8" fontSize="12" fontWeight="bold">
            🚪 CỔNG CHECK-IN VIP & SẢNH NETWORKING LOUNGE
          </text>
        </g>
      </svg>
    ),
  },

  // 4. ESPORTS TOURNAMENT (GAMING FESTIVAL)
  esports: {
    id: 'esports',
    name: 'ĐẤU TRƯỜNG THỂ THAO ĐIỆN TỬ ESPORTS',
    subTitle: 'Dual Soundproof Battle Booths & Cúp Vô Địch Trung Tâm',
    venue: 'ICH, TP.HCM',
    badgeText: '🎮 Esports Arena',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    themeBg: 'bg-gradient-to-b from-[#10072b] via-[#090317] to-[#04010a]',
    accentBorder: 'border-indigo-900/60',
    zones: [
      { name: 'Fanzone VIP (Hàng A - B)', color: 'bg-amber-400', desc: 'Trực diện cúp vô địch và cận cảnh tuyển thủ thi đấu' },
      { name: 'Khán đài Cổ Động (Hàng C - L)', color: 'bg-indigo-600', desc: 'Hòa mình vào không khí cổ vũ sôi động với dàn màn hình LED 8K' },
      { name: 'Booth Đội Xanh (Blue Team)', color: 'bg-blue-500', desc: 'Phòng thi đấu cách âm 5 máy chuẩn Pro eSports' },
      { name: 'Booth Đội Đỏ (Red Team)', color: 'bg-red-500', desc: 'Phòng thi đấu cách âm 5 máy chuẩn Pro eSports' },
    ],
    renderFullDiagram: () => (
      <svg viewBox="0 0 840 680" className="w-full h-auto select-none font-sans drop-shadow-xl" fill="none">
        <rect x="0" y="0" width="840" height="680" rx="20" fill="#090d16" stroke="#4f46e5" strokeWidth="2" />

        <text x="420" y="50" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900" letterSpacing="3">
          GAMING FESTIVAL 2026 – GRAND ESPORTS ARENA
        </text>

        {/* Màn hình LED thi đấu trung tâm */}
        <g transform="translate(240, 75)">
          <rect x="0" y="0" width="360" height="50" rx="8" fill="#1e1b4b" stroke="#818cf8" strokeWidth="2" />
          <text x="180" y="32" textAnchor="middle" fill="#facc15" fontSize="13" fontWeight="900">
            ⚔️ TRẬN CHUNG KẾT TỔNG: BLUE TEAM VS RED TEAM ⚔️
          </text>
        </g>

        {/* 2 Phòng cách âm thi đấu */}
        {/* Đội Xanh */}
        <g transform="translate(80, 140)">
          <rect x="0" y="0" width="280" height="100" rx="12" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2.5" />
          <text x="140" y="45" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">🔵 BOOTH ĐỘI XANH</text>
          <text x="140" y="70" textAnchor="middle" fill="#93c5fd" fontSize="11">5 Pro Gaming Rigs (RTX 4090)</text>
        </g>

        {/* Cúp vô địch chính giữa */}
        <g transform="translate(380, 150)">
          <circle cx="40" cy="40" r="35" fill="#312e81" stroke="#fbbf24" strokeWidth="3" />
          <text x="40" y="50" textAnchor="middle" fontSize="30">🏆</text>
          <text x="40" y="95" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">CHAMPIONSHIP TROPHY</text>
        </g>

        {/* Đội Đỏ */}
        <g transform="translate(480, 140)">
          <rect x="0" y="0" width="280" height="100" rx="12" fill="#991b1b" stroke="#f87171" strokeWidth="2.5" />
          <text x="140" y="45" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">🔴 BOOTH ĐỘI ĐỎ</text>
          <text x="140" y="70" textAnchor="middle" fill="#fca5a5" fontSize="11">5 Pro Gaming Rigs (RTX 4090)</text>
        </g>

        {/* Khán đài Fanzone VIP (Hàng A - B) */}
        <g transform="translate(120, 275)">
          <rect x="0" y="0" width="600" height="85" rx="10" fill="#312e81" stroke="#fbbf24" strokeWidth="2" />
          <text x="300" y="50" textAnchor="middle" fill="#fde047" fontSize="16" fontWeight="900">
            🔥 FANZONE VIP AREA (HÀNG A - B: CẬN CẢNH TUYỂN THỦ)
          </text>
        </g>

        {/* Khán đài Cổ động viên (Hàng C - L) */}
        <g transform="translate(120, 380)">
          <rect x="0" y="0" width="600" height="170" rx="10" fill="#1e1b4b" stroke="#6366f1" strokeWidth="2" />
          <text x="300" y="90" textAnchor="middle" fill="#c7d2fe" fontSize="15" fontWeight="bold">
            🎮 KHÁN ĐÀI CỔ ĐỘNG VIÊN TRUNG TÂM (HÀNG C - L)
          </text>
        </g>

        {/* Caster Desk & Âm thanh */}
        <g transform="translate(120, 570)">
          <rect x="0" y="0" width="600" height="50" rx="8" fill="#18181b" stroke="#71717a" strokeWidth="1.5" />
          <text x="300" y="30" textAnchor="middle" fill="#e4e4e7" fontSize="11" fontWeight="bold">
            🎙️ BÀN BÌNH LUẬN VIÊN (CASTER DESK) & KHU VỰC PHỎNG VẤN HẬU TRƯỜNG
          </text>
        </g>
      </svg>
    ),
  },

  // 5. HÀI ĐỘC THOẠI (STAND-UP COMEDY NIGHT)
  comedy: {
    id: 'comedy',
    name: 'SƠ ĐỒ SÂN KHẤU HÀI ĐỘC THOẠI B\'ESTIVAL',
    subTitle: 'Sân Khấu Spotlight Tròn & Vòng Bàn Front-Row Roast Zone',
    venue: "B'estival, Đà Nẵng",
    badgeText: '🎤 Comedy Club',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    themeBg: 'bg-gradient-to-b from-[#251508] via-[#140b04] to-[#0a0502]',
    accentBorder: 'border-amber-900/60',
    zones: [
      { name: 'Front-Row Cocktail VIP (Hàng A - B)', color: 'bg-amber-400', desc: 'Bàn tròn VIP gần nghệ sĩ nhất, khu vực tương tác hài hước' },
      { name: 'Khán đài Club Stalls (Hàng C - L)', color: 'bg-orange-600', desc: 'Dãy ghế rạp bậc thang thưởng thức trọn vẹn từng tiếng cười' },
      { name: 'Cocktail Bar & Lounge', color: 'bg-stone-700', desc: 'Quầy pha chế đồ uống thư giãn trước giờ diễn' },
    ],
    renderFullDiagram: () => (
      <svg viewBox="0 0 840 680" className="w-full h-auto select-none font-sans drop-shadow-xl" fill="none">
        <rect x="0" y="0" width="840" height="680" rx="20" fill="#1c1917" stroke="#b45309" strokeWidth="2" />
        <text x="420" y="50" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900" letterSpacing="3">
          STAND-UP COMEDY NIGHT – LIVE AT B&apos;ESTIVAL
        </text>

        {/* Vầng sáng Spotlight tròn */}
        <g transform="translate(420, 140)">
          <ellipse cx="0" cy="0" rx="140" ry="45" fill="#f59e0b" opacity="0.3" />
          <ellipse cx="0" cy="0" rx="90" ry="30" fill="#292524" stroke="#fbbf24" strokeWidth="2.5" />
          <text x="-10" y="5" textAnchor="middle" fontSize="26">🎙️</text>
          <text x="18" y="5" textAnchor="middle" fontSize="22">🪑</text>
          <text x="0" y="45" textAnchor="middle" fill="#fef08a" fontSize="11" fontWeight="bold">SÂN KHẤU NGHỆ SĨ</text>
        </g>

        {/* Khu bàn tròn Front-Row VIP (Hàng A - B) */}
        <g transform="translate(140, 240)">
          <rect x="0" y="0" width="560" height="100" rx="14" fill="#44403c" stroke="#f59e0b" strokeWidth="2" />
          <text x="280" y="45" textAnchor="middle" fill="#fef08a" fontSize="15" fontWeight="900">
            🍸 FRONT-ROW VIP COCKTAIL (HÀNG A - B: TƯƠNG TÁC CÙNG COMEDIAN)
          </text>
          <text x="280" y="70" textAnchor="middle" fill="#d6d3d1" fontSize="11">
            Bao gồm đồ uống chào mừng & Chỗ ngồi ưu tiên sát bục diễn
          </text>
        </g>

        {/* Khán đài Club Stalls (Hàng C - L) */}
        <g transform="translate(140, 360)">
          <rect x="0" y="0" width="560" height="180" rx="14" fill="#292524" stroke="#ea580c" strokeWidth="2" />
          <text x="280" y="90" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="bold">
            🎭 KHÁN PHÒNG TIÊU CHUẨN (HÀNG C - L: TẦM NHÌN THOÁNG ĐÃNG)
          </text>
        </g>

        {/* Quầy Bar */}
        <g transform="translate(140, 560)">
          <rect x="0" y="0" width="560" height="55" rx="10" fill="#0c0a09" stroke="#78716c" strokeWidth="1.5" />
          <text x="280" y="32" textAnchor="middle" fill="#a8a29e" fontSize="12" fontWeight="bold">
            🍹 QUẦY BAR COCKTAIL & KHU VỰC ĐÓN TIẾP KHÁCH MỜI
          </text>
        </g>
      </svg>
    ),
  },

  // 6. TRIỂN LÃM NGHỆ THUẬT (ART EXHIBITION)
  art: {
    id: 'art',
    name: 'SƠ ĐỒ KHÔNG GIAN TRIỂN LÃM NGHỆ THUẬT',
    subTitle: 'Central Art Pavilion & Lối Đi Thưởng Lãm Điêu Khắc, Hội Họa',
    venue: 'Bảo tàng Mỹ thuật TP.HCM',
    badgeText: '🖼️ Triển lãm Mỹ thuật',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    themeBg: 'bg-gradient-to-b from-[#2b0813] via-[#170308] to-[#0a0104]',
    accentBorder: 'border-rose-900/60',
    zones: [
      { name: 'Khu Ghế Danh Dự (Hàng A - B)', color: 'bg-rose-400', desc: 'Dành cho Giám tuyển nghệ thuật, Nhà sưu tập và Nghệ sĩ sáng tác' },
      { name: 'Khu Thưởng Lãm (Hàng C - L)', color: 'bg-pink-600', desc: 'Dãy ghế thư giãn và theo dõi chương trình khai mạc triển lãm' },
      { name: 'Pavilion Điêu khắc trung tâm', color: 'bg-amber-400', desc: 'Không gian trưng bày các tác phẩm tượng và sắp đặt nghệ thuật' },
    ],
    renderFullDiagram: () => (
      <svg viewBox="0 0 840 680" className="w-full h-auto select-none font-sans drop-shadow-xl" fill="none">
        <rect x="0" y="0" width="840" height="680" rx="20" fill="#1c050d" stroke="#e11d48" strokeWidth="2" />
        <text x="420" y="50" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="900" letterSpacing="3">
          MUSEUM OF CONTEMPORARY ART – SƠ ĐỒ KHÔNG GIAN TRIỂN LÃM
        </text>

        {/* Pavilion Tác phẩm trung tâm */}
        <g transform="translate(180, 80)">
          <rect x="0" y="0" width="480" height="140" rx="14" fill="#4c0519" stroke="#fb7185" strokeWidth="2" />
          <text x="240" y="35" textAnchor="middle" fill="#fecdd3" fontSize="14" fontWeight="bold">
            SẢNH KHAI MẠC & KHÔNG GIAN TÁC PHẨM TRUNG TÂM
          </text>
          <g transform="translate(110, 55)">
            <rect x="0" y="0" width="60" height="50" rx="6" fill="#881337" stroke="#fda4af" strokeWidth="1" />
            <text x="30" y="32" textAnchor="middle" fontSize="20">🎨</text>
          </g>
          <g transform="translate(210, 50)">
            <rect x="0" y="0" width="60" height="60" rx="8" fill="#9f1239" stroke="#fda4af" strokeWidth="2" />
            <text x="30" y="38" textAnchor="middle" fontSize="26">🗿</text>
          </g>
          <g transform="translate(310, 55)">
            <rect x="0" y="0" width="60" height="50" rx="6" fill="#881337" stroke="#fda4af" strokeWidth="1" />
            <text x="30" y="32" textAnchor="middle" fontSize="20">🖼️</text>
          </g>
        </g>

        {/* Hàng ghế Danh dự VIP (Hàng A - B) */}
        <g transform="translate(180, 245)">
          <rect x="0" y="0" width="480" height="85" rx="10" fill="#881337" stroke="#fb7185" strokeWidth="2" />
          <text x="240" y="50" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="900">
            ✨ HÀNG GHẾ DANH DỰ (HÀNG A - B: GIÁM TUYỂN & NHÀ SƯU TẬP)
          </text>
        </g>

        {/* Khán đài Thưởng lãm (Hàng C - L) */}
        <g transform="translate(180, 350)">
          <rect x="0" y="0" width="480" height="180" rx="10" fill="#4c0519" stroke="#f43f5e" strokeWidth="2" />
          <text x="240" y="95" textAnchor="middle" fill="#fecdd3" fontSize="15" fontWeight="bold">
            🏛️ KHU VỰC THƯỞNG LÃM ĐẠI CHÚNG (HÀNG C - L)
          </text>
        </g>

        {/* Lối vào & Quầy lưu niệm */}
        <g transform="translate(180, 550)">
          <rect x="0" y="0" width="480" height="55" rx="10" fill="#2b0813" stroke="#9f1239" strokeWidth="1.5" />
          <text x="240" y="32" textAnchor="middle" fill="#f43f5e" fontSize="12" fontWeight="bold">
            🚪 CỔNG CHÍNH BẢO TÀNG & GIAN HÀNG ẤN PHẨM NGHỆ THUẬT
          </text>
        </g>
      </svg>
    ),
  },
}

/**
 * Xác định cấu hình sân khấu phù hợp với sự kiện
 */
function getStageConfig(event) {
  if (!event) return EVENT_STAGE_PROFILES.symphony

  const title = (event.title || '').toLowerCase()
  const category = (event.category || '').toLowerCase()

  if (title.includes('tech') || title.includes('summit') || title.includes('công nghệ') || category.includes('công nghệ')) {
    if (title.includes('game') || title.includes('gaming') || title.includes('esport')) {
      return EVENT_STAGE_PROFILES.esports
    }
    return EVENT_STAGE_PROFILES.tech
  }

  if (title.includes('v.league') || title.includes('bóng') || title.includes('hà nội fc') || category.includes('thể thao')) {
    return EVENT_STAGE_PROFILES.football
  }

  if (title.includes('comedy') || title.includes('hài') || category.includes('giải trí')) {
    return EVENT_STAGE_PROFILES.comedy
  }

  if (title.includes('triển lãm') || title.includes('nghệ thuật') || category.includes('nghệ thuật')) {
    return EVENT_STAGE_PROFILES.art
  }

  if (title.includes('game') || title.includes('gaming') || title.includes('esport')) {
    return EVENT_STAGE_PROFILES.esports
  }

  // Mặc định cho Âm nhạc / Concert
  return EVENT_STAGE_PROFILES.symphony
}

/**
 * Component hiển thị sơ đồ thiết kế sân khấu hoàn chỉnh
 */
export default function StageDesign({ event }) {
  const [showFullModal, setShowFullModal] = useState(false)
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'full'
  const profile = getStageConfig(event)

  return (
    <div className="w-full mb-5">
      {/* Khung sơ đồ sân khấu phong cách chuyên nghiệp */}
      <div className={`rounded-2xl border ${profile.accentBorder} ${profile.themeBg} p-4 sm:p-5 text-white shadow-xl relative overflow-hidden`}>
        {/* Header Sơ đồ sân khấu */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${profile.badgeColor}`}>
                {profile.badgeText}
              </span>
              <span className="text-xs text-gray-400">
                Địa điểm: <strong className="text-gray-200">{event?.venue || profile.venue}</strong>
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
              <span>{profile.name}</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{profile.subTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'summary' ? 'full' : 'summary')}
              className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl border border-white/20 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <span>{activeTab === 'summary' ? '🔍 Mở rộng sơ đồ toàn cảnh' : '🔼 Thu gọn'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowFullModal(true)}
              className="text-xs font-semibold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white px-3.5 py-1.5 rounded-xl shadow-lg shadow-pink-600/30 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <span>📐 Phóng to toàn màn hình</span>
            </button>
          </div>
        </div>

        {/* Nội dung Sơ đồ trực quan */}
        <div className="transition-all duration-300">
          {activeTab === 'full' ? (
            <div className="bg-black/40 rounded-xl p-3 border border-white/10 overflow-hidden">
              {profile.renderFullDiagram()}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Bản vẽ sơ đồ inline thu gọn */}
              <div className="bg-black/30 rounded-xl p-2 border border-white/10 overflow-hidden max-h-[380px] flex items-center justify-center">
                {profile.renderFullDiagram()}
              </div>

              {/* Bảng chú thích các phân khu khán đài */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs pt-1">
                {profile.zones.map((zone, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-white/5 border border-white/10 p-2 rounded-lg">
                    <span className={`w-3 h-3 rounded-full ${zone.color} shrink-0 mt-0.5 shadow-sm`} />
                    <div>
                      <div className="font-bold text-gray-100">{zone.name}</div>
                      <div className="text-[11px] text-gray-400">{zone.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chỉ dẫn liên kết với lưới chọn ghế bên dưới */}
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-gray-300 gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Hãy đối chiếu phân khu trên sơ đồ sân khấu để chọn dãy ghế tương ứng bên dưới.</span>
          </div>
          <span className="text-gray-400 text-[11px]">
            Hàng A - B: <strong>Khu VIP</strong> &bull; Hàng C - L: <strong>Khu Tiêu Chuẩn</strong>
          </span>
        </div>
      </div>

      {/* MODAL PHÓNG TO TOÀN MÀN HÌNH */}
      {showFullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#140306] rounded-3xl max-w-4xl w-full max-h-[95vh] overflow-y-auto shadow-2xl border border-red-900/50 flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-start justify-between bg-black/40">
              <div>
                <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border mb-1 ${profile.badgeColor}`}>
                  {profile.badgeText}
                </span>
                <h3 className="text-xl font-bold text-white">{profile.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{profile.venue} &bull; {profile.subTitle}</p>
              </div>

              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Bản vẽ đầy đủ độ phân giải cao */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-black/60 rounded-2xl p-2 sm:p-4 border border-white/10">
                {profile.renderFullDiagram()}
              </div>

              {/* Danh sách phân khu */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {profile.zones.map((zone, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 bg-white/5 border border-white/10 p-2.5 rounded-xl">
                    <span className={`w-3.5 h-3.5 rounded-full ${zone.color} shrink-0 mt-0.5`} />
                    <div>
                      <div className="font-bold text-gray-100">{zone.name}</div>
                      <div className="text-[11px] text-gray-400">{zone.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-black/40 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg transition-all"
              >
                Đã rõ & Quay lại chọn ghế
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
