CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT);
INSERT INTO platform_settings(key,value,updated_at)
SELECT 'featured_cafe_id',id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM cafes
WHERE id='cafe_9f81309be58b4d48' AND name='Sunny Day coffee shop' AND status='active' AND data_mode='live';
