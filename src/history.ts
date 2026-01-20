import { getUserHistory, searchComments, deleteComments, CommentRecord, getUserColor, setUserColor } from './db';
import { emit, listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const historyContainer = document.getElementById('history-container')!;
const userTitle = document.getElementById('user-title')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
const deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement;
const userSettingsDiv = document.getElementById('user-settings') as HTMLDivElement;
const userColorPicker = document.getElementById('user-color-picker') as HTMLInputElement;
const resetColorBtn = document.getElementById('reset-color-btn') as HTMLButtonElement;

const params = new URLSearchParams(window.location.search);
const userId = params.get('user_id');
const username = params.get('username');
const platform = params.get('platform');

let offset = 0;
const limit = 50;
let isLoading = false;
let hasMore = true;
let currentQuery = '';
let mode: 'user' | 'global' = 'global';

async function init() {
    console.log(`History Mode Init: username=${username}, userId=${userId}, platform=${platform}`);
    if (username) {
        mode = 'user';
        userTitle.textContent = `History: ${username}`;
        if (searchInput && searchInput.parentElement) {
            (searchInput.parentElement as HTMLElement).style.display = 'none';
        }

        // Show user settings
        if (userSettingsDiv && userId) {
            userSettingsDiv.style.display = 'flex';

            // Load current color
            // We need to know which platform this user belongs to.
            // But wait, the history window is generic for user_id. 
            // In main.ts logic: "source" is passed to addComment, but wait, addComment receives user_id.
            // We need to know the platform to look up the color.
            // "getUserHistory" filters by user_id only. UserIds might collide across platforms but it's rare or handled.
            // Let's assume we can find ONE comment to determine platform, or just use the platform from the first history item.
            // OR we can pass platform in URL params.
            // Let's try to fetch color by just user_id for now from DB? But DB key is (platform, user_id).
            // Hmmm. I should probably pass 'platform' in URL.
            // But wait, "getUserHistory" relies on user_id only? 
            // db.ts: getUserHistory: SELECT * FROM comments WHERE user_id = ?
            // The comments table has platform.
            // So if I fetch history first, I can know the platform.

            // Let's rely on history loading first? Or just try all platforms?
            // Better: update main.ts to pass platform in URL.
            // FOR NOW: I will guess platform or try to find it.

            // Actually, let's just use the first history item to determine platform once loaded.
            // BUT we want to show color immediately.

            // Let's defer color loading until loadData finishes? 
            // Valid strategy: When loadData finishes, if we found items, use the platform from the first item to load color.
            // If no items, we can't really set color effectively anyway (or we don't know platform).
        }

        await loadData(false);

        // After data load, try to set color picker
        if (userSettingsDiv && userId) {
            const history = await getUserHistory(userId, platform, 1);
            if (history.length > 0) {
                const currentPlatform = platform || history[0].platform;
                const color = await getUserColor(currentPlatform, userId);
                if (color) {
                    userColorPicker.value = color;
                    userTitle.style.color = color;
                } else {
                    const defColor = generateColor(username || 'user');
                    userColorPicker.value = defColor;
                    userTitle.style.color = defColor;
                }

                userColorPicker.addEventListener('change', async () => {
                    const newColor = userColorPicker.value;
                    await setUserColor(currentPlatform, userId, newColor);
                    userTitle.style.color = newColor;
                    // Emit event to main window
                    emit('color-update', { platform: currentPlatform, userId, color: newColor });
                });

                resetColorBtn.addEventListener('click', async () => {
                    const defColor = generateColor(username || 'user');
                    userColorPicker.value = defColor;
                    userTitle.style.color = defColor;
                    await setUserColor(currentPlatform, userId, defColor);
                    emit('color-update', { platform: currentPlatform, userId, color: defColor });
                });
            }
        }
    } else {
        mode = 'global';
        userTitle.textContent = "Global History";
        await loadData(false);

        searchBtn?.addEventListener('click', () => {
            currentQuery = searchInput?.value || '';
            loadData(false);
        });

        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                currentQuery = searchInput?.value || '';
                loadData(false);
            }
        });
    }

    // Delete Button Logic
    if (deleteBtn) {
        deleteBtn.style.display = 'block'; // Ensure visible
        // If specific user, maybe hide? User request implied context menu, but we added a global/header button.
        // If specific user, we probably shouldn't show global delete?
        // But the user said: "In the comment history popup... add delete button"
        // And "if searching... delete only displayed".

        // If in username mode, we can allow deleting that user's history.
        // But we hid the search bar in user mode. So query is empty.
        // So hitting delete in user mode = delete all for that user. Matches "if not searching, delete all".

        deleteBtn.addEventListener('click', async () => {
            let msg = '';
            if (mode === 'user') {
                msg = `Are you sure you want to delete ALL history for ${username}?`;
            } else {
                if (currentQuery.trim()) {
                    msg = `Are you sure you want to delete all comments matching "${currentQuery}"?`;
                } else {
                    msg = `Are you sure you want to delete ALL comments from the database? This cannot be undone.`;
                }
            }

            if (confirm(msg)) {
                try {
                    await deleteComments(currentQuery, mode === 'user' ? userId : null);
                    alert('Comments deleted.');
                    // Reload
                    loadData(false);
                } catch (e) {
                    alert(`Failed to delete: ${e}`);
                }
            }
        });
    }

    // Infinite Scroll
    historyContainer.addEventListener('scroll', () => {
        if (isLoading || !hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = historyContainer;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
            loadData(true);
        }
    });
}

async function loadData(append: boolean) {
    if (isLoading) return;
    isLoading = true;

    if (!append) {
        offset = 0;
        hasMore = true;
        historyContainer.innerHTML = '';
    }

    try {
        if (!append && offset === 0) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loading-indicator';
            loadingDiv.style.textAlign = 'center';
            loadingDiv.style.color = '#666';
            loadingDiv.textContent = 'Loading...';
            if (!historyContainer.hasChildNodes()) {
                historyContainer.appendChild(loadingDiv);
            }
        } else if (append) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loading-indicator-append';
            loadingDiv.style.textAlign = 'center';
            loadingDiv.style.color = '#666';
            loadingDiv.textContent = 'Loading more...';
            historyContainer.appendChild(loadingDiv);
        }

        let history: CommentRecord[] = [];
        if (mode === 'user') {
            if (userId) {
                history = await getUserHistory(userId, platform, limit, offset);
            } else {
                console.error("User mode but no userId found.");
                historyContainer.innerHTML = `<div style="color: red;">Error: User ID missing.</div>`;
                return;
            }
        } else {
            history = await searchComments(currentQuery, limit, offset);
        }

        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.remove();
        const loadingIndicatorAppend = document.getElementById('loading-indicator-append');
        if (loadingIndicatorAppend) loadingIndicatorAppend.remove();

        // Update Search Status
        const searchStatus = document.getElementById('search-status');
        if (searchStatus) {
            if (currentQuery && currentQuery.trim().length > 0) {
                searchStatus.style.display = 'block';
                searchStatus.innerHTML = `Searching for: <span style="color: #fff; font-weight: bold;">"${currentQuery}"</span> <span id="clear-search" style="cursor: pointer; color: #646cff; margin-left: 10px;">[Clear]</span>`;

                // Re-bind clear button
                const clearBtn = document.getElementById('clear-search');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        if (searchInput) searchInput.value = '';
                        currentQuery = '';
                        loadData(false);
                    });
                }
            } else {
                searchStatus.style.display = 'none';
            }
        }

        if (history.length < limit) {
            hasMore = false;
        }

        if (history.length === 0 && !append) {
            historyContainer.innerHTML = `<div style="text-align: center; color: #666;">No comments found.</div>`;
        } else {
            history.forEach(renderItem);
            offset += limit;
        }

    } catch (e) {
        console.error(e);
        if (!append) {
            historyContainer.innerHTML = `<div style="color: red;">Error: ${e}</div>`;
        }
    } finally {
        isLoading = false;
    }
}

function createHistoryItem(record: CommentRecord): HTMLElement {
    const div = document.createElement('div');
    div.className = 'history-item';

    const date = new Date(record.timestamp).toLocaleString();

    div.innerHTML = `
    <div class="history-meta">
      <span>
        <span class="history-platform ${record.platform}">${record.platform}</span>
        <span class="history-username" style="margin-left: 0.5rem; font-weight: bold; color: #bbb; cursor: pointer;" title="Click to view history">${record.username}</span>
        <span style="margin-left: 0.5rem; font-family: monospace; color: #666;">${record.channel_id}</span>
      </span>
      <span>${date}</span>
    </div>
    <div class="history-message">${record.message}</div>
  `;

    const usernameSpan = div.querySelector('.history-username');
    if (usernameSpan) {
        usernameSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            const uid = record.user_id;
            const uname = record.username;
            const source = record.platform;

            if (uid) {
                try {
                    const safeUid = uid.replace(/[^a-zA-Z0-9-_]/g, '');
                    const label = `history-${safeUid}-${Date.now()}`;

                    const webview = new WebviewWindow(label, {
                        url: `history.html?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(uname || '')}&platform=${source}`,
                        title: `History: ${uname}`,
                        width: 400,
                        height: 600
                    });

                    webview.once('tauri://error', (e) => {
                        console.error('[History] Window Error:', e);
                        alert(`Failed to create history window: ${JSON.stringify(e)}`);
                    });
                } catch (e) {
                    console.error('[History] Creation Error:', e);
                    alert(`Error opening history: ${e}`);
                }
            }
        });
    }

    return div;
}

function renderItem(record: CommentRecord) {
    historyContainer.appendChild(createHistoryItem(record));
}

// Real-time Updates
listen('new-comment', (event: any) => {
    const record = event.payload as CommentRecord;
    let shouldAdd = false;

    if (mode === 'user') {
        // Check if this comment belongs to the user we are viewing
        if (record.user_id === userId && (!platform || record.platform === platform || platform === record.platform)) {
            shouldAdd = true;
        }
    } else {
        // Global mode
        // Filter by current query if exists
        if (!currentQuery.trim()) {
            shouldAdd = true;
        } else {
            const q = currentQuery.toLowerCase();
            if ((record.message && record.message.toLowerCase().includes(q)) ||
                (record.username && record.username.toLowerCase().includes(q)) ||
                (record.channel_id && record.channel_id.toLowerCase().includes(q))) {
                shouldAdd = true;
            }
        }
    }

    if (shouldAdd) {
        // Prepend to history container
        const item = createHistoryItem(record);

        // If we are at the top, just prepend.
        // If we have "No comments found" placeholder, remove it.
        if (historyContainer.innerHTML.includes('No comments found')) {
            historyContainer.innerHTML = '';
        }

        historyContainer.prepend(item);
    }
});

init();

function generateColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    const s = 60 + (Math.abs(hash * 13) % 20);
    const l = 60 + (Math.abs(hash * 7) % 20);
    return `hsl(${h}, ${s}%, ${l}%)`;
}

