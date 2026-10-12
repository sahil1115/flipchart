// Suppress only Vite's advisory about a possible future native config loader.
process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true';
await import('../node_modules/vite/bin/vite.js');
