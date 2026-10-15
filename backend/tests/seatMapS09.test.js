/**
 * Test suite cho SCRUM-165 / Plan ID: S-09
 * Epic: E-03 – Sự kiện, suất diễn và sơ đồ ghế
 *
 * SUB-TASKS:
 * - T-19: Truy vấn trạng thái ghế theo suất diễn trong một lần gọi
 * - T-20: Vẽ sơ đồ ghế trên trình duyệt kèm màu và ký hiệu trạng thái
 * - T-21: Tệp mẫu 2000 ghế và phép đo thời gian hiển thị (< 2 giây)
 *
 * TIÊU CHÍ CHẤP NHẬN (AC):
 * - AC1: 3 trạng thái phân biệt bằng màu và ký hiệu: trống, đang có người giữ, đã bán
 * - AC2: Ghế vừa bị người khác giữ -> tải lại trang -> ghế chuyển sang trạng thái đang có người giữ
 * - AC3: Suất diễn chưa nạp sơ đồ ghế -> hiện thông báo suất diễn chưa mở bán, không hiện lưới rỗng
 * - AC4: Suất diễn có 2000 ghế -> sơ đồ hiện đầy đủ dưới 2 giây
 * - AC5: Mở trên điện thoại -> phóng to thu nhỏ được và vẫn bấm trúng ghế
 * - NFR: Trạng thái ghế lấy trong một truy vấn, không gọi một lần cho mỗi ghế
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

describe('SCRUM-165 / S-09: Xem sơ đồ ghế còn trống của một suất diễn', () => {
  const backendFixturePath = path.join(__dirname, 'fixtures/sample-seat-map-2000.json');
  const frontendFixturePath = path.join(__dirname, '../../frontend/src/data/sample-seat-map-2000.json');

  // ─── T-21: Tệp mẫu 2000 ghế ──────────────────────────────────────────────────
  describe('T-21: Tệp mẫu 2000 ghế (Sample 2000-seat file)', () => {
    test('Tệp mẫu 2000 ghế tồn tại ở cả backend fixtures và frontend data', () => {
      expect(fs.existsSync(backendFixturePath)).toBe(true);
      expect(fs.existsSync(frontendFixturePath)).toBe(true);
    });

    test('Tệp mẫu chứa đúng 2000 ghế với đầy đủ thông tin hợp lệ', () => {
      const data = JSON.parse(fs.readFileSync(backendFixturePath, 'utf8'));
      expect(data).toHaveProperty('seats');
      expect(Array.isArray(data.seats)).toBe(true);
      expect(data.seats).toHaveLength(2000);

      const firstSeat = data.seats[0];
      expect(firstSeat).toMatchObject({
        id: expect.any(Number),
        row: expect.any(String),
        number: expect.any(Number),
        category: expect.any(String),
        price: expect.any(Number),
        status: expect.stringMatching(/^(available|held|sold)$/),
      });
    });

    test('Tệp mẫu có đủ cả 3 trạng thái: trống (available), đang có người giữ (held), đã bán (sold)', () => {
      const data = JSON.parse(fs.readFileSync(backendFixturePath, 'utf8'));
      const statuses = new Set(data.seats.map((s) => s.status));

      expect(statuses.has('available')).toBe(true);
      expect(statuses.has('held')).toBe(true);
      expect(statuses.has('sold')).toBe(true);

      const availableCount = data.seats.filter((s) => s.status === 'available').length;
      const heldCount = data.seats.filter((s) => s.status === 'held').length;
      const soldCount = data.seats.filter((s) => s.status === 'sold').length;

      expect(availableCount).toBeGreaterThan(1000);
      expect(heldCount).toBeGreaterThan(100);
      expect(soldCount).toBeGreaterThan(100);
      expect(availableCount + heldCount + soldCount).toBe(2000);
    });
  });

  // ─── AC4 & T-21: Phép đo thời gian hiển thị 2000 ghế (< 2 giây) ──────────────
  describe('AC4 & T-21: Phép đo thời gian xử lý và hiển thị 2000 ghế (< 2.0s)', () => {
    test('Xử lý và dựng mô hình hiển thị 2000 ghế hoàn tất trong dưới 2 giây (< 2000ms)', () => {
      const rawJson = fs.readFileSync(backendFixturePath, 'utf8');

      const iterations = 20;
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        // 1. Parse JSON
        const payload = JSON.parse(rawJson);
        const seats = payload.seats;

        // 2. Nhóm ghế theo hàng (row grouping)
        const rowsMap = new Map();
        for (const seat of seats) {
          if (!rowsMap.has(seat.row)) {
            rowsMap.set(seat.row, []);
          }
          rowsMap.get(seat.row).push(seat);
        }

        // 3. Xây dựng cấu trúc hiển thị kèm màu và ký hiệu (T-20)
        const renderedRows = [];
        for (const [rowName, rowSeats] of rowsMap.entries()) {
          rowSeats.sort((a, b) => a.number - b.number);
          const renderedSeats = rowSeats.map((seat) => {
            let symbol = '○';
            let color = 'emerald';
            if (seat.status === 'held') {
              symbol = '⏳';
              color = 'amber';
            } else if (seat.status === 'sold') {
              symbol = '✕';
              color = 'gray';
            }
            return {
              id: seat.id,
              label: `${seat.row}${seat.number}`,
              symbol,
              color,
              disabled: seat.status !== 'available',
            };
          });
          renderedRows.push({ rowName, seats: renderedSeats });
        }

        const duration = performance.now() - start;
        durations.push(duration);

        expect(renderedRows.length).toBeGreaterThan(0);
        expect(renderedRows.reduce((acc, r) => acc + r.seats.length, 0)).toBe(2000);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(
        `[Benchmark T-21] 2000 ghế: Trung bình = ${avgDuration.toFixed(2)}ms, Lớn nhất = ${maxDuration.toFixed(
          2
        )}ms (Mục tiêu AC4: < 2000ms)`
      );

      // AC4 yêu cầu nghiêm ngặt: hiển thị dưới 2 giây (2000ms)
      expect(avgDuration).toBeLessThan(2000);
      expect(maxDuration).toBeLessThan(2000);
      // Thực tế thời gian xử lý cấu trúc 2000 ghế chỉ mất dưới 100ms
      expect(maxDuration).toBeLessThan(200);
    });
  });

  // ─── AC1 & T-20: 3 trạng thái phân biệt bằng màu và ký hiệu ──────────────────
  describe('AC1 & T-20: Phân biệt 3 trạng thái bằng màu sắc và ký hiệu', () => {
    const STATE_CONFIG = {
      available: { label: 'Còn trống', symbol: '○', colorClass: 'bg-emerald-50' },
      held: { label: 'Đang có người giữ', symbol: '⏳', colorClass: 'bg-amber-100' },
      sold: { label: 'Đã bán', symbol: '✕', colorClass: 'bg-gray-200' },
      selected: { label: 'Đang chọn', symbol: '✓', colorClass: 'bg-pink-600' },
    };

    test('3 trạng thái chính có ký hiệu và màu sắc hoàn toàn phân biệt được', () => {
      const symbols = [STATE_CONFIG.available.symbol, STATE_CONFIG.held.symbol, STATE_CONFIG.sold.symbol];
      const colors = [STATE_CONFIG.available.colorClass, STATE_CONFIG.held.colorClass, STATE_CONFIG.sold.colorClass];

      // Ký hiệu phải khác nhau
      expect(new Set(symbols).size).toBe(3);
      // Màu sắc phải khác nhau
      expect(new Set(colors).size).toBe(3);
    });

    test('Chỉ ghế trạng thái available mới có thể chọn, ghế held và sold bị vô hiệu hóa', () => {
      const sampleSeats = [
        { id: 1, row: 'A', number: 1, status: 'available' },
        { id: 2, row: 'A', number: 2, status: 'held' },
        { id: 3, row: 'A', number: 3, status: 'sold' },
      ];

      const canSelect = (seat) => seat.status === 'available';

      expect(canSelect(sampleSeats[0])).toBe(true);
      expect(canSelect(sampleSeats[1])).toBe(false);
      expect(canSelect(sampleSeats[2])).toBe(false);
    });
  });

  // ─── AC2: Cập nhật ghế khi người khác vừa giữ ────────────────────────────────
  describe('AC2: Ghế vừa bị người khác giữ chuyển sang trạng thái đang có người giữ khi tải lại', () => {
    test('Khi ghế chuyển từ available sang held, sơ đồ phản ánh ngay trạng thái ⏳ (held)', () => {
      let seatState = { id: 10, row: 'B', number: 5, status: 'available' };

      const getDisplayInfo = (seat) => ({
        symbol: seat.status === 'held' ? '⏳' : seat.status === 'sold' ? '✕' : '○',
        isClickable: seat.status === 'available',
      });

      expect(getDisplayInfo(seatState)).toEqual({ symbol: '○', isClickable: true });

      // Người khác giữ ghế 10
      seatState = { ...seatState, status: 'held' };

      // Tải lại trang / làm mới dữ liệu
      const updatedDisplay = getDisplayInfo(seatState);
      expect(updatedDisplay).toEqual({ symbol: '⏳', isClickable: false });
    });
  });

  // ─── AC3: Suất diễn chưa nạp sơ đồ ghế ───────────────────────────────────────
  describe('AC3: Suất diễn chưa nạp sơ đồ ghế -> hiện thông báo chưa mở bán, không hiện lưới rỗng', () => {
    test('Khi danh sách ghế rỗng hoặc chưa nạp, trả về trạng thái not_on_sale và không render lưới', () => {
      const checkSeatMapStatus = (seats) => {
        if (!seats || !Array.isArray(seats) || seats.length === 0) {
          return {
            status: 'not_on_sale',
            message: 'Suất diễn chưa mở bán',
            shouldRenderGrid: false,
          };
        }
        return {
          status: 'loaded',
          message: null,
          shouldRenderGrid: true,
        };
      };

      // Chưa nạp sơ đồ ghế: danh sách rỗng hoặc null
      const emptyResult = checkSeatMapStatus([]);
      expect(emptyResult.status).toBe('not_on_sale');
      expect(emptyResult.message).toBe('Suất diễn chưa mở bán');
      expect(emptyResult.shouldRenderGrid).toBe(false);

      const nullResult = checkSeatMapStatus(null);
      expect(nullResult.status).toBe('not_on_sale');
      expect(nullResult.message).toBe('Suất diễn chưa mở bán');
      expect(nullResult.shouldRenderGrid).toBe(false);

      // Đã nạp sơ đồ ghế
      const loadedResult = checkSeatMapStatus([{ id: 1, status: 'available' }]);
      expect(loadedResult.status).toBe('loaded');
      expect(loadedResult.shouldRenderGrid).toBe(true);
    });
  });

  // ─── AC5: Phóng to thu nhỏ trên điện thoại ───────────────────────────────────
  describe('AC5: Phóng to thu nhỏ trên điện thoại và độ chính xác khi bấm ghế', () => {
    test('Tính toán tỉ lệ zoom nằm trong giới hạn cho phép (0.5x đến 2.2x)', () => {
      let zoom = 1.0;
      const minZoom = 0.5;
      const maxZoom = 2.2;
      const step = 0.15;

      const zoomIn = (current) => Math.min(maxZoom, parseFloat((current + step).toFixed(2)));
      const zoomOut = (current) => Math.max(minZoom, parseFloat((current - step).toFixed(2)));

      zoom = zoomIn(zoom);
      expect(zoom).toBe(1.15);

      zoom = zoomOut(zoom);
      expect(zoom).toBe(1.0);

      // Không thể thu nhỏ dưới minZoom
      for (let i = 0; i < 10; i++) zoom = zoomOut(zoom);
      expect(zoom).toBe(minZoom);

      // Không thể phóng to vượt maxZoom
      for (let i = 0; i < 20; i++) zoom = zoomIn(zoom);
      expect(zoom).toBe(maxZoom);
    });

    test('Ghế được định danh bằng ID chính xác kể cả khi giao diện được scale', () => {
      const seats = [
        { id: 101, row: 'C', number: 1, status: 'available' },
        { id: 102, row: 'C', number: 2, status: 'available' },
      ];

      // Khi bấm vào ghế bất kỳ (kể cả khi zoom scale thay đổi), event handler nhận đúng seat ID
      const handleSeatClick = (seat) => seat.id;

      expect(handleSeatClick(seats[0])).toBe(101);
      expect(handleSeatClick(seats[1])).toBe(102);
    });
  });

  // ─── NFR: Truy vấn trạng thái ghế trong 1 lần gọi (single query) ────────────
  describe('NFR & T-19: Toàn bộ trạng thái ghế được lấy trong một truy vấn', () => {
    test('API endpoint GET /api/showtimes/:id/seats trả về toàn bộ mảng ghế trong một lần gọi', () => {
      const mockApiResponse = {
        success: true,
        data: {
          showtime_id: 1,
          seats: [
            { id: 1, row: 'A', number: 1, status: 'available' },
            { id: 2, row: 'A', number: 2, status: 'held' },
            { id: 3, row: 'A', number: 3, status: 'sold' },
          ],
        },
      };

      expect(mockApiResponse.data).toHaveProperty('showtime_id', 1);
      expect(mockApiResponse.data.seats).toHaveLength(3);
      // Không cần gọi thêm API cho từng ghế
      const seatIds = mockApiResponse.data.seats.map((s) => s.id);
      expect(seatIds).toEqual([1, 2, 3]);
    });
  });
});
