import { LiveChat } from 'youtube-chat';

async function test(url) {
    console.log(`Testing URL: ${url}`);

    let id = '';
    try {
        if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
            id = url;
            console.log('Matched ID pattern directly');
        } else {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.searchParams.has('v')) {
                    id = urlObj.searchParams.get('v');
                    console.log('Extracted v from searchParams');
                } else if (urlObj.pathname.startsWith('/live/')) {
                    id = urlObj.pathname.split('/live/')[1];
                    console.log('Extracted from /live/');
                }
            } else if (urlObj.hostname === 'youtu.be') {
                id = urlObj.pathname.slice(1);
                console.log('Extracted from youtu.be');
            }
        }
    } catch (e) {
        console.error("Error parsing URL:", e.message);
    }

    console.log(`Extracted ID: ${id}`);

    if (!id) return;

    const liveChat = new LiveChat({ liveId: id });
    liveChat.on('chat', (chatItem) => {
        console.log('--- Chat Item ---');
        console.log(JSON.stringify(chatItem.message, null, 2));
        process.exit(0); // Exit after first message to confirm structure
    });

    liveChat.on('error', (err) => {
        console.error('Chat Error:', err);
    });

    console.log('Starting listener...');
    const ok = await liveChat.start();
    console.log('Started:', ok);
}

// Test with the problematic ID
test('NuJLSB3XD5w');
