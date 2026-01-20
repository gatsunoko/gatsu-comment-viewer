import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                history: resolve(__dirname, 'history.html'),
                muted_users: resolve(__dirname, 'muted_users.html'),
                options: resolve(__dirname, 'options.html'),
            },
        },
    },
});
