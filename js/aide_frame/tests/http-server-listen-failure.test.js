'use strict';
/**
 * A failing listen() must REJECT — never hang.
 *
 * `HttpServer.start()` returns a promise that used to resolve only from the `listening`
 * callback, with no `error` handler on the server. When `listen()` failed — the everyday
 * case being EADDRINUSE, a second instance on the same port — three things happened at once:
 *
 *   1. the `listening` callback never fired, so the promise neither resolved NOR rejected:
 *      it dangled forever, and the caller's `.then(...)` never ran;
 *   2. the server emitted an unhandled `'error'`, which became an uncaughtException;
 *   3. winston's uncaughtException handler logged it and left the process ALIVE.
 *
 * The result is a zombie: fully booted, holding the system's `server.lock`, reported
 * "online" by pm2 — and serving nothing. Worse, it then blocks the next start, which is
 * correctly refused with the CR #55 lock message, so the symptom presents as a completely
 * different problem. (Lehrgeld 2026-07-20: five failed attempts to seed a system on a
 * remote box, each one leaving the zombie that broke the next.)
 *
 * aide-rap's rap.js already states the intended rule for the sibling case — a failure in
 * backend.init() — verbatim: "A startup error from this point is fatal: log a concise
 * reason without a stack trace and exit non-zero. The default winston uncaughtException
 * handler would otherwise log the trace and leave the process running, which silently
 * breaks ./run-style supervisor wrappers." A dead listener is exactly that kind of
 * unrecoverable startup failure; it was simply never wired to the same treatment.
 *
 * So: assert the promise REJECTS, and that the rejection names the port and the cause —
 * an operator reading "EADDRINUSE :18349" fixes it in seconds; one reading nothing at all
 * goes hunting for hours.
 *
 * Run:  npm test   (node --test tests/)
 */

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');

const { HttpServer } = require('../src/http-server');

/** Occupy a port so the next listen() on it must fail. */
function occupy() {
    return new Promise((resolve, reject) => {
        const blocker = net.createServer();
        blocker.once('error', reject);
        blocker.listen(0, '0.0.0.0', () => resolve({ port: blocker.address().port, blocker }));
    });
}

test('start() rejects when the port is already in use (never hangs)', async () => {
    const { port, blocker } = await occupy();
    try {
        const server = new HttpServer({ port });

        // The bug was an unsettled promise, so a plain `await` would hang the test run
        // forever rather than fail it. Race against a timer: losing the race IS the failure.
        const outcome = await Promise.race([
            server.start().then(() => 'resolved', (err) => err),
            new Promise((r) => setTimeout(() => r('HUNG'), 4000)),
        ]);

        assert.notStrictEqual(outcome, 'HUNG',
            'start() neither resolved nor rejected — the promise dangles, the caller never ' +
            'runs, and the process survives as a zombie that serves nothing while holding the lock');
        assert.notStrictEqual(outcome, 'resolved',
            'start() reported success although the port could not be bound');

        assert.ok(outcome instanceof Error, `expected an Error, got ${typeof outcome}`);
        assert.match(String(outcome.message), /EADDRINUSE|address already in use/i,
            'the rejection must name the cause so the operator sees it without a stack dive');
        assert.match(String(outcome.message), new RegExp(String(port)),
            'the rejection must name the port that could not be bound');
    } finally {
        blocker.close();
    }
});

test('start() still resolves on a free port', async () => {
    // The counter-case: a guard that rejects unconditionally would "pass" the test above
    // and break every real startup.
    const server = new HttpServer({ port: 0 });
    await server.start();
    assert.ok(server.isRunning?.() ?? true, 'server should report running after a successful start');
    server.stop();
});
