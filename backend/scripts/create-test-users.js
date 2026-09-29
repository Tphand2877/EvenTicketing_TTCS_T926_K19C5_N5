/**
 * Script DEV: tạo nhanh user thử nghiệm để test đăng nhập trên localhost.
 * Chạy: node scripts/create-test-users.js
 * (Không cần commit file này lên GitHub.)
 *
 * SCRUM-72 T-09: dùng Argon2id thay vì bcrypt để hash mật khẩu cho user mới.
 */
require('dotenv').config();
const { hashPassword } = require('../src/utils/passwordHash');
const knexLib = require('knex');
const config = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const knex = knexLib(config[env]);

const PASSWORD = '123456';

const users = [
  { email: 'admin@test.com', full_name: 'Admin', role: 'admin', is_active: true },
  { email: 'organizer@test.com', full_name: 'Organizer', role: 'organizer', is_active: true },
  { email: 'buyer@test.com', full_name: 'Buyer', role: 'buyer', is_active: true },
  { email: 'inactive@test.com', full_name: 'Inactive', role: 'buyer', is_active: false },
];

(async () => {
  try {
    const passwordHash = await hashPassword(PASSWORD);

    for (const u of users) {
      const role = await knex('roles').where({ name: u.role }).first();
      if (!role) {
        throw new Error(`Chưa có role "${u.role}". Hãy chạy: npm run seed`);
      }

      await knex('users')
        .insert({
          email: u.email,
          password_hash: passwordHash,
          full_name: u.full_name,
          role_id: role.id,
          is_active: u.is_active,
          failed_login_attempts: 0,
          locked_until: null,
        })
        .onConflict('email')
        .merge();
    }

    console.log('Đã tạo/cập nhật user thử nghiệm (mật khẩu chung: ' + PASSWORD + '):');
    users.forEach((u) => console.log(` - ${u.email} (${u.role}, is_active=${u.is_active})`));
  } catch (err) {
    console.error('Lỗi:', err.message);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
})();
