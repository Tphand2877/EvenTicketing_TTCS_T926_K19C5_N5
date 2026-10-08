const service = require('../services/publicShowtimeService');

const handle = (operation) => async (req, res) => {
  try {
    const data = await operation(req);
    return res.json({ success: true, data, ...(data.on_sale === false ? { message: 'Suất diễn không mở bán.' } : {}) });
  } catch (err) {
    if (err instanceof service.PublicQueryError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (['42P01', '42703'].includes(err.code)) {
      return res.status(503).json({ success: false, message: 'Dữ liệu suất diễn chưa sẵn sàng.' });
    }
    // PostgreSQL errors can contain SQL parameters; return/log no raw error.
    console.error('[PublicShowtimes] Query failed.');
    return res.status(500).json({ success: false, message: 'Không thể tải dữ liệu suất diễn.' });
  }
};
const parseId = (req) => {
  if (!/^[1-9]\d{0,9}$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    throw new service.PublicQueryError(404, 'Không tìm thấy suất diễn.');
  }
  return Number(req.params.id);
};
module.exports = {
  listOnSale: handle((req) => service.list(req.query)),
  getPublicShowtime: handle((req) => service.detail(parseId(req))),
  getSeatMap: handle((req) => service.seats(parseId(req))),
};
