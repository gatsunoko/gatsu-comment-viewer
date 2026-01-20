import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

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
        const exeDir = await invoke<string>('get_exe_dir');
        const dbPath = `${exeDir}\\comments.db`;
        console.log(`Loading DB from: ${dbPath}`);
        db = await Database.load(`sqlite:${dbPath}`);
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
        await db.execute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        platform TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_muted INTEGER DEFAULT 0,
        tts_muted INTEGER DEFAULT 0,
        volume INTEGER DEFAULT -1,
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

export async function getUserHistory(userId: string, platform: string | null = null, limit: number = 100, offset: number = 0): Promise<CommentRecord[]> {
    if (!db) await initDb();
    if (!db) return [];

    try {
        if (platform) {
            return await db.select<CommentRecord[]>(
                'SELECT * FROM comments WHERE user_id = ? AND platform = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
                [userId, platform, limit, offset]
            );
        } else {
            return await db.select<CommentRecord[]>(
                'SELECT * FROM comments WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
                [userId, limit, offset]
            );
        }
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

export interface UserSettings {
    platform: string;
    user_id: string;
    is_muted: number; // 0 or 1
    tts_muted: number; // 0 or 1
    volume: number; // -1 for default
}

export async function setUserSettings(platform: string, userId: string, settings: Partial<UserSettings>): Promise<void> {
    if (!db) await initDb();
    if (!db) return;

    try {
        // First get existing to merge
        const existing = await getUserSettings(platform, userId);
        const newSettings = {
            is_muted: 0,
            tts_muted: 0,
            volume: -1,
            ...existing,
            ...settings
        };

        await db.execute(
            'INSERT OR REPLACE INTO user_settings (platform, user_id, is_muted, tts_muted, volume) VALUES (?, ?, ?, ?, ?)',
            [platform, userId, newSettings.is_muted ? 1 : 0, newSettings.tts_muted ? 1 : 0, newSettings.volume]
        );
    } catch (e) {
        console.error('Failed to set user settings:', e);
    }
}

export async function getUserSettings(platform: string, userId: string): Promise<UserSettings | null> {
    if (!db) await initDb();
    if (!db) return null;

    try {
        const result = await db.select<UserSettings[]>(
            'SELECT * FROM user_settings WHERE platform = ? AND user_id = ?',
            [platform, userId]
        );
        return result.length > 0 ? result[0] : null;
    } catch (e) {
        console.error('Failed to get user settings:', e);
        return null;
    }
}

export async function getAllUserSettings(): Promise<UserSettings[]> {
    if (!db) await initDb();
    if (!db) return [];

    try {
        return await db.select<UserSettings[]>('SELECT * FROM user_settings');
    } catch (e) {
        console.error('Failed to get all user settings:', e);
        return [];
    }
}

export interface MutedUserResult extends UserSettings {
    nickname: string | null;
    recent_username: string | null;
}

export async function getMutedUsers(): Promise<MutedUserResult[]> {
    if (!db) await initDb();
    if (!db) return [];

    try {
        return await db.select<MutedUserResult[]>(`
            SELECT s.*, n.nickname, 
            (SELECT username FROM comments c WHERE c.user_id = s.user_id AND c.platform = s.platform ORDER BY timestamp DESC LIMIT 1) as recent_username 
            FROM user_settings s 
            LEFT JOIN nicknames n ON s.platform = n.platform AND s.user_id = n.user_id 
            WHERE s.is_muted = 1 OR s.tts_muted = 1
        `);
    } catch (e) {
        console.error('Failed to get muted users:', e);
        return [];
    }
}
