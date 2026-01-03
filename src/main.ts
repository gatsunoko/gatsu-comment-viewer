import './style.css'
import tmi from 'tmi.js'
import { NiconamaClient, createNiconamaClient } from "./src"

const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const urlInput = document.querySelector<HTMLInputElement>('#twitch-url')!;
const commentsContainer = document.querySelector<HTMLDivElement>('#comments-container')!;
const activeChannelsContainer = document.querySelector<HTMLDivElement>('#active-channels')!;

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

const speechToggle = document.querySelector<HTMLInputElement>('#speech-toggle')!;

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

const addComment = (channel: string, username: string, messageHTML: string) => {
  const div = document.createElement('div');
  div.className = 'comment';
  // channel usually comes as #channelname, remove #
  const cleanChannel = channel.startsWith('#') ? channel.slice(1) : channel;

  div.innerHTML = `<span class="channel-name">[${cleanChannel}]</span><span class="username">${username}:</span> <span class="message">${messageHTML}</span>`;
  commentsContainer.appendChild(div);
  commentsContainer.scrollTop = commentsContainer.scrollHeight;

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
  if ((channel.startsWith('lv') || channel.startsWith('co'))) {// && globalThis.nicoClient) {
    // globalThis.nicoClient.leave();
    activeChannels.delete(channel);
    updateActiveChannelsUI();
    addComment(channel, 'System', 'Left Niconico channel');
    return;
  }

  // Try Twitch first if client exists
  if (client && (channel.startsWith('#') || !channel.match(/^[\w-]{11}$/))) {
    try {
      await client.part(channel);
      activeChannels.delete(channel);
      updateActiveChannelsUI();
      addComment(channel, 'System', `Left channel ${channel}.`);
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
    addComment(channel, 'System', `Left YouTube stream ${channel}.`);
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
      addComment(id, 'System', `Joined YouTube stream: ${id}`);

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
              addComment(id, msg.author, content);
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
      addComment('System', 'Error', `Failed to join YouTube: ${e}`);
      return;
    }
  }

  // --- Niconico Logic ---
  if (isNiconico) {
    try {
      const nicoUrl = url.includes('http') ? url : `https://live.nicovideo.jp/watch/${url}`;
      addComment('System', 'System', `Joining Niconico via Client: ${channelId}`);
      activeChannels.add(channelId); // Use url or ID?
      updateActiveChannelsUI();

      if (globalThis.nicoClient) {
        globalThis.nicoClient.disconnectWs();
        globalThis.nicoClient.disconnectMsg();
      }

      // ニコ生に接続するメイン部分
      // - createNiconamaClient(URL) で接続
      // - 詳しい説明は `Re.ResultAsync` の内容をAIに聞いて下さい

      globalThis.nicoClient = await createNiconamaClient(nicoUrl)
        .unwrap();

      (async () => {
        // ニコ生のメッセージを「非同期イテレータ」で取り出します
        for await (const msg of globalThis.nicoClient!.messageIterator) {
          // ニコ生のメッセージの内容に応じて処理を分けます
          // - msg.payload.case: メッセージの種類
          // - msg.payload.value: メッセージの内容
          // - case: "message" はコメント内容や、コメント・ギフト等
          //   - msg.payload.value.data.case: コメントの種類
          //   - msg.payload.value.data.value: コメントの内容
          if (msg.payload.case === "message") {
            const { data } = msg.payload.value
            if (data.case === "chat") {
              const chat = data.value;
              addComment(channelId, chat.name || 'Anonymous', chat.content);
            }
          }
        }
      })();
      return;
    } catch (e) {
      console.error(e);
      addComment('System', 'Error', `Failed to join Niconico: ${e}`);
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
      addComment(channel, tags['display-name'] || 'Anonymous', formattedMessage);
    });

    client.on('connected', (address, port) => {
      addComment('System', 'System', `Connected to Twitch Chat server at ${address}:${port}`);
    });

    try {
      await client.connect();
    } catch (e) {
      console.error(e);
      addComment('System', 'Error', 'Failed to connect to Twitch.');
      return;
    }
  }

  try {
    await client.join(channel);
    activeChannels.add(channel.toLowerCase());
    updateActiveChannelsUI();
    addComment(channel, 'System', `Joined channel!`);
    urlInput.value = ''; // Clear input
  } catch (e) {
    console.error(e);
    addComment('System', 'Error', `Failed to join ${channel}: ${e}`);
  }
});
