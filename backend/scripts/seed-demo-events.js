/**
 * Script DEMO: tạo sẵn vài sự kiện + suất diễn cho organizer@test.com (SCRUM-80).
 * Chạy SAU create-test-users.js:  node scripts/seed-demo-events.js
 * Chạy lại nhiều lần không bị trùng (bỏ qua event đã có cùng tên).
 */
require('dotenv').config();
const knexLib = require('knex');
const config = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const knex = knexLib(config[env]);

const ORGANIZER_EMAIL = 'organizer@test.com';
const DAY = 24 * 60 * 60 * 1000;

// Suất diễn đặt tương đối so với hôm nay để demo lúc nào cũng còn suất sắp tới
const at = (daysFromNow, hour) => {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const EVENTS = [
  {
    title: 'Hòa nhạc Symphony Mùa Thu 2026',
    category: 'Âm nhạc',
    venue: 'Nhà hát Lớn Hà Nội',
    description: 'Đêm nhạc giao hưởng với các tác phẩm kinh điển của Beethoven, Mozart và các nhạc sĩ Việt Nam đương đại.',
    showtimes: [{ days: 14, hour: 20, price: 350000, capacity: 120 }, { days: 15, hour: 20, price: 450000, capacity: 120 }],
  },
  {
    title: 'Vietnam Tech Summit 2026',
    category: 'Công nghệ',
    venue: 'GEM Center, TP.HCM',
    description: 'Hội nghị công nghệ với các diễn giả về AI, cloud và khởi nghiệp.',
    showtimes: [{ days: 21, hour: 9, price: 500000, capacity: 500 }],
  },
  {
    title: 'V.League 2026 – Hà Nội FC vs HAGL',
    category: 'Thể thao',
    venue: 'Sân vận động Hàng Đẫy',
    description: 'Trận cầu tâm điểm vòng 10 V.League.',
    showtimes: [{ days: 29, hour: 19, price: 150000, capacity: 300 }],
  },
  {
    title: 'Stand-up Comedy Night',
    category: 'Giải trí',
    venue: "B'estival, Đà Nẵng",
    description: 'Một đêm cười thả ga cùng các comedian trẻ.',
    showtimes: [{ days: 35, hour: 21, price: 250000, capacity: 80 }],
  },
  {
    title: 'Triển lãm Nghệ thuật Đương đại',
    category: 'Nghệ thuật',
    venue: 'Bảo tàng Mỹ thuật TP.HCM',
    description: 'Hơn 100 tác phẩm của các họa sĩ trẻ Việt Nam.',
    showtimes: [{ days: 40, hour: 10, price: 80000, capacity: 200 }],
  },
  {
    title: 'Gaming Festival Vietnam 2026',
    category: 'Công nghệ',
    venue: 'ICH, TP.HCM',
    description: 'Giải đấu eSports và khu trải nghiệm game mới nhất.',
    showtimes: [{ days: 50, hour: 10, price: 200000, capacity: 1000 }],
  },
];

(async () => {
  try {
    const organizer = await knex('users').where({ email: ORGANIZER_EMAIL }).first();
    if (!organizer) {
      throw new Error(`Chưa có ${ORGANIZER_EMAIL}. Hãy chạy: node scripts/create-test-users.js`);
    }

    let created = 0;
    for (const { showtimes, ...event } of EVENTS) {
      const exists = await knex('events').where({ title: event.title }).first();
      if (exists) continue;

      const [row] = await knex('events')
        .insert({ ...event, organizer_id: organizer.id, status: 'published' })
        .returning('id');
      await knex('showtimes').insert(
        showtimes.map((s) => ({
          event_id: row.id,
          starts_at: at(s.days, s.hour),
          price: s.price,
          capacity: s.capacity,
        }))
      );
      created += 1;
    }

    console.log(`Đã tạo ${created} sự kiện demo (bỏ qua ${EVENTS.length - created} sự kiện đã có).`);
  } catch (err) {
    console.error('Lỗi:', err.message);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
})();
