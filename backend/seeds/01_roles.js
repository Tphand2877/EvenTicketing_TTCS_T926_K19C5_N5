/**
 * SCRUM-73 [S-02 (T-04)] - Seed dữ liệu roles mặc định
 */

exports.seed = async function (knex) {
  // Xóa dữ liệu cũ (đúng thứ tự để tránh lỗi FK)
  await knex('users').del();
  await knex('roles').del();

  // Reset sequence (PostgreSQL)
  await knex.raw('ALTER SEQUENCE roles_id_seq RESTART WITH 1');

  // Insert 3 roles mặc định
  await knex('roles').insert([
    {
      id: 1,
      name: 'admin',
      description: 'Quản trị viên hệ thống - toàn quyền truy cập',
    },
    {
      id: 2,
      name: 'organizer',
      description: 'Ban tổ chức - quản lý sự kiện và suất diễn',
    },
    {
      id: 3,
      name: 'buyer',
      description: 'Người mua - đặt vé và xem sự kiện',
    },
  ]);
};
