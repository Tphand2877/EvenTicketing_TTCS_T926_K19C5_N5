/**
 * S-06 / T-13: Bộ kiểm tra cấu trúc tệp sơ đồ ghế (Seat Map Validator).
 *
 * Tiêu chí chấp nhận (ACs):
 *  - AC1: Thiếu trường bắt buộc ở một ghế -> từ chối toàn bộ, chỉ rõ ghế nào thiếu trường nào.
 *  - AC2: Hai ghế trùng hàng và số -> từ chối, chỉ ra cặp trùng.
 *  - AC3: Nhiều lỗi -> trả đủ toàn bộ danh sách lỗi trong một lần (không giới hạn 10 lỗi).
 *  - AC4: Không phải JSON hợp lệ -> báo lỗi định dạng kèm vị trí ký tự, không sinh lỗi 500.
 *  - NFR: Chạy trước giao dịch ghi; kích thước tệp tối đa 5 MB, tối đa 10.000 ghế, 50 hạng.
 */

const SEAT_MAP_MAX_SEATS = 10000;
const SEAT_MAP_MAX_CATEGORIES = 50;
const SEAT_MAP_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Trích xuất chi tiết vị trí lỗi (ký tự, dòng, cột) từ SyntaxError của JSON.parse.
 * Hỗ trợ cả định dạng V8 cũ ("at position X") lẫn Node 20+ V8 mới ("Unexpected token ..., ...snippet... is not valid JSON").
 *
 * @param {Error} err
 * @param {string} rawString
 * @returns {{ position: number | null, line: number | null, column: number | null }}
 */
function extractJsonErrorDetails(err, rawString) {
  let position = null;
  let line = null;
  let column = null;

  if (!err) return { position, line, column };

  // 1. Kiểm tra "position <number>"
  const posMatch = err.message && (err.message.match(/at position (\d+)/i) || err.message.match(/position (\d+)/i));
  if (posMatch) {
    position = Number(posMatch[1]);
  }

  // 2. Kiểm tra "line <number> column <number>"
  const lineColMatch = err.message && err.message.match(/line (\d+) column (\d+)/i);
  if (lineColMatch) {
    line = Number(lineColMatch[1]);
    column = Number(lineColMatch[2]);
  }

  // 3. Trong Node 20+ / V8 mới: trích xuất vị trí từ đoạn trích (snippet) và token
  // Ví dụ: Unexpected token 'i', ..."seats": [ invalid js"... is not valid JSON
  if (position === null && typeof rawString === 'string') {
    const snippetMatch = err.message && err.message.match(/\.\.\."([^"]+)"\.\.\./);
    const tokenMatch = err.message && err.message.match(/Unexpected token '([^']+)'/);
    if (snippetMatch) {
      const snippet = snippetMatch[1];
      const snippetIndex = rawString.indexOf(snippet);
      if (snippetIndex !== -1) {
        if (tokenMatch) {
          const token = tokenMatch[1];
          const tokenOffset = snippet.indexOf(token);
          position = tokenOffset !== -1 ? snippetIndex + tokenOffset : snippetIndex;
        } else {
          position = snippetIndex;
        }
      }
    } else if (tokenMatch) {
      const token = tokenMatch[1];
      const tokenIndex = rawString.indexOf(token);
      if (tokenIndex !== -1) {
        position = tokenIndex;
      }
    }
  }

  // 4. Nếu vẫn chưa có vị trí, tính toán bằng phân tích lũy tiến
  if (position === null && typeof rawString === 'string' && rawString.length > 0) {
    for (let i = 1; i <= rawString.length; i += 1) {
      try {
        JSON.parse(rawString.slice(0, i));
      } catch (e) {
        if (!e.message.includes('end of input') && !e.message.includes('Unexpected end of JSON')) {
          position = i - 1;
          break;
        }
      }
    }
  }

  // Tính dòng và cột từ position
  if (position !== null && typeof rawString === 'string' && position >= 0 && position <= rawString.length) {
    const textUpToPos = rawString.slice(0, position);
    const lines = textUpToPos.split('\n');
    line = lines.length;
    column = lines[lines.length - 1].length + 1;
  }

  return { position, line, column };
}

/**
 * Phân tích chuỗi JSON và trích xuất vị trí lỗi ký tự nếu có.
 * @param {string} rawString
 * @returns {{ data: any, error: { message: string, position?: number, line?: number, column?: number, rawMessage: string } | null }}
 */
function parseJsonWithPosition(rawString) {
  if (typeof rawString !== 'string') {
    return { data: rawString, error: null };
  }

  if (Buffer.byteLength(rawString, 'utf8') > SEAT_MAP_MAX_FILE_SIZE_BYTES) {
    return {
      data: null,
      error: {
        message: 'Kích thước tệp vượt quá giới hạn 5 MB.',
        rawMessage: 'Payload Too Large',
      },
    };
  }

  try {
    return { data: JSON.parse(rawString), error: null };
  } catch (err) {
    const { position, line, column } = extractJsonErrorDetails(err, rawString);

    let detail = err.message;
    if (position !== null && line !== null && column !== null) {
      detail = `Lỗi định dạng JSON tại vị trí ký tự ${position} (dòng ${line}, cột ${column}): ${err.message}`;
    } else if (position !== null) {
      detail = `Lỗi định dạng JSON tại vị trí ký tự ${position}: ${err.message}`;
    } else {
      detail = `Lỗi định dạng JSON: ${err.message}`;
    }

    return {
      data: null,
      error: {
        message: detail,
        position,
        line,
        column,
        rawMessage: err.message,
      },
    };
  }
}

/**
 * Kiểm tra cấu trúc đối tượng dữ liệu sơ đồ ghế.
 * Trả về danh sách đầy đủ toàn bộ lỗi kèm vị trí.
 *
 * @param {any} data Đối tượng JSON đã parse
 * @returns {{
 *   isValid: boolean,
 *   errors: string[],
 *   normalized: Array<{ row: string, number: number, category: string }> | null,
 *   summary: { totalSeats: number, totalRows: number, rows: string[], totalCategories: number, categories: string[] } | null
 * }}
 */
function validateSeatMapStructure(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      isValid: false,
      errors: ['Dữ liệu sơ đồ ghế phải là một JSON object.'],
      normalized: null,
      summary: null,
    };
  }

  const seats = data.seats;
  if (!Array.isArray(seats) || seats.length === 0) {
    return {
      isValid: false,
      errors: ['Tệp phải có mảng "seats" với ít nhất 1 ghế.'],
      normalized: null,
      summary: null,
    };
  }

  if (seats.length > SEAT_MAP_MAX_SEATS) {
    return {
      isValid: false,
      errors: [`Tệp có ${seats.length} ghế, vượt giới hạn ${SEAT_MAP_MAX_SEATS} ghế.`],
      normalized: null,
      summary: null,
    };
  }

  const errors = [];
  const normalized = [];
  const positions = new Map();
  const categories = new Set();
  const rowsSet = new Set();

  for (let i = 0; i < seats.length; i += 1) {
    const seat = seats[i];
    const label = `Ghế #${i + 1}`;

    if (seat === null || typeof seat !== 'object' || Array.isArray(seat)) {
      errors.push(`${label}: phải là object { row, number, category }.`);
      continue;
    }

    const seatErrors = [];

    // AC1: Kiểm tra trường row
    if (seat.row === undefined || seat.row === null) {
      seatErrors.push('thiếu trường bắt buộc "row" (chuỗi 1–10 ký tự)');
    } else if (typeof seat.row !== 'string' || seat.row.trim().length === 0 || seat.row.trim().length > 10) {
      seatErrors.push('"row" là chuỗi 1–10 ký tự');
    }

    // AC1: Kiểm tra trường number
    if (seat.number === undefined || seat.number === null) {
      seatErrors.push('thiếu trường bắt buộc "number" (số nguyên 1–9999)');
    } else if (!Number.isInteger(seat.number) || seat.number < 1 || seat.number > 9999) {
      seatErrors.push('"number" là số nguyên 1–9999');
    }

    // AC1: Kiểm tra trường category
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

    // AC2: Kiểm tra ghế trùng hàng và số
    if (positions.has(key)) {
      const prevIndex = positions.get(key);
      errors.push(`${label}: trùng ghế ${row}${seat.number} với ghế #${prevIndex + 1}.`);
      continue;
    }

    positions.set(key, i);
    categories.add(category);
    rowsSet.add(row);
    normalized.push({ row, number: seat.number, category });
  }

  if (categories.size > SEAT_MAP_MAX_CATEGORIES) {
    errors.push(`Tệp có ${categories.size} hạng ghế, vượt giới hạn ${SEAT_MAP_MAX_CATEGORIES} hạng.`);
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    normalized: isValid ? normalized : null,
    summary: isValid
      ? {
          totalSeats: normalized.length,
          totalRows: rowsSet.size,
          rows: Array.from(rowsSet),
          totalCategories: categories.size,
          categories: Array.from(categories),
        }
      : null,
  };
}

module.exports = {
  SEAT_MAP_MAX_SEATS,
  SEAT_MAP_MAX_CATEGORIES,
  SEAT_MAP_MAX_FILE_SIZE_BYTES,
  extractJsonErrorDetails,
  parseJsonWithPosition,
  validateSeatMapStructure,
};
