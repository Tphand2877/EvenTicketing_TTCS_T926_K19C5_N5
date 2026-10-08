/**
 * S-06 / T-14: Bộ kiểm tra và phân tích tệp sơ đồ ghế ở Frontend.
 *
 * Kiểm tra tệp JSON trước khi hiển thị xem trước hoặc gửi lên server:
 *  - Giới hạn kích thước tệp: 5 MB (NFR).
 *  - Báo lỗi định dạng JSON kèm vị trí ký tự, dòng và cột (AC4).
 *  - Từ chối toàn bộ và chỉ rõ ghế nào thiếu trường nào (AC1).
 *  - Từ chối và chỉ ra cặp ghế trùng hàng và số (AC2).
 *  - Hiển thị đầy đủ danh sách lỗi trong một lần (AC3).
 *  - Chuẩn bị dữ liệu hiển thị lưới ghế và bảng chú thích màu theo hạng (AC5).
 */

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_SEATS = 10000;
export const MAX_CATEGORIES = 50;

/**
 * Bảng màu được phối sẵn hài hòa, sang trọng cho các hạng ghế.
 */
export const CATEGORY_PALETTE = [
  { name: 'emerald', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-500', hex: '#10b981', light: 'bg-emerald-50' },
  { name: 'amber',   bg: 'bg-amber-500',   text: 'text-amber-700',   border: 'border-amber-500',   hex: '#f59e0b', light: 'bg-amber-50' },
  { name: 'indigo',  bg: 'bg-indigo-500',  text: 'text-indigo-700',  border: 'border-indigo-500',  hex: '#6366f1', light: 'bg-indigo-50' },
  { name: 'rose',    bg: 'bg-rose-500',    text: 'text-rose-700',    border: 'border-rose-500',    hex: '#f43f5e', light: 'bg-rose-50' },
  { name: 'sky',     bg: 'bg-sky-500',     text: 'text-sky-700',     border: 'border-sky-500',     hex: '#0ea5e9', light: 'bg-sky-50' },
  { name: 'purple',  bg: 'bg-purple-500',  text: 'text-purple-700',  border: 'border-purple-500',  hex: '#a855f7', light: 'bg-purple-50' },
  { name: 'orange',  bg: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-500',  hex: '#f97316', light: 'bg-orange-50' },
  { name: 'teal',    bg: 'bg-teal-500',    text: 'text-teal-700',    border: 'border-teal-500',    hex: '#14b8a6', light: 'bg-teal-50' },
];

/**
 * Gán màu cho từng hạng ghế một cách ổn định theo danh sách hoặc tên hạng.
 */
export function getCategoryColorMap(categoryNames) {
  const map = {};
  categoryNames.forEach((cat, index) => {
    // Ưu tiên màu theo tên nếu là VIP, Thường, v.v.
    const lower = cat.toLowerCase();
    if (lower.includes('vip') || lower.includes('vvip')) {
      map[cat] = CATEGORY_PALETTE[1]; // amber / gold
    } else if (lower.includes('thường') || lower.includes('standard')) {
      map[cat] = CATEGORY_PALETTE[2]; // indigo
    } else if (lower.includes('ban công') || lower.includes('balcony')) {
      map[cat] = CATEGORY_PALETTE[4]; // sky
    } else if (lower.includes('premium') || lower.includes('đặc biệt')) {
      map[cat] = CATEGORY_PALETTE[3]; // rose
    } else {
      map[cat] = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
    }
  });
  return map;
}

/**
 * Kiểm tra và phân tích cú pháp tệp sơ đồ ghế (Seat Map File Validator).
 * @param {string} fileContent Nội dung tệp dưới dạng văn bản
 * @param {number} [fileSizeBytes] Kích thước tệp (bytes)
 * @returns {{
 *   isValid: boolean,
 *   isSyntaxError?: boolean,
 *   errors: string[],
 *   position?: number,
 *   line?: number,
 *   column?: number,
 *   data?: { seats: Array<{ row: string, number: number, category: string }> },
 *   preview?: {
 *     totalSeats: number,
 *     totalRows: number,
 *     rows: string[],
 *     seatsByRow: Record<string, Array<{ row: string, number: number, category: string }>>,
 *     maxSeatsInRow: number,
 *     categories: string[],
 *     categoryCounts: Record<string, number>,
 *     categoryColors: Record<string, any>,
 *   }
 * }}
 */
export function validateSeatMapContent(fileContent, fileSizeBytes = 0) {
  // NFR: Giới hạn kích thước tệp 5 MB
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      isSyntaxError: false,
      errors: [`Kích thước tệp (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB) vượt quá giới hạn cho phép (5 MB).`],
    };
  }

  // AC4: Kiểm tra định dạng JSON
  let parsed;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err) {
    let position = null;
    let line = null;
    let column = null;

    const posMatch = err.message.match(/at position (\d+)/i) || err.message.match(/position (\d+)/i);
    if (posMatch) {
      position = Number(posMatch[1]);
      if (position >= 0 && position <= fileContent.length) {
        const textUpToPos = fileContent.slice(0, position);
        const lines = textUpToPos.split('\n');
        line = lines.length;
        column = lines[lines.length - 1].length + 1;
      }
    }

    const lineColMatch = err.message.match(/line (\d+) column (\d+)/i);
    if (lineColMatch) {
      line = Number(lineColMatch[1]);
      column = Number(lineColMatch[2]);
    }

    let message;
    if (position !== null && line !== null && column !== null) {
      message = `Lỗi định dạng JSON tại vị trí ký tự ${position} (dòng ${line}, cột ${column}): ${err.message}`;
    } else if (position !== null) {
      message = `Lỗi định dạng JSON tại vị trí ký tự ${position}: ${err.message}`;
    } else {
      message = `Lỗi định dạng JSON: ${err.message}`;
    }

    return {
      isValid: false,
      isSyntaxError: true,
      errors: [message],
      position,
      line,
      column,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      isValid: false,
      isSyntaxError: false,
      errors: ['Tệp sơ đồ ghế phải là một JSON object.'],
    };
  }

  const rawSeats = parsed.seats;
  if (!Array.isArray(rawSeats) || rawSeats.length === 0) {
    return {
      isValid: false,
      isSyntaxError: false,
      errors: ['Tệp phải có mảng "seats" với ít nhất 1 ghế.'],
    };
  }

  if (rawSeats.length > MAX_SEATS) {
    return {
      isValid: false,
      isSyntaxError: false,
      errors: [`Tệp có ${rawSeats.length} ghế, vượt giới hạn tối đa ${MAX_SEATS} ghế.`],
    };
  }

  const errors = [];
  const normalized = [];
  const positions = new Map();
  const categories = new Set();
  const rowsMap = new Map();

  // AC1, AC2, AC3: Kiểm tra từng ghế và thu thập toàn bộ lỗi
  for (let i = 0; i < rawSeats.length; i += 1) {
    const seat = rawSeats[i];
    const label = `Ghế #${i + 1}`;

    if (seat === null || typeof seat !== 'object' || Array.isArray(seat)) {
      errors.push(`${label}: phải là object { row, number, category }.`);
      continue;
    }

    const seatErrors = [];

    // AC1: Kiểm tra thiếu trường row
    if (seat.row === undefined || seat.row === null) {
      seatErrors.push('thiếu trường bắt buộc "row" (chuỗi 1–10 ký tự)');
    } else if (typeof seat.row !== 'string' || seat.row.trim().length === 0 || seat.row.trim().length > 10) {
      seatErrors.push('"row" là chuỗi 1–10 ký tự');
    }

    // AC1: Kiểm tra thiếu trường number
    if (seat.number === undefined || seat.number === null) {
      seatErrors.push('thiếu trường bắt buộc "number" (số nguyên 1–9999)');
    } else if (!Number.isInteger(seat.number) || seat.number < 1 || seat.number > 9999) {
      seatErrors.push('"number" là số nguyên 1–9999');
    }

    // AC1: Kiểm tra thiếu trường category
    if (seat.category === undefined || seat.category === null) {
      seatErrors.push('thiếu trường bắt buộc "category" (chuỗi 1–100 ký tự)');
    } else if (typeof seat.category !== 'string' || seat.category.trim().length === 0 || seat.category.trim().length > 100) {
      seatErrors.push('"category" là chuỗi 1–100 ký tự');
    }

    if (seatErrors.length > 0) {
      errors.push(`${label}: ${seatErrors.join(', ')}.`);
      continue;
    }

    const row = seat.row.trim();
    const category = seat.category.trim();
    const key = `${row}\u0000${seat.number}`;

    // AC2: Kiểm tra trùng hàng và số ghế
    if (positions.has(key)) {
      const prevIndex = positions.get(key);
      errors.push(`${label}: trùng ghế ${row}${seat.number} với ghế #${prevIndex + 1}.`);
      continue;
    }

    positions.set(key, i);
    categories.add(category);
    const item = { row, number: seat.number, category };
    normalized.push(item);

    if (!rowsMap.has(row)) {
      rowsMap.set(row, []);
    }
    rowsMap.get(row).push(item);
  }

  if (categories.size > MAX_CATEGORIES) {
    errors.push(`Tệp có ${categories.size} hạng ghế, vượt giới hạn ${MAX_CATEGORIES} hạng.`);
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      isSyntaxError: false,
      errors,
    };
  }

  // AC5: Chuẩn bị dữ liệu hiển thị lưới ghế
  const rows = Array.from(rowsMap.keys()).sort((a, b) => {
    // Sắp xếp tự nhiên (A, B, C...)
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const seatsByRow = {};
  let maxSeatsInRow = 0;
  rows.forEach((r) => {
    const sortedRowSeats = rowsMap.get(r).sort((a, b) => a.number - b.number);
    seatsByRow[r] = sortedRowSeats;
    if (sortedRowSeats.length > maxSeatsInRow) {
      maxSeatsInRow = sortedRowSeats.length;
    }
  });

  const categoryList = Array.from(categories);
  const categoryCounts = {};
  categoryList.forEach((cat) => {
    categoryCounts[cat] = normalized.filter((s) => s.category === cat).length;
  });

  const categoryColors = getCategoryColorMap(categoryList);

  return {
    isValid: true,
    errors: [],
    data: { seats: normalized },
    preview: {
      totalSeats: normalized.length,
      totalRows: rows.length,
      rows,
      seatsByRow,
      maxSeatsInRow,
      categories: categoryList,
      categoryCounts,
      categoryColors,
    },
  };
}
