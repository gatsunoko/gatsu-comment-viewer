import protobuf from 'protobufjs';

export class NiconicoClient {
    private active = false;
    private ws: WebSocket | null = null;
    private onMessage: (msg: any) => void;
    private ndgrRoot: protobuf.Root | null = null;
    private abortController: AbortController | null = null;

    // State
    private currentAt: string | number = 'now';
    private viewUri: string | null = null;

    // Limits
    private maxBackwardSegments = 10;

    constructor(onMessage: (msg: any) => void) {
        this.onMessage = onMessage;
        this.loadProto();
    }

    private async loadProto() {
        try {
            // Use the bundled proto (contains all definitions)
            this.ndgrRoot = await protobuf.load('/ndgr_full.proto');
            console.log('[NicoClient] Proto loaded');
        } catch (e) {
            console.error('[NicoClient] Proto load error', e);
            this.onMessage({ author: 'System', message: 'Failed to load Protocol Definitions.' });
        }
    }

    async join(url: string) {
        if (this.active) return;
        this.active = true;

        try {
            console.log(`[NicoClient] Fetching page: ${url}`);
            const res = await fetch(url);
            const html = await res.text();

            let props;
            const match = html.match(/id="embedded-data".*?data-props="([^"]+)"/);
            if (match) {
                props = JSON.parse(decodeURIComponent(match[1]).replace(/&quot;/g, '"'));
            } else {
                const jsonMatch = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
                if (jsonMatch) props = JSON.parse(jsonMatch[1]);
            }

            if (!props) throw new Error('Could not find embedded-data');

            // Debug props
            console.log(`[NicoClient] Props Program ID: ${props.program?.nicoliveProgramId}`);

            const wsUrl = props.site?.relive?.webSocketUrl;
            if (!wsUrl) throw new Error('No WebSocket URL found');

            console.log(`[NicoClient] WS URL: ${wsUrl}`);
            this.connectWs(wsUrl);

        } catch (e) {
            console.error('[NicoClient] Join Error', e);
            this.onMessage({ author: 'System', message: `Join Error: ${e}` });
            this.active = false;
        }
    }

    private connectWs(wsUrl: string) {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('[NicoClient] WS Open');
            this.onMessage({ author: 'System', message: `Connected to Niconico WS` });

            // Reference: Send startWatching
            this.ws?.send(JSON.stringify({
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
        };

        this.ws.onmessage = (event) => {
            try {
                const json = JSON.parse(event.data.toString());

                if (json.type === 'ping') {
                    this.ws?.send(JSON.stringify({ type: 'pong' }));
                }

                if (json.type === 'messageServer' && json.data?.viewUri) {
                    console.log('[NicoClient] Received MessageServer ViewURI');
                    this.viewUri = json.data.viewUri;
                    this.startEntryLoop(); // Start fetching
                } else if (json.type === 'stream' && json.data?.uri) {
                    // Reference implementation prefers messageServer but allows fallback or parallel?
                    // Actually reference `connectMessageWs` waits for `messageServer`.
                    // But if we only get `stream` (like in earlier tests), we might need to use it.
                    // The user said "Clone logic", reference logic uses `messageServer`.
                    // BUT if my previous success was with fallbacks, I should keep fallback logic 
                    // OR maybe headers/cookies are the reason I didn't get messageServer?
                    if (!this.viewUri && (json.data.uri.includes('mpn') || json.data.uri.includes('livedelivery'))) {
                        console.log('[NicoClient] Fallback to Stream URI');
                        this.viewUri = json.data.uri;
                        this.startEntryLoop();
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };

        this.ws.onclose = () => {
            console.log('[NicoClient] WS Close');
            this.active = false;
        };
    }

    // Logic ported from `createEntryFetcher` loop
    private async startEntryLoop() {
        if (!this.viewUri || !this.ndgrRoot) return;

        // Reset state
        this.currentAt = 'now';
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        console.log(`[NicoClient] Starting Entry Loop from: ${this.currentAt}`);

        try {
            while (this.active) {
                if (signal.aborted) break;

                const separator = this.viewUri.includes('?') ? '&' : '?';
                const uri = `${this.viewUri}${separator}at=${this.currentAt}`;

                console.log(`[NicoClient] Fetching Entry: ${uri}`);

                let receivedSegment = false;

                // Fetch Entry Stream
                const response = await fetch(uri, { signal });
                if (!response.body) throw new Error('No body');

                const reader = response.body.getReader();
                const ChunkedEntry = this.ndgrRoot.lookupType("dwango.nicolive.chat.service.edge.ChunkedEntry");

                await this.readStream(reader, ChunkedEntry, (entry: any) => {
                    // Logic from Reference
                    if (entry.next) {
                        // Case: Next (Update polling cursor)
                        this.currentAt = entry.next.at;
                        // console.log(`[NicoClient] Next At: ${this.currentAt}`);
                    }
                    else if (entry.segment) {
                        // Case: Segment (Real-time data)
                        receivedSegment = true;
                        // console.log(`[NicoClient] Segment URI: ${entry.segment.uri}`);
                        this.fetchMessages(entry.segment.uri);
                    }
                    else if (entry.backward) {
                        // Case: Backward (Past comments)
                        // Reference fetches backward messages here.
                        // For simplicity, we can fetch them or ignore if we only want live.
                        // User said "get comments", usually implies past too if just joined.
                        // But backward logic is complex (recursive). 
                        // For now, let's just log it.
                        console.log('[NicoClient] Backward segment available (Skipping for lighter implementation)');
                    }
                    else if (entry.previous) {
                        // Case: Previous (Recent past?)
                        if (!receivedSegment) {
                            // console.log(`[NicoClient] Previous URI: ${entry.previous.uri}`);
                            this.fetchMessages(entry.previous.uri);
                        }
                    }
                });

                // Loop continues with new `currentAt`
                // If fetching fails or stream closes, we loop again.
                // Ref adds a small sleep/backoff? 
                // Reference `while(true)` -> `fetchEntry` -> calls `ResponseIteratorSet` 
                // It seems to loop immediately.
            }
        } catch (e) {
            console.error('[NicoClient] Entry Loop Terminated', e);
            if (this.active) {
                // Retry with cooling
                setTimeout(() => this.startEntryLoop(), 2000);
            }
        }
    }

    private async fetchMessages(uri: string) {
        if (!this.ndgrRoot) return;
        // console.log(`[NicoClient] Fetching Messages: ${uri}`);

        try {
            const response = await fetch(uri);
            if (!response.body) throw new Error('No body');
            const reader = response.body.getReader();

            const ChunkedMessage = this.ndgrRoot.lookupType("dwango.nicolive.chat.service.edge.ChunkedMessage");

            await this.readStream(reader, ChunkedMessage, (msg: any) => {
                this.handleChunkedMessage(msg);
            });
        } catch (e) {
            console.error('[NicoClient] Message Fetch Error', e);
        }
    }

    private handleChunkedMessage(msg: any) {
        // proto definition:
        // message.payload (oneof) -> message (NicoliveMessage) -> data (oneof) -> chat (Chat)

        // Log to debug structure if needed
        // console.log('ChunkedMsg:', JSON.stringify(msg));

        // In bundled proto, fields are names, not ids usually (if loaded via json) or ids if logic uses decode
        // Our readStream uses `toObject` with options.

        const payload = msg.payload;
        if (!payload) return;

        // Handle Chat
        if (msg.message && msg.message.chat) { // If simplified
            // proto matches: oneof payload { NicoliveMessage message = 2; }
            // NicoliveMessage { oneof data { Chat chat = 1; } }
            // But Wait! `oneof` fields in protobufjs `toObject` are flattened or nested?
            // Usually `payload` key exists with value of oneof option?
            // Or `message` key exists directly?
            // Let's check logic:
            // msg.message corresponds to `NicoliveMessage`.
        }

        // Let's check dynamic access based on proto bundle structure
        let chat = null;

        if (msg.message && msg.message.chat) {
            chat = msg.message.chat;
        } else if (payload === 'message' && msg.message && msg.message.chat) {
            chat = msg.message.chat;
        } else if (msg.payload && msg.payload.message && msg.payload.message.chat) {
            // Access path: ChunkedMessage -> payload(value) -> message -> chat
            // Depending on how `toObject` output.
            // Usually: { message: { chat: { ... } } } if payload='message'
            chat = msg.payload.message.chat;
        } else if (msg.message && msg.message.data && msg.message.data.chat) {
            // If nested data
            chat = msg.message.data.chat;
        }

        // Just defensive check all paths
        const realChat = chat || msg?.message?.chat || msg?.payload?.message?.chat || msg?.payload?.message?.data?.chat;

        if (realChat && realChat.content) {
            const name = realChat.name || 'Anonymous';
            this.onMessage({ author: name, message: realChat.content });
        }
    }

    private async readStream(reader: ReadableStreamDefaultReader<Uint8Array>, msgType: protobuf.Type, callback: (obj: any) => void) {
        let buffer = new Uint8Array(0);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            let offset = 0;
            while (offset < buffer.length) {
                let length = 0;
                let shift = 0;
                let i = offset;
                let hasLength = false;
                while (i < buffer.length) {
                    const byte = buffer[i];
                    length |= (byte & 0x7F) << shift;
                    shift += 7;
                    i++;
                    if ((byte & 0x80) === 0) {
                        hasLength = true;
                        break;
                    }
                }

                if (!hasLength) { break; }

                if (buffer.length - i >= length) {
                    const chunk = buffer.slice(i, i + length);
                    offset = i + length;
                    try {
                        const decoded = msgType.decode(chunk);
                        const obj = msgType.toObject(decoded, { longs: String, enums: String, bytes: String, defaults: true, oneofs: true });
                        callback(obj);
                    } catch (e) { }
                } else { break; }
            }
            if (offset > 0) {
                buffer = buffer.slice(offset);
            }
        }
    }

    leave() {
        this.active = false;
        if (this.ws) {
            this.ws.close();
        }
        if (this.abortController) {
            this.abortController.abort();
        }
    }
}
