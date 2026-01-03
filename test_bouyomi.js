import net from 'net';
import http from 'http';

const text = "Bouyomi-chan test.";
console.log("Testing Bouyomi-chan connectivity...");

// Test HTTP (50080)
const testHttp = () => {
    console.log("Attempting HTTP (50080)...");
    const options = {
        hostname: 'localhost',
        port: 50080,
        path: '/talk?text=' + encodeURIComponent(text + " HTTP"),
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        console.log(`HTTP Status: ${res.statusCode}`);
        res.on('data', () => { });
        res.on('end', () => console.log("HTTP Request Completed."));
    });

    req.on('error', (e) => {
        console.error(`HTTP Error: ${e.message}`);
    });

    req.end();
};

// Test TCP (50001)
const testTcp = () => {
    console.log("Attempting TCP (50001)...");
    const client = new net.Socket();
    client.connect(50001, '127.0.0.1', () => {
        console.log("TCP Connected!");
        const messageBuffer = Buffer.from(text + " TCP", 'utf-8');
        const length = messageBuffer.length;

        const header = Buffer.alloc(15);
        header.writeInt16LE(-1, 0);
        header.writeInt16LE(-1, 2);
        header.writeInt16LE(-1, 4);
        header.writeInt16LE(0, 6);
        header.writeUInt8(0, 8);
        header.writeInt32LE(length, 9);

        client.write(Buffer.concat([header, messageBuffer]));
        client.end();
    });

    client.on('error', (err) => {
        console.error(`TCP Error: ${err.message}`);
    });

    client.on('close', () => console.log('TCP Connection Closed'));
};

testHttp();
setTimeout(testTcp, 2000);
