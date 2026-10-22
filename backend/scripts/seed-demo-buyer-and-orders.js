require('dotenv').config();
const crypto = require('crypto');
const knexLib = require('knex');
const config = require('../knexfile');
const { hashPassword } = require('../src/utils/passwordHash');

const env = process.env.NODE_ENV || 'development';
const knex = knexLib(config[env]);

async function seed() {
  console.log('--- SEEDING DEMO BUYER AND ORDERS ---');

  // 1. Cập nhật giá hạng vé cho tất cả seat_categories chưa có giá
  await knex('seat_categories').where('name', 'VIP').update({ price: 500000 });
  await knex('seat_categories').where('name', 'Thường').update({ price: 300000 });
  console.log('Đã cập nhật giá cho các hạng vé VIP (500k) và Thường (300k).');

  // 2. Cập nhật stage_map_url cho các sự kiện demo
  await knex('events').update({ stage_map_url: '/images/sample-stage-map.png' });
  console.log('Đã gán ảnh sơ đồ khán đài mẫu (/images/sample-stage-map.png) cho các sự kiện.');

  // 3. Tạo tài khoản buyer_demo@test.com
  const buyerRole = await knex('roles').where({ name: 'buyer' }).first();
  if (!buyerRole) throw new Error('Không tìm thấy role buyer');

  const passwordHash = await hashPassword('123456');

  // Xóa dữ liệu cũ của buyer_demo nếu đã tồn tại để seed sạch
  const existingUser = await knex('users').where({ email: 'buyer_demo@test.com' }).first();
  let userId;
  if (existingUser) {
    userId = existingUser.id;
    await knex('users').where({ id: userId }).update({
      password_hash: passwordHash,
      full_name: 'Nguyễn Văn Demo',
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
    });
  } else {
    const [inserted] = await knex('users').insert({
      email: 'buyer_demo@test.com',
      password_hash: passwordHash,
      full_name: 'Nguyễn Văn Demo',
      role_id: buyerRole.id,
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
    }).returning('*');
    userId = inserted.id;
  }
  console.log(`Đã tạo/cập nhật tài khoản: buyer_demo@test.com (ID: ${userId})`);

  // Xóa đơn hàng và vé cũ của userId để nạp mới
  const oldOrders = await knex('orders').where({ user_id: userId }).pluck('id');
  if (oldOrders.length > 0) {
    await knex('tickets').whereIn('order_id', oldOrders).del();
    await knex('order_items').whereIn('order_id', oldOrders).del();
    await knex('orders').whereIn('id', oldOrders).del();
  }

  // Lấy các suất diễn và ghế
  const showtime1 = await knex('showtimes').where({ id: 15 }).first();
  const showtime2 = await knex('showtimes').where({ id: 17 }).first();

  if (!showtime1 || !showtime2) {
    console.log('Không tìm thấy showtime 15 hoặc 17.');
    return;
  }

  const seats1 = await knex('seats').where({ showtime_id: 15 }).orderBy('id', 'asc').limit(2);
  const seats2 = await knex('seats').where({ showtime_id: 17 }).orderBy('id', 'asc').limit(1);

  // Đơn 1: Paid (2 ghế VIP)
  const orderId1 = crypto.randomUUID();
  const now = new Date();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);

  await knex('orders').insert({
    id: orderId1,
    user_id: userId,
    status: 'paid',
    total_amount: 1000000,
    currency: 'VND',
    expires_at: new Date(twoDaysAgo.getTime() + 15 * 60 * 1000),
    gateway_provider: 'momo',
    gateway_request_id: orderId1,
    gateway_transaction_id: 'MOMO_TRANS_9988112233',
    gateway_result_status: 'succeeded',
    created_at: twoDaysAgo,
    updated_at: twoDaysAgo,
  });

  for (const s of seats1) {
    const [item] = await knex('order_items').insert({
      order_id: orderId1,
      seat_id: s.id,
      category_name: 'VIP',
      unit_price: 500000,
      created_at: twoDaysAgo,
    }).returning('*');

    const ticketId = crypto.randomUUID();
    await knex('tickets').insert({
      id: ticketId,
      order_id: orderId1,
      order_item_id: item.id,
      seat_id: s.id,
      showtime_id: 15,
      user_id: userId,
      status: 'valid',
      issued_at: twoDaysAgo,
    });
  }

  // Đơn 2: Paid (1 ghế Thường)
  const orderId2 = crypto.randomUUID();
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 3600 * 1000);

  await knex('orders').insert({
    id: orderId2,
    user_id: userId,
    status: 'paid',
    total_amount: 300000,
    currency: 'VND',
    expires_at: new Date(oneDayAgo.getTime() + 15 * 60 * 1000),
    gateway_provider: 'mock',
    gateway_request_id: orderId2,
    gateway_transaction_id: 'MOCK_TRANS_77441188',
    gateway_result_status: 'succeeded',
    created_at: oneDayAgo,
    updated_at: oneDayAgo,
  });

  for (const s of seats2) {
    const [item] = await knex('order_items').insert({
      order_id: orderId2,
      seat_id: s.id,
      category_name: 'Thường',
      unit_price: 300000,
      created_at: oneDayAgo,
    }).returning('*');

    const ticketId = crypto.randomUUID();
    await knex('tickets').insert({
      id: ticketId,
      order_id: orderId2,
      order_item_id: item.id,
      seat_id: s.id,
      showtime_id: 17,
      user_id: userId,
      status: 'valid',
      issued_at: oneDayAgo,
    });
  }

  // Đơn 3: Pending (Chờ thanh toán)
  const orderId3 = crypto.randomUUID();
  await knex('orders').insert({
    id: orderId3,
    user_id: userId,
    status: 'pending',
    total_amount: 300000,
    currency: 'VND',
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    gateway_provider: 'mock',
    gateway_request_id: orderId3,
    created_at: now,
    updated_at: now,
  });

  console.log(`Đã nạp thành công 3 đơn hàng mẫu:
  1. Đơn Paid (ID: ${orderId1}) - Hòa nhạc Symphony Mùa Thu 2026 (2 vé VIP, tổng 1.000.000đ)
  2. Đơn Paid (ID: ${orderId2}) - Vietnam Tech Summit 2026 (1 vé Thường, tổng 300.000đ)
  3. Đơn Pending (ID: ${orderId3}) - Đang chờ thanh toán (1 vé Thường, 300.000đ)
  `);
}

seed()
  .catch((e) => {
    console.error('Lỗi seed:', e);
    process.exitCode = 1;
  })
  .finally(() => knex.destroy());
