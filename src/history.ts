import { getUserHistory, searchComments, deleteComments, CommentRecord } from './db';

const historyContainer = document.getElementById('history-container')!;
const userTitle = document.getElementById('user-title')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
const deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement;

const params = new URLSearchParams(window.location.search);
const userId = params.get('user_id');
const username = params.get('username');

let offset = 0;
const limit = 50;
let isLoading = false;
let hasMore = true;
let currentQuery = '';
let mode: 'user' | 'global' = 'global';

async function init() {
    if (username) {
        mode = 'user';
        userTitle.textContent = `History: ${username}`;
        if (searchInput && searchInput.parentElement) {
            (searchInput.parentElement as HTMLElement).style.display = 'none';
        }
        await loadData(false);
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
        if (mode === 'user' && userId) {
            history = await getUserHistory(userId, limit, offset);
        } else {
            history = await searchComments(currentQuery, limit, offset);
        }

        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.remove();
        const loadingIndicatorAppend = document.getElementById('loading-indicator-append');
        if (loadingIndicatorAppend) loadingIndicatorAppend.remove();

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

function renderItem(record: CommentRecord) {
    const div = document.createElement('div');
    div.className = 'history-item';

    const date = new Date(record.timestamp).toLocaleString();

    div.innerHTML = `
    <div class="history-meta">
      <span>
        <span class="history-platform ${record.platform}">${record.platform}</span>
        <span style="margin-left: 0.5rem; font-weight: bold; color: #bbb;">${record.username}</span>
        <span style="margin-left: 0.5rem; font-family: monospace; color: #666;">${record.channel_id}</span>
      </span>
      <span>${date}</span>
    </div>
    <div class="history-message">${record.message}</div>
  `;
    historyContainer.appendChild(div);
}

init();
