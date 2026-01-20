import { getMutedUsers, setUserSettings, MutedUserResult } from './db';
import { emit } from '@tauri-apps/api/event';

const listContainer = document.getElementById('list-container')!;

async function loadUsers() {
    listContainer.innerHTML = '<div style="text-align: center; color: #666; margin-top: 20px;">Loading...</div>';

    try {
        const users = await getMutedUsers();
        renderUsers(users);
    } catch (e) {
        console.error('Failed to load muted users:', e);
        listContainer.innerHTML = `<div style="color: red; padding: 10px;">Error loading users: ${e}</div>`;
    }
}

function renderUsers(users: MutedUserResult[]) {
    listContainer.innerHTML = '';

    if (users.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #666; margin-top: 20px;">No muted users found.</div>';
        return;
    }

    users.forEach(user => {
        const row = document.createElement('div');
        row.className = 'user-row';

        const displayName = user.nickname || user.recent_username || 'Unknown User';

        row.innerHTML = `
            <span class="platform-badge ${user.platform}">${user.platform}</span>
            <div class="user-info">
                <div class="username" title="${displayName}">${displayName}</div>
                <div class="userid" title="${user.user_id}">${user.user_id}</div>
            </div>
            <div class="actions">
                ${user.is_muted ? `<button class="btn-unmute">Unmute</button>` : ''}
                ${user.tts_muted ? `<button class="btn-unmute-tts">Unmute TTS</button>` : ''}
            </div>
        `;

        const unmuteBtn = row.querySelector('.btn-unmute');
        if (unmuteBtn) {
            unmuteBtn.addEventListener('click', async () => {
                await toggleMute(user, 'is_muted');
            });
        }

        const unmuteTtsBtn = row.querySelector('.btn-unmute-tts');
        if (unmuteTtsBtn) {
            unmuteTtsBtn.addEventListener('click', async () => {
                await toggleMute(user, 'tts_muted');
            });
        }

        listContainer.appendChild(row);
    });
}

async function toggleMute(user: MutedUserResult, type: 'is_muted' | 'tts_muted') {
    const newSettings = {
        is_muted: type === 'is_muted' ? 0 : user.is_muted,
        tts_muted: type === 'tts_muted' ? 0 : user.tts_muted,
        volume: user.volume
    };

    // If unmuting one property leaves the user with no restrictions (and default volume), they will disappear from the list on reload.
    // Ideally we update the view optimistically.

    try {
        await setUserSettings(user.platform, user.user_id, newSettings);
        emit('user-settings-update', { platform: user.platform, user_id: user.user_id, ...newSettings });

        // Reload list
        loadUsers();
    } catch (e) {
        alert(`Failed to update settings: ${e}`);
    }
}

// Initial Load
loadUsers();
