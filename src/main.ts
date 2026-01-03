import './style.css'
import tmi from 'tmi.js'
import { NiconicoClient } from "./niconico"

declare global {
  var nicoClient: NiconicoClient | any;
}

const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const urlInput = document.querySelector<HTMLInputElement>('#twitch-url')!;
const commentsContainer = document.querySelector<HTMLDivElement>('#comments-container')!;
const activeChannelsContainer = document.querySelector<HTMLDivElement>('#active-channels')!;
const scrollBtn = document.querySelector<HTMLButtonElement>('#scroll-to-bottom-btn')!;
const sourceToggle = document.querySelector<HTMLInputElement>('#source-toggle')!;
const channelNameToggle = document.querySelector<HTMLInputElement>('#channel-name-toggle')!;
const speechToggle = document.querySelector<HTMLInputElement>('#speech-toggle')!;

// Settings Persistence
const saveSettings = () => {
  const settings = {
    speech: speechToggle.checked,
    source: sourceToggle.checked,
    channelName: channelNameToggle.checked
  };
  localStorage.setItem('commentViewerSettings', JSON.stringify(settings));
};

const loadSettings = () => {
  const settingsJson = localStorage.getItem('commentViewerSettings');
  if (settingsJson) {
    try {
      const settings = JSON.parse(settingsJson);
      if (typeof settings.speech === 'boolean') speechToggle.checked = settings.speech;
      if (typeof settings.source === 'boolean') sourceToggle.checked = settings.source;
      if (typeof settings.channelName === 'boolean') channelNameToggle.checked = settings.channelName;
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  // Apply visual states based on loaded (or default) values
  if (sourceToggle.checked) {
    commentsContainer.classList.add('show-source');
  } else {
    commentsContainer.classList.remove('show-source');
  }

  if (channelNameToggle.checked) {
    commentsContainer.classList.add('show-channel-name');
  } else {
    commentsContainer.classList.remove('show-channel-name');
  }
};

// Initialize settings
loadSettings();

sourceToggle.addEventListener('change', () => {
  if (sourceToggle.checked) {
    commentsContainer.classList.add('show-source');
  } else {
    commentsContainer.classList.remove('show-source');
  }
  saveSettings();
});

channelNameToggle.addEventListener('change', () => {
  if (channelNameToggle.checked) {
    commentsContainer.classList.add('show-channel-name');
  } else {
    commentsContainer.classList.remove('show-channel-name');
  }
  saveSettings();
});

let client: tmi.Client | null = null;
const activeChannels = new Set<string>();

// Helper function to format message with emotes
const formatMessage = (message: string, emotes: { [key: string]: string[] } | null | undefined): string => {
  if (!emotes) return message;

  // Flatten the emotes object into an array of replacements
  // emotes format: { "25": ["0-4"], "123": ["5-10", "12-17"] }
  const replacements: { start: number; end: number; id: string }[] = [];

  Object.keys(emotes).forEach(id => {
    emotes[id].forEach(range => {
      const [start, end] = range.split('-').map(Number);
      replacements.push({ start, end, id });
    });
  });

  // Sort by position
  replacements.sort((a, b) => a.start - b.start);

  let result = '';
  let lastIndex = 0;

  replacements.forEach(({ start, end, id }) => {
    // Append text before the emote
    result += message.substring(lastIndex, start);

    // Append the emote image
    // Using Twitch's static CDN for emote images
    result += `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0" class="emote" alt="emote">`;

    lastIndex = end + 1;
  });

  // Append remaining text
  result += message.substring(lastIndex);

  return result;
};

async function speak(text: string) {
  if (!speechToggle.checked) return;
  try {
    // Sanitize: Remove URLs
    const safeText = text.replace(/https?:\/\/[^\s]+/g, 'URL');

    // Call Bouyomi-chan directly
    // Using mode: 'no-cors' to allow the request even if the server doesn't send CORS headers.
    // We won't get a response, but the audio will play.
    const url = `http://localhost:50080/talk?text=${encodeURIComponent(safeText)}`;
    await fetch(url, { mode: 'no-cors' });

  } catch (e) {
    console.error('Speech error', e);
  }
}

type CommentSource = 'twitch' | 'youtube' | 'niconico' | 'system';

const addComment = (channel: string, username: string, messageHTML: string, source: CommentSource) => {
  // Check if user is at the bottom BEFORE adding the new comment
  // Use a small threshold (e.g. 20px) to account for minor discrepancies
  const threshold = 20;
  const isAtBottom = commentsContainer.scrollHeight - commentsContainer.scrollTop - commentsContainer.clientHeight <= threshold;

  const div = document.createElement('div');
  div.className = 'comment';
  // channel usually comes as #channelname, remove #
  const cleanChannel = channel.startsWith('#') ? channel.slice(1) : channel;

  div.innerHTML = `<span class="source-badge ${source}">${source}</span><span class="channel-name">[${cleanChannel}]</span><span class="username">${username}:</span> <span class="message">${messageHTML}</span>`;
  commentsContainer.appendChild(div);

  if (isAtBottom) {
    commentsContainer.scrollTop = commentsContainer.scrollHeight;
    // Ensure button is hidden if we auto-scrolled
    scrollBtn.classList.add('hidden');
  } else {
    // If we didn't auto-scroll (user is reading history), ensure button is visible
    scrollBtn.classList.remove('hidden');
  }

  // Speak (strip HTML tags for speech)
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = messageHTML;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  speak(textContent);
}

const updateActiveChannelsUI = () => {
  activeChannelsContainer.innerHTML = '';
  activeChannels.forEach(channel => {
    const span = document.createElement('span');
    span.className = 'channel-tag';
    span.textContent = channel;

    const removeBtn = document.createElement('span');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = 'Leave channel';
    removeBtn.onclick = () => removeChannel(channel);

    span.appendChild(removeBtn);
    activeChannelsContainer.appendChild(span);
  });
}

const removeChannel = async (channel: string) => {
  // Check if it looks like a YouTube ID (11 chars) or fallback to activeChannels check logic in future

  // Niconico Cleanup
  // Niconico Cleanup
  if ((channel.startsWith('lv') || channel.startsWith('co'))) {
    if (globalThis.nicoClient) {
      // Check if it has destroy method (new client)
      if (globalThis.nicoClient.destroy) {
        await globalThis.nicoClient.destroy();
      } else {
        // Fallback for old client structure if mixed
        if (globalThis.nicoClient.disconnectWs) globalThis.nicoClient.disconnectWs();
        if (globalThis.nicoClient.disconnectMsg) globalThis.nicoClient.disconnectMsg();
      }
      globalThis.nicoClient = undefined;
    }
    activeChannels.delete(channel);
    updateActiveChannelsUI();
    addComment(channel, 'System', 'Left Niconico channel', 'system');
    return;
  }

  // Try Twitch first if client exists
  if (client && (channel.startsWith('#') || !channel.match(/^[\w-]{11}$/))) {
    try {
      await client.part(channel);
      activeChannels.delete(channel);
      updateActiveChannelsUI();
      addComment(channel, 'System', `Left channel ${channel}.`, 'system');
      return;
    } catch (e) {
      // If it fails, maybe it wasn't a Twitch channel, proceed to try API leave
    }
  }

  // Try API Leave (YouTube)
  try {
    await fetch('http://localhost:3000/api/youtube/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channel })
    });
    activeChannels.delete(channel);
    updateActiveChannelsUI();
    addComment(channel, 'System', `Left YouTube stream ${channel}.`, 'system');
  } catch (e) {
    console.error(e);
  }
}

const extractChannel = (url: string): string | null => {
  // Handle formats like https://www.twitch.tv/shroud or simply shroud
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    return pathSegments[0] || null;
  } catch {
    // If not a URL, assume it's the channel name
    return url.trim() || null;
  }
}

// Scroll to bottom logic
scrollBtn.addEventListener('click', () => {
  commentsContainer.scrollTop = commentsContainer.scrollHeight;
  scrollBtn.classList.add('hidden');
});

commentsContainer.addEventListener('scroll', () => {
  const threshold = 20;
  const isAtBottom = commentsContainer.scrollHeight - commentsContainer.scrollTop - commentsContainer.clientHeight <= threshold;
  if (isAtBottom) {
    scrollBtn.classList.add('hidden');
  } else {
    scrollBtn.classList.remove('hidden');
  }
});

startBtn.addEventListener('click', async () => {
  const url = urlInput.value;
  const channel = extractChannel(url);

  if (!channel) {
    alert('Please enter a valid Twitch URL, YouTube URL, or channel name');
    return;
  }

  // Check if it matches YouTube video ID or URL
  const youtubeIdMatch = url.match(/(?:v=|youtu\.be\/|\/live\/)([\w-]{11})/);
  const isYoutube = !!youtubeIdMatch;

  // Check if Niconico
  const niconicoMatch = url.match(/live\.nicovideo\.jp\/watch\/(lv\d+)/) || url.match(/(lv\d+)/);
  const isNiconico = !!niconicoMatch;

  const channelId = isYoutube ? youtubeIdMatch![1] : (isNiconico ? niconicoMatch![1] : channel);


  if (activeChannels.has(channelId.toLowerCase()) || activeChannels.has(channelId)) {
    return;
  }

  // Helper to format YouTube message parts
  const formatYouTubeMessage = (messageParts: any[]): string => {
    return messageParts.map(part => {
      // Check for custom emojis (youtube-chat format)
      if (part.url || part.isCustomEmoji) {
        const src = part.url;
        const alt = part.emojiText || part.alt || 'emoji';
        return `<img src="${src}" class="emote" alt="${alt}" title="${alt}">`;
      } else {
        // It's text
        return part.text || '';
      }
    }).join('');
  };

  // --- YouTube Logic ---
  if (isYoutube) {
    try {
      // 1. Join via Proxy
      const joinRes = await fetch('http://localhost:3000/api/youtube/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: channelId }) // Passing ID as URL for simplicity in server.js logic
      });
      const joinData = await joinRes.json();

      if (joinData.error) {
        throw new Error(joinData.error);
      }

      const id = joinData.id;
      activeChannels.add(id);
      updateActiveChannelsUI();
      addComment(id, 'System', `Joined YouTube stream: ${id}`, 'system');

      // 2. Start Polling
      const pollInterval = setInterval(async () => {
        if (!activeChannels.has(id)) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const res = await fetch(`http://localhost:3000/api/youtube/messages?id=${id}`);
          const messages = await res.json();
          if (Array.isArray(messages)) {
            messages.forEach(msg => {
              // Handle both old string format (if cached) and new array format
              let content = '';
              if (Array.isArray(msg.message)) {
                content = formatYouTubeMessage(msg.message);
              } else {
                content = msg.message;
              }
              addComment(id, msg.author, content, 'youtube');
            });
          }
        } catch (err) {
          console.error('Polling error', err);
        }
      }, 1000); // Poll every 1s

      urlInput.value = '';
      return;

    } catch (e) {
      console.error(e);
      addComment('System', 'Error', `Failed to join YouTube: ${e}`, 'system');
      return;
    }
  }

  // --- Niconico Logic ---
  if (isNiconico) {
    try {
      const nicoUrl = url.includes('http') ? url : `https://live.nicovideo.jp/watch/${url}`;
      addComment('System', 'System', `Joining Niconico via Client: ${channelId}`, 'system');
      activeChannels.add(channelId);
      updateActiveChannelsUI();

      if (globalThis.nicoClient) {
        // Check if it has destroy method (new client)
        if (globalThis.nicoClient.destroy) {
          await globalThis.nicoClient.destroy();
        } else {
          // Fallback for old client structure if mixed
          if (globalThis.nicoClient.disconnectWs) globalThis.nicoClient.disconnectWs();
          if (globalThis.nicoClient.disconnectMsg) globalThis.nicoClient.disconnectMsg();
        }
      }

      // Initialize new Rust-backed client
      const { NiconicoClient } = await import('./niconico'); // Corrected path

      globalThis.nicoClient = new NiconicoClient((msg: any) => {
        // Rust backend returns { author, message } objects directly in 'comment' event
        // But wait, my src/niconico.ts setupListener calls onMessage(event.payload)
        // payload is CommentEvent { author, message } or SystemEvent

        if (msg.author === 'System') {
          // System message
          // addComment('System', 'System', msg.message, 'system');
          // Or handle specific system events?
          // Use channelId as channel
          addComment(channelId, 'System', msg.message, 'system');
        } else {
          // Chat message
          addComment(channelId, msg.author, msg.message, 'niconico');
        }
      });

      await globalThis.nicoClient.join(nicoUrl);
      urlInput.value = '';

      return;
    } catch (e) {
      console.error(e);
      addComment('System', 'Error', `Failed to join Niconico: ${e}`, 'system');
      return;
    }
  }

  // --- Twitch Logic ---

  if (!client) {
    client = new tmi.Client({
      channels: []
    });

    client.on('message', (channel, tags, message, _self) => {
      const formattedMessage = formatMessage(message, tags.emotes);
      addComment(channel, tags['display-name'] || 'Anonymous', formattedMessage, 'twitch');
    });

    client.on('connected', (address, port) => {
      addComment('System', 'System', `Connected to Twitch Chat server at ${address}:${port}`, 'system');
    });

    try {
      await client.connect();
    } catch (e) {
      console.error(e);
      addComment('System', 'Error', 'Failed to connect to Twitch.', 'system');
      return;
    }
  }

  try {
    await client.join(channel);
    activeChannels.add(channel.toLowerCase());
    updateActiveChannelsUI();
    addComment(channel, 'System', `Joined channel!`, 'system');
    urlInput.value = ''; // Clear input
  } catch (e) {
    console.error(e);
    addComment('System', 'Error', `Failed to join ${channel}: ${e}`, 'system');
  }
});
