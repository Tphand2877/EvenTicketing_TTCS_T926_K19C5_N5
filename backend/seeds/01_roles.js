/**
 * SCRUM-73 [S-02 (T-04)] - Seed dữ liệu roles mặc định
 */

exports.seed = async function (knex) {
  // Xóa dữ liệu cũ (đúng thứ tự để tránh lỗi FK)
  await knex('users').del();
  await knex('roles').del();

  // Reset sequence (PostgreSQL)
  await knex.raw('ALTER SEQUENCE roles_id_seq RESTART WITH 1');

  // Insert roles mặc định (staff, supervisor: S-28)
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
    {
      id: 4,
      name: 'staff',
      description: 'Nhân viên soát vé - quét QR tại cổng',
    },
    {
      id: 5,
      name: 'supervisor',
      description: 'Trưởng ca soát vé - quét QR và cho vào có ghi chú',
    },
  ]);
  await knex.raw('ALTER SEQUENCE roles_id_seq RESTART WITH 6');
};
