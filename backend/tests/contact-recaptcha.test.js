import test from 'node:test';
import assert from 'node:assert/strict';
import ContactApi, { RecaptchaRejected } from '../API/API/contact.api.js';

function rig(assessment) {
    const api = new ContactApi({});
    api.createAssessment = assessment;
    api.isBanned = () => false;
    const sent = [];
    api.sendConfirmationEmail = async (m) => void sent.push(m);
    const result = {};
    const res = {
        status(code) { result.status = code; return this; },
        json(body) { result.body = body; return this; },
    };
    const req = { body: { name: 'N', email: 'a@example.com', message: 'hello', recaptchaToken: 'x' }, query: {}, ip: '203.0.113.9', get: () => 'cubingtools.de' };
    return { api, req, res, result, sent };
}

test('a token that reCAPTCHA rejects is refused (it used to be waved through as "not configured")', async () => {
    const { api, req, res, result, sent } = rig(async () => { throw new RecaptchaRejected('token invalid: MALFORMED'); });
    await api.handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'reCAPTCHA verification failed');
    assert.equal(sent.length, 0);
});

test('a low score is refused, a good score is accepted', async () => {
    let r = rig(async () => 0.1);
    await r.api.handleRequest(r.req, r.res);
    await new Promise((x) => setTimeout(x, 20));
    assert.equal(r.result.status, 400);
    r = rig(async () => 0.9);
    await r.api.handleRequest(r.req, r.res);
    await new Promise((x) => setTimeout(x, 20));
    assert.equal(r.result.body.success, true);
    assert.equal(r.sent.length, 1);
});

test('only "verification not configured" (null) and provider outages fail open', async () => {
    let r = rig(async () => null);
    await r.api.handleRequest(r.req, r.res);
    await new Promise((x) => setTimeout(x, 20));
    assert.equal(r.result.body?.success, true);
    r = rig(async () => { throw new Error('network down'); });
    await r.api.handleRequest(r.req, r.res);
    await new Promise((x) => setTimeout(x, 20));
    assert.equal(r.result.body?.success, true);
});
