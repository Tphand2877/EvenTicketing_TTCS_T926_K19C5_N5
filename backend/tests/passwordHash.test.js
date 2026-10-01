/**
 * SCRUM-72 [S-02 (T-09)] - Password Hashing with Argon2id
 */

const bcrypt = require('bcryptjs');
const { hashPassword, verifyPassword, isArgon2Hash, isBcryptHash } = require('../src/utils/passwordHash');

describe('Password hashing (T-09)', () => {
  const PASSWORD = 'MatKhauManh!123';

  test('hashPassword() tạo ra hash theo chuẩn Argon2id', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(isArgon2Hash(hash)).toBe(true);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  test('verifyPassword() xác thực đúng với hash Argon2id, không cần rehash', async () => {
    const hash = await hashPassword(PASSWORD);
    const result = await verifyPassword(PASSWORD, hash);

    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  test('verifyPassword() trả valid=false khi sai mật khẩu với hash Argon2id', async () => {
    const hash = await hashPassword(PASSWORD);
    const result = await verifyPassword('sai-mat-khau', hash);

    expect(result.valid).toBe(false);
  });

  test('verifyPassword() vẫn xác thực đúng với hash bcrypt CŨ và báo cần nâng cấp (needsRehash=true)', async () => {
    const legacyHash = await bcrypt.hash(PASSWORD, 10);
    expect(isBcryptHash(legacyHash)).toBe(true);

    const result = await verifyPassword(PASSWORD, legacyHash);

    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  test('verifyPassword() với hash bcrypt cũ nhưng sai mật khẩu → valid=false, không cần rehash', async () => {
    const legacyHash = await bcrypt.hash(PASSWORD, 10);
    const result = await verifyPassword('sai-mat-khau', legacyHash);

    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  test('verifyPassword() với hash không đúng định dạng nào → valid=false', async () => {
    const result = await verifyPassword(PASSWORD, 'khong-phai-hash-hop-le');
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });
});
