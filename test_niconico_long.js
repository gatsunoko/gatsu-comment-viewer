import axios from 'axios';

async function testLong() {
    try {
        console.log("Testing Niconico Join (Long Poll)...");
        const res = await axios.post('http://localhost:3000/api/niconico/join', {
            url: 'https://live.nicovideo.jp/watch/lv349554474'
        });
        console.log("Joined:", res.data.id);

        let attempts = 0;
        const interval = setInterval(async () => {
            attempts++;
            try {
                const msgRes = await axios.get(`http://localhost:3000/api/niconico/messages?id=${res.data.id}`);
                const msgs = msgRes.data;
                console.log(`[${attempts}] Messages: ${msgs.length}`);
                if (msgs.length > 0) {
                    console.log("First Message:", JSON.stringify(msgs[0]));
                    // Maybe we want to see more?
                    // clearInterval(interval);
                    // process.exit(0);
                }
            } catch (e) {
                console.error("Poll Error:", e.message);
            }

            if (attempts >= 10) {
                console.log("Finished polling.");
                clearInterval(interval);
            }
        }, 2000);

    } catch (e) {
        console.error("Join Error:", e.message);
    }
}

testLong();
