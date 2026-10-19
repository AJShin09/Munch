import http from 'node:http';
const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:4173';
const t = await (await fetch(CDP + '/json/new?' + encodeURIComponent(APP), { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.type + ': ' + (m.params.args || []).map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + m.params.exceptionDetails.text);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
// send with timeout -> detects a frozen (non-responsive) renderer
const send = (method, params = {}, ms = 6000) => new Promise((resolve) => {
  const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ __timeout: true }); } }, ms);
});
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.__timeout) return '__TIMEOUT__'; return r.result?.result?.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await new Promise(r => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(3500);
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Lexer/i.test(x.textContent)); if(b) b.click(); })()`);
await sleep(1000);

console.log('responsive before click:', await ev(`1+1`));
const box = JSON.parse(await ev(`(() => { const b=document.querySelector('.source-textarea').getBoundingClientRect(); return JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height}); })()`));
const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
console.log('textarea center:', cx, cy);

await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 }, 3000);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 }, 3000);
await sleep(800);
console.log('responsive after click:', await ev(`1+1`));
console.log('activeElement:', await ev(`(document.activeElement && (document.activeElement.className || document.activeElement.tagName)) || 'none'`));

// now type a character and check responsiveness
await send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'x', key: 'x', unmodifiedText: 'x' }, 3000);
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'x' }, 3000);
await sleep(800);
console.log('responsive after typing:', await ev(`1+1`));
console.log('source length:', await ev(`(() => { const ta=document.querySelector('.source-textarea'); return ta ? ta.value.length : null; })()`));
console.log('errors:', errors.slice(0, 8));
ws.close();
