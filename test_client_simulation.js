import WebSocket from 'ws';
import protobuf from 'protobufjs';
import axios from 'axios';

// Determine target
const targetUrl = 'https://live.nicovideo.jp/watch/lv349556327?provider_type=community';

async function run() {
    console.log(`[Test] Fetching page: ${targetUrl}`);
    try {
        const res = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                // 'Cookie': '...' // If we had one
            }
        });
        const html = res.data;

        let props;
        const match = html.match(/id="embedded-data".*?data-props="([^"]+)"/);
        if (match) {
            props = JSON.parse(decodeURIComponent(match[1]).replace(/&quot;/g, '"'));
        } else {
            const jsonMatch = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
            if (jsonMatch) props = JSON.parse(jsonMatch[1]);
        }

        if (!props) throw new Error('No embedded-data');

        console.log('[Test] Props found.');

        const liveId = props.program?.nicoliveProgramId;
        const wsUrl = props.site?.relive?.webSocketUrl;

        console.log(`[Test] WS URL: ${wsUrl}`);

        // Load Proto
        const root = await protobuf.load('proto/ndgr.proto');
        const ChunkedEntry = root.lookupType("dwango.nicolive.chat.service.edge.ChunkedEntry");
        const ChunkedMessage = root.lookupType("dwango.nicolive.chat.service.edge.ChunkedMessage");

        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log('[Test] WS Open');
            ws.send(JSON.stringify({
                "type": "startWatching",
                "data": {
                    "stream": {
                        "quality": "super_high",
                        "latency": "low",
                        "chasePlay": false
                    },
                    "reconnect": false
                }
            }));
        });

        ws.on('message', async (data) => {
            const json = JSON.parse(data.toString());
            // console.log(`[WS] ${json.type}`);

            if (json.type === 'messageServer' && json.data?.viewUri) {
                console.log(`[Test] Found MessageServer: ${json.data.viewUri}`);
                startEntryLoop(json.data.viewUri, ChunkedEntry, ChunkedMessage);
            } else if (json.type === 'stream' && json.data?.uri) {
                console.log(`[Test] Found Stream URI: ${json.data.uri}`);
                // Try connecting to stream URI if it looks like mpn?
                if (json.data.uri.includes('mpn') || json.data.uri.includes('livedelivery')) {
                    startEntryLoop(json.data.uri, ChunkedEntry, ChunkedMessage);
                }
            }

            if (json.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        });

    } catch (e) {
        console.error('[Test] Error', e);
    }
}


async function startEntryLoop(viewUri, ChunkedEntry, ChunkedMessage) {
    let currentAt = 'now';
    let loopCount = 0;

    while (loopCount < 20) { // Limit loop for test
        const separator = viewUri.includes('?') ? '&' : '?';
        const uri = `${viewUri}${separator}at=${currentAt}`;
        console.log(`[NDGR] Fetching Entry (${loopCount}): ${uri}`);

        try {
            const response = await axios({
                method: 'get',
                url: uri,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Origin': 'https://live.nicovideo.jp',
                    'Referer': 'https://live.nicovideo.jp/'
                }
            });

            const stream = response.data;
            let headerBuffer = Buffer.alloc(0);
            let gotNext = false;
            let gotSegment = false;

            await new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    let data = chunk;
                    if (headerBuffer.length > 0) {
                        data = Buffer.concat([headerBuffer, chunk]);
                        headerBuffer = Buffer.alloc(0);
                    }

                    let offset = 0;
                    while (offset < data.length) {
                        let length = 0; let shift = 0; let i = offset; let hasLength = false;
                        while (i < data.length) {
                            const byte = data[i];
                            length |= (byte & 0x7F) << shift;
                            shift += 7;
                            i++;
                            if ((byte & 0x80) === 0) { hasLength = true; break; }
                        }

                        if (!hasLength) { headerBuffer = data.slice(offset); break; }
                        if (data.length - i >= length) {
                            const payload = data.slice(i, i + length);
                            offset = i + length;
                            try {
                                const entry = ChunkedEntry.decode(payload);
                                const obj = ChunkedEntry.toObject(entry, { longs: String, enums: String, bytes: String });
                                console.log(`[NDGR] Entry Object:`, JSON.stringify(obj));

                                if (obj.next) {
                                    currentAt = obj.next.at;
                                    gotNext = true;
                                }
                                if (obj.segment && obj.segment.uri) {
                                    console.log(`[NDGR] Got Segment!`);
                                    connectMessageStream(obj.segment.uri, ChunkedMessage);
                                    gotSegment = true;
                                }
                            } catch (e) { }
                        } else { headerBuffer = data.slice(offset); break; }
                    }
                });
                stream.on('end', resolve);
                stream.on('error', reject);
            });

            if (!gotNext && !gotSegment) {
                console.log('[NDGR] Stream ended without Next or Segment. Stopping.');
                break;
            }
            if (!gotSegment) {
                // If only next, wait a bit?
                // console.log('Waiting 1s...');
                // await new Promise(r => setTimeout(r, 1000));
            }
            loopCount++;

        } catch (e) {
            console.error('[NDGR] Loop Error', e.message);
            break;
        }
    }
}

async function connectMessageStream(uri, ChunkedMessage) {
    console.log(`[Msg] Connecting: ${uri}`);
    try {
        const response = await axios({
            method: 'get',
            url: uri,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': 'https://live.nicovideo.jp',
                'Referer': 'https://live.nicovideo.jp/'
            }
        });

        const stream = response.data;
        let headerBuffer = Buffer.alloc(0);

        stream.on('data', (chunk) => {
            // ... Varint decode ...
            let data = chunk;
            if (headerBuffer.length > 0) {
                data = Buffer.concat([headerBuffer, chunk]);
                headerBuffer = Buffer.alloc(0);
            }

            let offset = 0;
            while (offset < data.length) {
                let length = 0; let shift = 0; let i = offset; let hasLength = false;
                while (i < data.length) {
                    const byte = data[i];
                    length |= (byte & 0x7F) << shift;
                    shift += 7;
                    i++;
                    if ((byte & 0x80) === 0) { hasLength = true; break; }
                }

                if (!hasLength) { headerBuffer = data.slice(offset); break; }
                if (data.length - i >= length) {
                    const payload = data.slice(i, i + length);
                    offset = i + length;
                    try {
                        const msg = ChunkedMessage.decode(payload);
                        const obj = ChunkedMessage.toObject(msg, { longs: String, enums: String, bytes: String });

                        if (obj.payload?.message?.data?.chat) {
                            const chat = obj.payload.message.data.chat;
                            console.log(`[Chat] ${chat.name}: ${chat.content}`);
                        }
                    } catch (e) { }
                } else { headerBuffer = data.slice(offset); break; }
            }
        });

    } catch (e) {
        console.error(`[Msg] Error: ${e.message}`);
    }
}

run();
