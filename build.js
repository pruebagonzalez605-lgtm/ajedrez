const esbuild = require('esbuild');
const fs = require('fs');
fs.mkdirSync('dist', { recursive: true });
for (const file of ['index.html', 'config.js']) fs.copyFileSync(file, 'dist/' + file);
fs.copyFileSync('index.html', 'dist/ajedrez.html');
esbuild.buildSync({ entryPoints: ['src/app.js'], bundle: true, minify: true, sourcemap: true, outdir: 'dist/assets', target: ['es2020'], metafile: true });
