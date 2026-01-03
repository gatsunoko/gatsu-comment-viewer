import axios from 'axios';
import fs from 'fs';

async function testNDGR() {
    try {
        const dump = JSON.parse(fs.readFileSync('nico_props_dump.json', 'utf8'));
        const liveId = dump.program.nicoliveProgramId;
        const audienceToken = dump.site.relive.audienceToken;
        const frontendId = dump.site.frontendId;
        const appVersion = dump.site.frontendVersion;

        console.log(`Testing NDGR fetch for ${liveId} with token ${audienceToken.substring(0, 10)}...`);

        // Try to get segment URI
        // Common pattern for niconico internal APIs
        const url = `https://api.live2.nicovideo.jp/api/v1/watching/segment`;

        console.log(`POST ${url}`);

        const res = await axios.post(url, {
            "payload": {
                "programId": liveId,
                "audienceToken": audienceToken,
                "frontendId": frontendId, // usually 9
                "frontendVersion": appVersion
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Frontend-Id': String(frontendId),
                'X-Frontend-Version': appVersion,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...'
            }
        });

        console.log("Response Status:", res.status);
        console.log("Response Data:", JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) {
            console.error("Data:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

testNDGR();
