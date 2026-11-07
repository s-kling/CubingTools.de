import http from 'http';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { createWebApp } from '../../web/server.js';
import { loadConfig } from '../../lib/config.js';

/** Serves the real public/ directory (via the real web app) and loads a page into jsdom. */
export async function openPage(urlPath, { apiStub = null, beforeParse = null, wait = 150 } = {}) {
    const server = http.createServer(createWebApp({ config: loadConfig(), logicUrl: null }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];

    // Only same-origin scripts load; CDNs (fonts, Chart.js, analytics) are blocked and stubbed instead.
    class LocalOnly extends ResourceLoader {
        fetch(url, opts) {
            return url.startsWith(origin) ? super.fetch(url, opts) : Promise.resolve(Buffer.from(''));
        }
    }
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => errors.push(e.message));
    virtualConsole.on('error', (...a) => errors.push(a.join(' ')));

    const dom = await JSDOM.fromURL(origin + urlPath, {
        runScripts: 'dangerously',
        resources: new LocalOnly(),
        pretendToBeVisual: true,
        virtualConsole,
        beforeParse(window) {
            window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
            window.scrollTo = () => {};
            // jsdom has no layout engine, so innerText is undefined; the pages only ever read it as text.
            Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
                get() { return this.textContent; },
                set(v) { this.textContent = v; },
            });
            window.alert = (m) => errors.push(`alert: ${m}`);
            window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}) });
            window.Chart = class { constructor() {} destroy() {} update() {} };
            window.TextEncoder = TextEncoder;
            window.TextDecoder = TextDecoder;
            window.fetch = async (url, init) => {
                const u = String(url);
                // Scrambles come from TNoodle/cubing.js on the logic tier, which is not running here.
                if (/\/api\/scramble/.test(u)) {
                    return new Response(JSON.stringify({ scrambles: ["R U R' U'"] }), { status: 200, headers: { 'content-type': 'application/json' } });
                }
                if (apiStub) {
                    const hit = apiStub(u, init);
                    if (hit !== undefined) return new Response(JSON.stringify(hit), { status: 200, headers: { 'content-type': 'application/json' } });
                }
                return fetch(new URL(u, origin), init);
            };
            beforeParse?.(window);
        },
    });
    await new Promise((r) => (dom.window.document.readyState === 'complete' ? r() : dom.window.addEventListener('load', r)));
    await new Promise((r) => setTimeout(r, wait));
    return { dom, window: dom.window, document: dom.window.document, errors, close: async () => {
            await new Promise((r) => setTimeout(r, 120)); // let in-flight page promises settle before tearing the window down
            dom.window.close();
            server.closeAllConnections();
            server.close();
        },
    };
}
