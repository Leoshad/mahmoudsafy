import {defineConfig} from 'vite';
export default defineConfig({build:{outDir:'dist-preview',modulePreload:false,rollupOptions:{input:'preview.html'}}});
