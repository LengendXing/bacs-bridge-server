import { getDb } from '../src/server/db/index.js';
import { users } from '../src/server/db/schema.js';
import { hashPassword } from '../src/server/auth/password.js';

(async () => {
  const db = getDb();
  const existing = db.select().from(users).all();
  if (existing.length > 0) {
    console.log('已有账户:', existing.map((u: any) => u.username).join(', '));
    process.exit(0);
  }
  const password = process.env.ADMIN_PASSWORD || 'admin';
  if (password.length < 6) {
    console.error('密码至少 6 位');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  db.insert(users).values({
    username: 'admin',
    passwordHash: hash,
    totpEnabled: false,
  }).run();
  console.log('✅ 管理员账户创建成功: admin');
})();
