/**
 * @module scripts/seed-admin
 * @description 创建初始管理员账户
 *
 * 用法: npx tsx scripts/seed-admin.ts
 *
 * 如果数据库中尚无管理员账户，创建默认账户：
 * - 用户名: admin
 * - 密码: 从环境变量 ADMIN_PASSWORD 读取，默认 admin
 * - 2FA: 未启用
 */

import { getDb } from '../src/server/db/index.js';
import { users } from '../src/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/server/auth/password.js';
import * as readline from 'readline';

async function main() {
  // 初始化数据库（会自动运行迁移）
  const db = getDb();

  // 检查是否已有管理员
  const existing = db.select().from(users).all();
  if (existing.length > 0) {
    console.log('数据库中已有管理员账户，跳过创建。');
    console.log(`现有账户: ${existing.map(u => u.username).join(', ')}`);
    process.exit(0);
  }

  // 获取密码
  let password = process.env.ADMIN_PASSWORD || 'admin';

  // 交互式输入（如果有 TTY）
  if (process.stdin.isTTY) {
    password = await askPassword();
  }

  if (password.length < 6) {
    console.error('密码至少 6 位');
    process.exit(1);
  }

  // 创建管理员
  const hash = await hashPassword(password);
  db.insert(users).values({
    username: 'admin',
    passwordHash: hash,
    totpEnabled: false,
  }).run();

  console.log('✅ 管理员账户创建成功');
  console.log(`   用户名: admin`);
  console.log(`   密码: ${'*'.repeat(password.length)}`);
  console.log('');
  console.log('请登录管理面板后立即修改默认密码！');
}

/** 交互式密码输入 */
function askPassword(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('请输入管理员密码（默认 admin，回车使用默认）: ', (answer) => {
      rl.close();
      resolve(answer.trim() || 'admin');
    });
  });
}

main().catch(e => {
  console.error('创建管理员失败:', e.message);
  process.exit(1);
});
