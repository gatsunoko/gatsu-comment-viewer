import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export class NiconicoClient {
    private onMessage: (msg: any) => void;
    private unlisten: UnlistenFn | null = null;
    private activeUrl: string | null = null;

    constructor(onMessage: (msg: any) => void) {
        this.onMessage = onMessage;
        this.setupListener();
    }

    private async setupListener() {
        this.unlisten = await listen('comment', (event: any) => {
            this.onMessage(event.payload);
        });
    }

    async join(url: string) {
        if (this.activeUrl === url) return;

        try {
            console.log(`[NicoClient] Joining ${url} via Rust`);
            await invoke('connect_niconico', { url });
            this.activeUrl = url;
        } catch (e) {
            console.error('[NicoClient] Join Error', e);
            this.onMessage({ author: 'System', message: `Join Error: ${e}` });
        }
    }

    async leave() {
        if (this.activeUrl) {
            try {
                await invoke('disconnect_niconico');
                this.activeUrl = null;
            } catch (e) {
                console.error('[NicoClient] Leave Error', e);
            }
        }
    }

    async destroy() {
        await this.leave();
        if (this.unlisten) {
            this.unlisten();
        }
    }
}
