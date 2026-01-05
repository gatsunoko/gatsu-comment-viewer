import Database from '@tauri-apps/plugin-sql';

const DB_PATH = 'comments.db';

export interface CommentRecord {
    id: number;
    platform: string; // 'twitch' | 'youtube' | 'niconico' | 'system'
    channel_id: string; // Platform specific channel ID
    user_id: string; // Platform specific user ID
    username: string;
    message: string;
    timestamp: string; // ISO string
}

let db: Database | null = null;

export async function initDb() {
    if (db) return;
    try {
        db = await Database.load(`sqlite:${DB_PATH}`);
        await db.execute(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
        await db.execute(`
      CREATE TABLE IF NOT EXISTS nicknames (
        platform TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        PRIMARY KEY (platform, user_id)
      )
    `);
        await db.execute(`
      CREATE TABLE IF NOT EXISTS user_colors (
        platform TEXT NOT NULL,
        user_id TEXT NOT NULL,
        color TEXT NOT NULL,
        PRIMARY KEY (platform, user_id)
      )
    `);
        // Index for faster history lookup
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_user_id ON comments(user_id)`);
        console.log('Database initialized');
    } catch (e) {
        console.error('Failed to init DB:', e);
        alert(`DB Init Error: ${e}`);
    }
}

export async function saveComment(
    platform: string,
    channelId: string,
    userId: string,
    username: string,
    message: string
) {
    if (!db) await initDb();
    if (!db) return;

    try {
        const timestamp = new Date().toISOString();
        await db.execute(
            'INSERT INTO comments (platform, channel_id, user_id, username, message, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [platform, channelId, userId, username, message, timestamp]
        );
    } catch (e) {
        console.error('Failed to save comment:', e);
        alert(`DB Save Error: ${e}`);
    }
}

export async function getUserHistory(userId: string, limit: number = 100, offset: number = 0): Promise<CommentRecord[]> {
    if (!db) await initDb();
    if (!db) return [];

    try {
        return await db.select<CommentRecord[]>(
            'SELECT * FROM comments WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            [userId, limit, offset]
        );
    } catch (e) {
        console.error('Failed to get history:', e);
        return [];
    }
}

export async function searchComments(query: string, limit: number = 100, offset: number = 0): Promise<CommentRecord[]> {
    if (!db) await initDb();
    if (!db) return [];

    try {
        if (!query.trim()) {
            return await db.select<CommentRecord[]>(
                'SELECT * FROM comments ORDER BY timestamp DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
        }
        return await db.select<CommentRecord[]>(
            'SELECT * FROM comments WHERE message LIKE ? OR username LIKE ? OR channel_id LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            [`%${query}%`, `%${query}%`, `%${query}%`, limit, offset]
        );
    } catch (e) {
        console.error('Failed to search comments:', e);
        return [];
    }
}

export async function deleteComments(query: string, userId: string | null): Promise<void> {
    if (!db) await initDb();
    if (!db) return;

    try {
        if (userId) {
            // Specific User Context
            if (!query.trim()) {
                await db.execute('DELETE FROM comments WHERE user_id = ?', [userId]);
            } else {
                await db.execute(
                    'DELETE FROM comments WHERE user_id = ? AND (message LIKE ? OR username LIKE ? OR channel_id LIKE ?)',
                    [userId, `%${query}%`, `%${query}%`, `%${query}%`]
                );
            }
        } else {
            // Global Context
            if (!query.trim()) {
                await db.execute('DELETE FROM comments');
            } else {
                await db.execute(
                    'DELETE FROM comments WHERE message LIKE ? OR username LIKE ? OR channel_id LIKE ?',
                    [`%${query}%`, `%${query}%`, `%${query}%`]
                );
            }
        }

    } catch (e) {
        console.error('Failed to delete comments:', e);
        throw e;
    }
}

export async function setNickname(platform: string, userId: string, nickname: string): Promise<void> {
    if (!db) await initDb();
    if (!db) return;

    try {
        const timestamp = new Date().toISOString();
        await db.execute(
            'INSERT OR REPLACE INTO nicknames (platform, user_id, nickname, timestamp) VALUES (?, ?, ?, ?)',
            [platform, userId, nickname, timestamp]
        );
    } catch (e) {
        console.error('Failed to set nickname:', e);
    }
}

export async function getNickname(platform: string, userId: string): Promise<string | null> {
    if (!db) await initDb();
    if (!db) return null;

    try {
        const result = await db.select<{ nickname: string }[]>(
            'SELECT nickname FROM nicknames WHERE platform = ? AND user_id = ?',
            [platform, userId]
        );
        return result.length > 0 ? result[0].nickname : null;
    } catch (e) {
        console.error('Failed to get nickname:', e);
        return null;
    }
}

export async function setUserColor(platform: string, userId: string, color: string): Promise<void> {
    if (!db) await initDb();
    if (!db) return;

    try {
        await db.execute(
            'INSERT OR REPLACE INTO user_colors (platform, user_id, color) VALUES (?, ?, ?)',
            [platform, userId, color]
        );
    } catch (e) {
        console.error('Failed to set user color:', e);
    }
}

export async function getUserColor(platform: string, userId: string): Promise<string | null> {
    if (!db) await initDb();
    if (!db) return null;

    try {
        const result = await db.select<{ color: string }[]>(
            'SELECT color FROM user_colors WHERE platform = ? AND user_id = ?',
            [platform, userId]
        );
        return result.length > 0 ? result[0].color : null;
    } catch (e) {
        console.error('Failed to get user color:', e);
        return null;
    }
}

export async function getAllUserColors(): Promise<{ platform: string, user_id: string, color: string }[]> {
    if (!db) await initDb();
    if (!db) return [];

    try {
        return await db.select<{ platform: string, user_id: string, color: string }[]>(
            'SELECT platform, user_id, color FROM user_colors'
        );
    } catch (e) {
        console.error('Failed to get all user colors:', e);
        return [];
    }
}
