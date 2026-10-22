/**
 * Kiểm AC thanh toán trên BẢN CHẠY THẬT: khởi động `node src/server.js`, dùng PostgreSQL và Redis thật,
 * gửi request HTTP thật (IPN MoMo ký bằng khoá thử). Dùng cho nghiệm thu S-20, S-21, S-22, S-23, S-24.
 *
 * Chỉ chạy trên database TRỐNG dùng một lần, vì script chạy migrations và tạo dữ liệu mẫu:
 *   AC_DISPOSABLE_DB=1 DB_HOST=... DB_PORT=... DB_NAME=<db trống> DB_USER=... DB_PASSWORD=... \
 *   REDIS_URL=redis://localhost:6379 npm run verify:payment-ac
 */
const path = require('path');
const B = path.join(__dirname, '..');
const crypto = require('crypto');
const { spawn } = require('child_process');
const knex = require('knex');
const jwt = require('jsonwebtoken');
const { createWebhookSignatureData, sign } = require(B + '/src/payments/adapters/MoMoGateway');
const env = { ...process.env, PORT: '3996', NODE_ENV: 'development', JWT_SECRET: 'ac-secret', PAYMENT_PROVIDER: 'momo',
  MOMO_PARTNER_CODE: 'ACTEST', MOMO_ACCESS_KEY: 'ac-access', MOMO_SECRET_KEY: 'ac-secret-key',
  MOMO_REDIRECT_URL: 'http://localhost:8080/payment/return', MOMO_IPN_URL: 'http://localhost:3996/api/payments/webhook',
  ORDER_EXPIRY_CLEANUP_INTERVAL_MS: '1000' };
const db = knex({ client: 'pg', connection: { host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD } });
const BASE = 'http://localhost:3996';
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  | ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ipn = (orderId, amount, transId, resultCode = 0) => {
  const p = { partnerCode: env.MOMO_PARTNER_CODE, orderId, requestId: orderId, amount, orderInfo: 'Ve', orderType: 'momo_wallet',
    transId, resultCode, message: resultCode ? 'Failed' : 'Successful.', payType: 'qr', responseTime: Date.now(), extraData: '' };
  p.signature = sign(env.MOMO_SECRET_KEY, createWebhookSignatureData(p, env.MOMO_ACCESS_KEY));
  return JSON.stringify(p);
};
const post = (body, headers = {}) => fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
const order = (id) => db('orders').where({ id }).first();
const live = (id) => db('order_items').where({ order_id: id }).whereNull('released_at').count({ n: '*' }).first().then((r) => Number(r.n));
let seat = 0;
const mkOrder = async (userId, n, { expiresIn = '1 hour' } = {}) => {
  const id = crypto.randomUUID();
  const expires = db.raw(`clock_timestamp() + interval '${expiresIn}'`);
  await db('orders').insert({ id, user_id: userId, status: 'pending', total_amount: n * 100000, currency: 'VND', expires_at: expires,
    gateway_provider: 'momo', gateway_request_id: id, payment_request_status: 'ready', payment_url: 'https://test-payment.momo.vn/v2/gateway/pay?t=ac',
    payment_request_started_at: db.fn.now() });
  const seats = Array.from({ length: n }, () => ++seat);
  await db('order_items').insert(seats.map((s) => ({ order_id: id, seat_id: s, category_name: 'Standard', unit_price: 100000 })));
  await db('seat_holds').insert({ id: crypto.randomUUID(), order_id: id, user_id: userId, showtime_id: 1, quantity: n, status: 'pending_payment', expires_at: expires });
  return id;
};

if (process.env.AC_DISPOSABLE_DB !== '1') {
  console.error('Đặt AC_DISPOSABLE_DB=1 và trỏ DB_NAME tới một database trống dùng một lần.');
  process.exit(2);
}

(async () => {
  await db.migrate.latest({ directory: path.join(B, 'src/migrations') });
  if (Number((await db('orders').count({ n: '*' }).first()).n) > 0) throw new Error('Database không trống, dừng để tránh ghi đè dữ liệu.');
  await db('roles').insert({ id: 9, name: 'buyer' }).onConflict('name').ignore();
  const role = await db('roles').where({ name: 'buyer' }).first();
  await db('users').insert([1, 2].map((id) => ({ id, email: `ac${id}@x`, password_hash: 'x', role_id: role.id })));
  await db('events').insert({ id: 1, organizer_id: 1, title: 'AC', venue: 'V', status: 'published' });
  await db('showtimes').insert({ id: 1, event_id: 1, starts_at: '2099-01-01', capacity: 40, price: 100000, status: 'on_sale' });
  await db('seat_categories').insert({ id: 1, showtime_id: 1, name: 'Standard' });
  await db('seats').insert(Array.from({ length: 40 }, (_, i) => ({ id: i + 1, showtime_id: 1, category_id: 1, row_label: 'A', seat_number: i + 1 })));

  const server = spawn(process.execPath, [path.join(B, 'src/server.js')], { cwd: B, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i += 1) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* starting */ } await wait(200); }
  const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ userId: id, role: 'buyer' }, env.JWT_SECRET)}` });

  // S-20: replay
  const a = await mkOrder(1, 3);
  const seq = []; for (let i = 0; i < 5; i += 1) seq.push((await post(ipn(a, 300000, 9100001))).status);
  const par = (await Promise.all(Array.from({ length: 5 }, () => post(ipn(a, 300000, 9100001))))).map((r) => r.status);
  const receipts = Number((await db('payment_events').where({ order_id: a }).count({ n: '*' }).first()).n);
  check('S-20/AC1', 'Gửi lại cùng IPN 5 lần tuần tự + 5 song song: 1 biên nhận, đơn paid, 3 vé',
    [...seq, ...par].every((s) => s === 200) && receipts === 1 && (await order(a)).status === 'paid' && (await live(a)) === 3,
    `HTTP ${[...seq, ...par].join(',')}; biên nhận=${receipts}; trạng thái=${(await order(a)).status}; vé=${await live(a)}`);

  // S-22 (server side): buyer reads server-confirmed state
  const st = await fetch(`${BASE}/api/payments/orders/${a}`, { headers: auth(1) });
  const stBody = await st.json();
  check('S-22/BE', 'Người mua đọc trạng thái đơn từ server sau webhook', st.status === 200 && JSON.stringify(stBody).includes('paid'), `HTTP ${st.status} ${JSON.stringify(stBody).slice(0, 120)}`);
  const other = await fetch(`${BASE}/api/payments/orders/${a}`, { headers: auth(2) });
  check('S-22/BE', 'Người khác không xem được đơn', [403, 404].includes(other.status), `HTTP ${other.status}`);
  

  // S-24: failed payment keeps order pending
  const f = await mkOrder(1, 2);
  const fs = []; for (let i = 0; i < 3; i += 1) fs.push((await post(ipn(f, 200000, 9200001 + i, 1006))).status);
  const fo = await order(f);
  const fHold = await db('seat_holds').where({ order_id: f }).first();
  check('S-24/AC1', '3 IPN thất bại: đơn vẫn pending, giữ nguyên ghế và lượt giữ',
    fs.every((s) => s === 200) && fo.status === 'pending' && (await live(f)) === 2 && !!fHold,
    `HTTP ${fs.join(',')}; trạng thái=${fo.status}; gateway_result=${fo.gateway_result_status}; mã lỗi=${fo.payment_error_code}; ghế=${await live(f)}; hold=${fHold ? 'còn' : 'mất'}`);
  const retry = await post(ipn(f, 200000, 9200099));
  check('S-24/AC2', 'Sau khi thất bại, trả lại thành công vẫn được: đơn paid', retry.status === 200 && (await order(f)).status === 'paid', `HTTP ${retry.status}; trạng thái=${(await order(f)).status}`);

  // S-21 on main: bad signature rejected + logged
  const before = Number((await db('audit_logs').count({ n: '*' }).first()).n);
  const bad = await post(JSON.stringify({ ...JSON.parse(ipn(a, 300000, 9100001)), signature: 'f'.repeat(64) }));
  await wait(300);
  const rows = await db('audit_logs').orderBy('id', 'desc').limit(1);
  check('S-21/main', 'IPN sai chữ ký bị từ chối và ghi log', bad.status === 401 && Number((await db('audit_logs').count({ n: '*' }).first()).n) > before,
    `HTTP ${bad.status}; log: ip=${rows[0]?.ip_address} endpoint=${rows[0]?.endpoint}`);

  // S-23: job inside the running server expires overdue order; paid order untouched; late success goes to review
  await db('orders').where({ id: a }).update({ expires_at: db.raw("clock_timestamp() - interval '1 hour'") });
  const paidBefore = await order(a);
  const o = await mkOrder(2, 2, { expiresIn: '2 seconds' });
  const fut = await mkOrder(2, 1);
  await wait(4500); // job runs every 1s in the server process
  const oo = await order(o);
  check('S-23/AC1', 'Job trong server tự hết hạn đơn quá hạn và nhả ghế', oo.status === 'expired' && (await live(o)) === 0
    && !(await db('seat_holds').where({ order_id: o }).first()), `trạng thái=${oo.status}; ghế còn=${await live(o)}`);
  const pa = await order(a);
  check('S-23/AC2 (T-53)', 'Đơn đã trả (dù đã qua hạn) không bị job đụng', pa.status === 'paid' && (await live(a)) === 3
    && pa.updated_at.getTime() === paidBefore.updated_at.getTime(), `trạng thái=${pa.status}; vé=${await live(a)}`);
  check('S-23', 'Đơn còn hạn không bị đụng', (await order(fut)).status === 'pending' && (await live(fut)) === 1);
  const late = await post(ipn(o, 200000, 9300001));
  const lo = await order(o);
  check('S-23/AC3', 'Tiền về sau khi đơn đã hết hạn: không cấp lại ghế, đưa vào đối soát', late.status === 200 && (await live(o)) === 0 && lo.status !== 'paid',
    `HTTP ${late.status}; trạng thái=${lo.status}; mã=${lo.payment_error_code}; receipt=${(await db('payment_events').where({ order_id: o }).first())?.outcome}`);
  console.log('job log:', (log.match(/\[OrderExpiryCleanup\][^\n]*/g) || []).slice(0, 3).join(' | '));

  server.kill('SIGTERM'); await wait(500); await db.destroy();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\nTổng: ${pass}/${results.length} pass`);
  process.exitCode = pass === results.length ? 0 : 1;
})().catch(async (e) => { console.error('CRASH', e.message); process.exit(1); });
