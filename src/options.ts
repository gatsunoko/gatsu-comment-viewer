import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';

// UI Elements
const speechToggle = document.getElementById('speech-toggle') as HTMLInputElement;
const sourceToggle = document.getElementById('source-toggle') as HTMLInputElement;
const channelNameToggle = document.getElementById('channel-name-toggle') as HTMLInputElement;
const mutedUsersBtn = document.getElementById('muted-users-btn') as HTMLButtonElement;

// Load initial state
function loadState() {
    const isSpeechEnabled = localStorage.getItem('isSpeechEnabled') !== 'false'; // Default true
    const showSource = localStorage.getItem('showSource') === 'true'; // Default false
    const showChannelName = localStorage.getItem('showChannelName') !== 'false'; // Default true

    speechToggle.checked = isSpeechEnabled;
    sourceToggle.checked = showSource;
    channelNameToggle.checked = showChannelName;
}

// Save and Emit
async function updateSetting(key: string, value: boolean) {
    localStorage.setItem(key, String(value));

    // Emit event to main window
    // We emit a general "app-settings-update" event that the main window will listen to
    console.log(`[Options] Emitting update: ${key} = ${value}`);
    await emit('app-settings-update', {
        setting: key,
        value: value
    });
}

// Event Listeners
speechToggle.addEventListener('change', () => {
    updateSetting('isSpeechEnabled', speechToggle.checked);
});

sourceToggle.addEventListener('change', () => {
    updateSetting('showSource', sourceToggle.checked);
});

channelNameToggle.addEventListener('change', () => {
    updateSetting('showChannelName', channelNameToggle.checked);
});

mutedUsersBtn.addEventListener('click', async () => {
    const label = 'muted-users';

    // Check if window already exists to just focus it
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
        await existing.setFocus();
        return;
    }

    const webview = new WebviewWindow(label, {
        url: 'muted_users.html',
        title: 'Muted Users',
        width: 600,
        height: 400
    });

    webview.once('tauri://error', async (e) => {
        console.error('Muted Users Window Error:', e);
        // If we missed the check (race condition) or other error
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
            await existing.setFocus();
        } else {
            alert(`Failed to open window: ${JSON.stringify(e)}`);
        }
    });
});

// Init
loadState();
