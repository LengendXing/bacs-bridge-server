/**
 * @module scripts/migrate-bindings
 * @description 一次性数据迁移：bindings.json → SQLite
 *
 * 用法: npx tsx scripts/migrate-bindings.ts
 *
 * 读取旧 bridge-server/data/bindings.json，将每条绑定写入 SQLite。
 * 自动创建对应的 provider 记录（custom 模式）和 model 占位记录。
 */

import fs from 'fs';
import path from 'path';
import { getDb } from '../src/server/db/index.js';
import { providers, models, bindings } from '../src/server/db/schema.js';
import { v4 as uuidv4 } from 'uuid';

/** 旧 bindings.json 中的绑定结构 */
interface LegacyBinding {
  id: string;
  process_name: string;
  feishu_app_id: string;
  feishu_app_secret: string;
  claude_mode: 'env' | 'custom';
  claude_base_url: string | null;
  claude_api_key: string | null;
  status: string;
  created_at: string;
}

async function main() {
  const db = getDb();

  // 查找旧数据文件
  const legacyPath = path.join(__dirname, '..', 'bridge-server', 'data', 'bindings.json');

  if (!fs.existsSync(legacyPath)) {
    console.log('未找到旧 bindings.json，无需迁移');
    process.exit(0);
  }

  const raw = fs.readFileSync(legacyPath, 'utf-8');
  const { bindings: legacyBindings } = JSON.parse(raw) as { bindings: LegacyBinding[] };

  if (!legacyBindings || legacyBindings.length === 0) {
    console.log('旧 bindings.json 无数据，无需迁移');
    process.exit(0);
  }

  console.log(`找到 ${legacyBindings.length} 条旧绑定，开始迁移...`);

  let migrated = 0;
  let skipped = 0;

  for (const lb of legacyBindings) {
    // 检查是否已存在同名绑定
    const existing = db.select().from(bindings)
      .where()
      .all()
      .filter(b => b.processName === lb.process_name);

    if (existing.length > 0) {
      console.log(`  跳过 ${lb.process_name}（已存在）`);
      skipped++;
      continue;
    }

    let providerId: number | null = null;
    let modelId: number | null = null;

    // 为 custom 模式创建 provider + 占位 model
    if (lb.claude_mode === 'custom' && lb.claude_base_url && lb.claude_api_key) {
      const result = db.insert(providers).values({
        name: `迁移-CC-${lb.process_name}`,
        kind: 'custom',
        baseUrl: lb.claude_base_url,
        apiKey: lb.claude_api_key,
      }).run();

      providerId = Number(result.lastInsertRowid);

      // 创建占位模型
      const modelResult = db.insert(models).values({
        providerId,
        modelId: 'claude-default',
        displayName: 'Claude (默认)',
        cliKind: 'cc',
      }).run();
      modelId = Number(modelResult.lastInsertRowid);
    }

    // 创建绑定
    db.insert(bindings).values({
      id: lb.id || uuidv4(),
      processName: lb.process_name,
      cliKind: 'cc',
      providerId,
      modelId,
      feishuAppId: lb.feishu_app_id,
      feishuAppSecret: lb.feishu_app_secret,
      status: lb.status || 'offline',
      createdAt: lb.created_at || new Date().toISOString(),
    }).run();

    console.log(`  ✅ ${lb.process_name}`);
    migrated++;
  }

  console.log('');
  console.log(`迁移完成: ${migrated} 条成功, ${skipped} 条跳过`);
}

main().catch(e => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
