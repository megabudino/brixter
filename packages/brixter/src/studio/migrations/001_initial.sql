-- brixter initial schema (custom tables only).
-- BetterAuth tables (user, session, account, verification) are created by
-- `better-auth migrate`, which `bun run db:migrate` runs before this file.

-- Singleton row, enforced by CHECK (id = 1), holding the editor settings
-- for the GitHub repo configured via env (GITHUB_REPO_OWNER / _NAME / ...).
CREATE TABLE IF NOT EXISTS repo_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    allowed_paths TEXT NOT NULL DEFAULT '[]',
    allowed_extensions TEXT NOT NULL DEFAULT '[".md",".yaml",".yml",".png",".jpg",".jpeg",".gif",".svg",".webp"]',
    media_path TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO repo_config (id) VALUES (1);
