/**
 * S-28: Admin User Management Controller
 * Quản trị tạo tài khoản nhân viên, gán vai trò và theo dõi lịch sử kiểm toán
 */

const User = require('../models/User');
const Role = require('../models/Role');
const RoleChangeLog = require('../models/RoleChangeLog');
const { hashPassword } = require('../utils/passwordHash');

const ALLOWED_STAFF_ROLES = ['ticket_checker', 'accountant', 'organizer', 'admin'];

/**
 * GET /api/admin/users
 * Lấy danh sách người dùng kèm vai trò, hỗ trợ tìm kiếm, lọc và phân trang
 */
const listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').trim();
    const role = (req.query.role || '').trim();
    const status = (req.query.status || '').trim();

    const [users, total] = await Promise.all([
      User.listAll({ page, limit, search, role, status }),
      User.countAll({ search, role, status }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error('[AdminUserController.listUsers] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách người dùng.',
    });
  }
};

/**
 * GET /api/admin/roles
 * Lấy danh sách các vai trò có trong hệ thống
 */
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll();
    return res.status(200).json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error('[AdminUserController.getRoles] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách vai trò.',
    });
  }
};

/**
 * POST /api/admin/users
 * Quản trị viên tạo tài khoản nhân viên (soát vé, kế toán, ban tổ chức)
 */
const createStaffUser = async (req, res) => {
  try {
    const { email, password, full_name, role } = req.body;

    // 1. Kiểm tra đầu vào bắt buộc
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự.',
      });
    }

    if (!role || !ALLOWED_STAFF_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Vai trò không hợp lệ. Cho phép: ${ALLOWED_STAFF_ROLES.join(', ')}.`,
      });
    }

    // 2. Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findByEmail(email.trim().toLowerCase());
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email này đã được sử dụng trong hệ thống.',
      });
    }

    // 3. Tìm role ID từ DB
    const roleRecord = await Role.findByName(role);
    if (!roleRecord) {
      return res.status(400).json({
        success: false,
        message: `Không tìm thấy vai trò '${role}' trong cơ sở dữ liệu.`,
      });
    }

    // 4. Băm mật khẩu bằng Argon2id (NFR-3)
    const passwordHash = await hashPassword(password);

    // 5. Tạo user với trạng thái kích hoạt ngay (is_active = true) do admin trực tiếp cấp
    const insertResult = await User.create({
      email: email.trim().toLowerCase(),
      password_hash: passwordHash,
      full_name: (full_name || '').trim() || null,
      role_id: roleRecord.id,
      is_active: true,
      activation_token: null,
      activation_token_expires_at: null,
      deactivated_at: null,
    });

    const newUserId = typeof insertResult === 'object' && insertResult[0] ? (insertResult[0].id || insertResult[0]) : insertResult;

    // 6. Ghi nhật ký kiểm toán (NFR-1)
    try {
      await RoleChangeLog.create({
        actor_id: req.user?.userId || null,
        target_user_id: newUserId,
        old_role: null,
        new_role: roleRecord.name,
        action: 'CREATE_STAFF',
        reason: `Quản trị viên tạo tài khoản nhân viên vai trò ${roleRecord.name}`,
        ip_address: req.ip || req.headers['x-forwarded-for'] || null,
      });
    } catch (logErr) {
      console.warn('[AdminUserController.createStaffUser] Warning logging audit:', logErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Tạo tài khoản ${roleRecord.name} thành công.`,
      data: {
        id: newUserId,
        email: email.trim().toLowerCase(),
        fullName: (full_name || '').trim() || null,
        role: roleRecord.name,
        isActive: true,
      },
    });
  } catch (error) {
    console.error('[AdminUserController.createStaffUser] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi tạo tài khoản nhân viên.',
    });
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Thay đổi vai trò người dùng (S-28 AC2 & NFR-1)
 */
const updateUserRole = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { role, reason } = req.body;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID người dùng không hợp lệ.',
      });
    }

    if (!role || typeof role !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Vai trò mới là bắt buộc.',
      });
    }

    // 1. Kiểm tra tài khoản đích
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng.',
      });
    }

    // 2. Kiểm tra vai trò đích
    const targetRole = await Role.findByName(role.trim().toLowerCase());
    if (!targetRole) {
      return res.status(400).json({
        success: false,
        message: `Vai trò '${role}' không tồn tại.`,
      });
    }

    if (targetUser.role === targetRole.name) {
      return res.status(200).json({
        success: true,
        message: 'Người dùng đã có vai trò này.',
        data: { id: targetUser.id, role: targetUser.role },
      });
    }

    // 3. NFR-5: Phòng vệ không cho phép tự hạ quyền admin của chính mình nếu là admin duy nhất
    if (targetUser.role === 'admin' && targetRole.name !== 'admin') {
      const activeAdmins = await User.countActiveAdmins();
      if (activeAdmins <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Không thể hạ quyền Admin duy nhất đang hoạt động của hệ thống.',
        });
      }
    }

    // 4. Cập nhật role_id trong DB
    await User.updateById(targetUser.id, { role_id: targetRole.id });

    // 5. Ghi nhật ký kiểm toán (NFR-1)
    try {
      await RoleChangeLog.create({
        actor_id: req.user?.userId || null,
        target_user_id: targetUser.id,
        old_role: targetUser.role,
        new_role: targetRole.name,
        action: 'ROLE_CHANGE',
        reason: (reason || '').trim() || `Đổi vai trò từ ${targetUser.role} sang ${targetRole.name}`,
        ip_address: req.ip || req.headers['x-forwarded-for'] || null,
      });
    } catch (logErr) {
      console.warn('[AdminUserController.updateUserRole] Warning logging audit:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Đã đổi vai trò người dùng thành '${targetRole.name}'. Quyền mới có hiệu lực ngay lập tức.`,
      data: {
        id: targetUser.id,
        email: targetUser.email,
        oldRole: targetUser.role,
        newRole: targetRole.name,
      },
    });
  } catch (error) {
    console.error('[AdminUserController.updateUserRole] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi cập nhật vai trò.',
    });
  }
};

/**
 * PATCH /api/admin/users/:id/status
 * Kích hoạt hoặc vô hiệu hóa tài khoản (S-28 AC3)
 */
const toggleUserStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { is_active, reason } = req.body;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID người dùng không hợp lệ.',
      });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Trường is_active phải là true hoặc false.',
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng.',
      });
    }

    // NFR-5: Không cho phép tự vô hiệu hóa tài khoản của chính mình
    if (!is_active && req.user?.userId === targetUser.id) {
      return res.status(400).json({
        success: false,
        message: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình.',
      });
    }

    // Nếu vô hiệu hóa admin, kiểm tra số admin còn lại
    if (!is_active && targetUser.role === 'admin') {
      const activeAdmins = await User.countActiveAdmins();
      if (activeAdmins <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Không thể vô hiệu hóa Admin duy nhất của hệ thống.',
        });
      }
    }

    const updatePayload = is_active
      ? { is_active: true, deactivated_at: null, deactivated_by: null }
      : { is_active: false, deactivated_at: new Date(), deactivated_by: req.user?.userId || null };

    await User.updateById(targetUser.id, updatePayload);

    // Ghi nhật ký kiểm toán (NFR-1)
    try {
      await RoleChangeLog.create({
        actor_id: req.user?.userId || null,
        target_user_id: targetUser.id,
        old_role: targetUser.role,
        new_role: targetUser.role,
        action: is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
        reason: (reason || '').trim() || (is_active ? 'Quản trị viên kích hoạt lại tài khoản' : 'Quản trị viên vô hiệu hóa tài khoản'),
        ip_address: req.ip || req.headers['x-forwarded-for'] || null,
      });
    } catch (logErr) {
      console.warn('[AdminUserController.toggleUserStatus] Warning logging audit:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: is_active
        ? 'Tài khoản đã được kích hoạt thành công.'
        : 'Tài khoản đã bị vô hiệu hóa. Người dùng sẽ bị chặn đăng nhập và từ chối truy cập.',
      data: {
        id: targetUser.id,
        email: targetUser.email,
        isActive: is_active,
        deactivatedAt: is_active ? null : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[AdminUserController.toggleUserStatus] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi thay đổi trạng thái tài khoản.',
    });
  }
};

/**
 * GET /api/admin/role-change-logs
 * Lấy lịch sử thay đổi vai trò và trạng thái kiểm toán
 */
const getRoleChangeLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      RoleChangeLog.list({ limit, offset }),
      RoleChangeLog.count(),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error('[AdminUserController.getRoleChangeLogs] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải nhật ký thay đổi vai trò.',
    });
  }
};

module.exports = {
  listUsers,
  getRoles,
  createStaffUser,
  updateUserRole,
  toggleUserStatus,
  getRoleChangeLogs,
};
