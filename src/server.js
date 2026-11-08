import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { scenarios } from './scenarios.js';
import { startRun, continueRun, fileClaim, tamper, getRun, view } from './engine.js';
import { mode } from './paypal.js';
import { aiMode } from './ai.js';

const PORT = Number(process.env.PORT || 3000);
const publicUrl = () => process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(new URL('../public/index.html', import.meta.url)));
    }
    if (req.method === 'GET' && url.pathname === '/api/scenarios') {
      const list = Object.entries(scenarios).map(([id, s]) => ({ id, title: s.title, summary: s.summary, instruction: s.instruction }));
      return json(res, 200, { scenarios: list, paypalMode: mode(), aiMode: aiMode() });
    }
    if (req.method === 'POST' && url.pathname === '/api/runs') {
      let raw = '';
      for await (const c of req) raw += c;
      return json(res, 201, view(await startRun(JSON.parse(raw || '{}').scenario, publicUrl())));
    }
    if (parts[0] === 'paypal' && parts[1]) {
      const run = getRun(url.searchParams.get('run'));
      if (run && parts[1] === 'return') await continueRun(run);
      if (run && parts[1] === 'cancel') run.status = 'cancelled';
      res.writeHead(302, { location: `/?run=${run?.id ?? ''}` });
      return res.end();
    }
    if (parts[0] === 'api' && parts[1] === 'runs' && parts[2]) {
      const run = getRun(parts[2]);
      if (!run) return json(res, 404, { error: 'That case is no longer in memory. Run it again.' });
      if (req.method === 'GET' && parts[3] === 'evidence') {
        res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="witness-evidence-${run.id}.json"` });
        return res.end(JSON.stringify(view(run), null, 2));
      }
      if (req.method === 'GET' && !parts[3]) return json(res, 200, view(run));
      if (req.method === 'POST' && parts[3] === 'claim') return json(res, 200, view(await fileClaim(run)));
      if (req.method === 'POST' && parts[3] === 'tamper') return json(res, 200, view(tamper(run)));
    }
    json(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error(err);
    json(res, err.status || 500, { error: err.message });
  }
});

if (import.meta.url.endsWith('/src/server.js')) {
  server.listen(PORT, () => console.log(`Witness is running at http://localhost:${PORT} (payments: ${mode()}, AI: ${aiMode()})`));
}
