-- 0005: binding_groups + sort_order
-- 新增绑定分组表与排序支持

CREATE TABLE IF NOT EXISTS binding_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE bindings ADD COLUMN group_id TEXT REFERENCES binding_groups(id) ON DELETE SET NULL;
ALTER TABLE bindings ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS bindings_group_id_idx ON bindings(group_id);
CREATE INDEX IF NOT EXISTS bindings_sort_order_idx ON bindings(sort_order);
