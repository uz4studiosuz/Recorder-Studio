import { defineConfig } from 'vite';
export default defineConfig({ define: { 'process.env.NODE_ENV': '"production"' }, build: { outDir: '.integration', emptyOutDir: false, lib: { entry: 'scripts/integration-renderer.ts', name: 'RecorderIntegration', formats: ['iife'], fileName: () => 'renderer.js' } } });
