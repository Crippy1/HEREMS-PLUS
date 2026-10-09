import fs from 'node:fs';
import vm from 'node:vm';
// Fail early if an upload omitted the serverless files or their configuration.
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
if(!config.functions?.['api/gateway.js']) throw new Error('Vercel function must be configured as api/gateway.js');
for(const file of ['api/gateway.js','lib/handler.mjs','netlify/functions/gateway.mjs']){
  if(!fs.existsSync(file)) throw new Error('Incomplete deployment upload: missing '+file);
}
const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes("APP_BUILD='R220'")) throw new Error('Unexpected app release');
let count = 0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/src\s*=|application\/(?:json|ld\+json)/i.test(m[1])) continue;
  new vm.Script(m[2], {filename: `inline-${++count}.js`});
}
new vm.Script(fs.readFileSync('sw.js', 'utf8'));
fs.rmSync('public', {recursive:true, force:true});
fs.mkdirSync('public');
for (const file of ['index.html','sw.js','manifest.webmanifest']) fs.copyFileSync(file, `public/${file}`);
fs.cpSync('icons','public/icons',{recursive:true});
console.log(`R220: ${count} inline scripts checked; public assets built.`);

// Verify the hosting publish directory, not just the source files.
if (!fs.existsSync('public/index.html') || fs.statSync('public/index.html').size === 0) throw new Error('Missing homepage in public build output');
if (fs.readFileSync('public/index.html','utf8') !== html) throw new Error('Homepage output differs from application source');
if (config.outputDirectory !== 'public') throw new Error('Vercel outputDirectory must be public');
console.log('Homepage verified: public/index.html; explicit root route configured.');
