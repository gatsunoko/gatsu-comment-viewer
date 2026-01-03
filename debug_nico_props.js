import axios from 'axios';
import fs from 'fs';

async function debugProps() {
    // Use the ID provided by the user: lv349554474
    // or a known active one if that's offline.
    const url = 'https://live.nicovideo.jp/watch/lv349554474';
    console.log(`Fetching ${url}...`);

    try {
        const pageRes = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = pageRes.data;

        const match = html.match(/id="embedded-data".*?data-props="([^"]+)"/);
        if (match) {
            const props = JSON.parse(decodeURIComponent(match[1]).replace(/&quot;/g, '"'));
            console.log("Found embedded-data.");

            // Save to file for inspection
            fs.writeFileSync('nico_props_dump.json', JSON.stringify(props, null, 2));
            console.log("Saved to nico_props_dump.json");

            // Check specifically for connection info
            if (props.site && props.site.relive) {
                console.log("site.relive keys:", Object.keys(props.site.relive));
                console.log("webSocketUrl:", props.site.relive.webSocketUrl);
            } else {
                console.log("No props.site.relive found.");
            }

        } else {
            console.log("Could not find embedded-data in HTML.");
            // Try script tag
            const jsonMatch = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
            if (jsonMatch) {
                const props = JSON.parse(jsonMatch[1]);
                fs.writeFileSync('nico_props_dump.json', JSON.stringify(props, null, 2));
                console.log("Saved to nico_props_dump.json (from script tag)");
            }
        }
    } catch (e) {
        console.error(e);
    }
}

debugProps();
