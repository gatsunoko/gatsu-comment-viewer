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
