import axios from 'axios';

async function test() {
    try {
        console.log("Testing Niconico Join...");
        const res = await axios.post('http://localhost:3000/api/niconico/join', {
            url: 'https://live.nicovideo.jp/watch/lv349554474'
        });

        console.log("Join Response:", res.data);

        console.log("Testing Fetch Messages...");
        const msgRes = await axios.get(`http://localhost:3000/api/niconico/messages?id=${res.data.id}`);
        console.log("Messages:", msgRes.data);

    } catch (e) {
        if (e.response) {
            console.error("Error Status:", e.response.status);
            console.error("Error Data:", e.response.data);
        } else {
            console.error("Error:", e.message);
        }
    }
}

test();
