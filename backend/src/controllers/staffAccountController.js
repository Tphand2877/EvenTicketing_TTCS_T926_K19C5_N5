const { StaffAccountError } = require('../services/staffAccountService');

const MESSAGES = {
  EMAIL_INVALID: 'Email không đúng định dạng.',
  FULL_NAME_REQUIRED: 'Vui lòng nhập họ tên (tối đa 255 ký tự).',
  PASSWORD_TOO_SHORT: 'Mật khẩu phải có từ 8 đến 128 ký tự.',
  ROLE_INVALID: 'Vai trò không hợp lệ.',
  EMAIL_TAKEN: 'Email này đã có tài khoản.',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản.',
  NOTHING_TO_UPDATE: 'Không có thay đổi nào.',
  CANNOT_CHANGE_SELF: 'Không thể tự đổi vai trò hoặc tự khoá tài khoản của chính mình.',
  IS_ACTIVE_INVALID: 'Trạng thái tài khoản không hợp lệ.',
};

const handle = (fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (error) {
    if (error instanceof StaffAccountError) {
      return res.status(error.status).json({ success: false, code: error.code, field: error.field, message: MESSAGES[error.code] });
    }
    console.error('[StaffAccounts] Request failed.');
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
};

const createStaffAccountController = ({ service }) => ({
  listRoles: handle(async (_req, res) => res.json({ success: true, data: { roles: await service.listRoles() } })),

  listUsers: handle(async (req, res) => {
    const { role, q, page } = req.query;
    return res.json({ success: true, data: await service.listUsers({ role, q, page }) });
  }),

  createUser: handle(async (req, res) => {
    const { email, fullName, password, role } = req.body || {};
    const user = await service.createUser({ adminId: req.user.userId, email, fullName, password, role });
    return res.status(201).json({ success: true, message: 'Đã tạo tài khoản.', data: { user } });
  }),

  updateUser: handle(async (req, res) => {
    const { role, isActive, fullName } = req.body || {};
    const user = await service.updateUser({ adminId: req.user.userId, userId: req.params.id, role, isActive, fullName });
    return res.json({ success: true, message: 'Đã cập nhật tài khoản.', data: { user } });
  }),
});

module.exports = { createStaffAccountController };
