import WebSocket from 'ws';
import fs from 'fs';

// Read the dump to get the URL
const dump = JSON.parse(fs.readFileSync('nico_props_dump.json', 'utf8'));
const wsUrl = dump.site.relive.webSocketUrl;

if (!wsUrl) {
    console.error("No webSocketUrl in dump!");
    process.exit(1);
}

console.log("Connecting to:", wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log("Connected! Sending startWatching...");

    ws.send(JSON.stringify({
        "type": "startWatching",
        "data": {
            "stream": {
                "quality": "super_high",
                "protocol": "hls",
                "latency": "low",
                "chasePlay": false
            },
            "room": {
                "protocol": "webSocket",
                "commentable": true
            },
            "reconnect": false
        }
    }));
});

ws.on('message', (data) => {
    // console.log("Received raw:", data.toString());
    try {
        const json = JSON.parse(data.toString());
        console.log("Parsed type:", json.type);

        if (json.type === 'room' || json.type === 'watch' || json.type === 'stream') {
            console.log("CRITICAL MESSAGE:", JSON.stringify(json, null, 2));
        }

        if (data.toString().includes("mpn.live.nicovideo.jp")) {
            console.log("FOUND MPN URI!!!!!!");
            console.log(data.toString());
        }
    } catch (e) {
        console.log("Error parsing:", e);
    }
});

ws.on('error', (e) => {
    console.error("Error:", e);
});

ws.on('close', (code, reason) => {
    console.log(`Closed: ${code} ${reason}`);
});

// Wait 15 seconds
setTimeout(() => {
    console.log("Timeout reached, closing.");
    ws.close();
}, 15000);
