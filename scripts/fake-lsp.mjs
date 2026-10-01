#!/usr/bin/env node
/**
 * Protocol-conformant fake LSP server for scripts/verify-lsp.mjs.
 *
 * Speaks Content-Length framing on stdio and exercises every path the real
 * client must handle: initialize handshake, a server→client request
 * (client/registerCapability) that must be answered, incremental document
 * sync, diagnostics published with deliberately SPLIT frame writes (header
 * torn mid-line), two frames batched in one write, and graceful shutdown.
 *
 * Every message received (and sent request ids) is appended to a JSONL log
 * file so the harness can assert on the exact protocol traffic.
 */
import fs from "node:fs";
import path from "node:path";

const logPath =
  process.env.FAKE_LSP_LOG || path.join(process.cwd(), "fake-lsp-log.jsonl");
const log = (entry) => {
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch {
    /* harness gone — keep serving */
  }
};

let buf = Buffer.alloc(0);

function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`
  );
}

let nextId = 9000;
const openDocs = new Map();

function handle(msg) {
  log({ received: msg });
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        capabilities: {
          // Incremental sync on purpose: the client must express full-text
          // rewrites as a range edit covering the previous buffer.
          textDocumentSync: {
            openClose: true,
            change: 2,
            save: { includeText: false },
          },
          hoverProvider: true,
        },
        serverInfo: { name: "fake-lsp", version: "0.0.1" },
      },
    });
    return;
  }
  if (msg.method === "initialized") {
    const id = nextId++;
    log({ sentRegisterId: id });
    send({
      jsonrpc: "2.0",
      id,
      method: "client/registerCapability",
      params: {
        registrations: [
          { id: "fake-reg", method: "textDocument/didOpen", registerOptions: {} },
        ],
      },
    });
    return;
  }
  if (msg.method === "textDocument/didOpen") {
    const d = msg.params.textDocument;
    openDocs.set(d.uri, d.text);
    const diag = {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: 1,
      code: "FAKE1",
      source: "fake-lsp",
      message: "fake error",
    };
    const json = JSON.stringify({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: d.uri, version: d.version, diagnostics: [diag] },
    });
    const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
    // Tear the frame across writes — including mid-header — to torture the
    // parser: it must buffer until the whole frame is present.
    setTimeout(() => process.stdout.write(header.slice(0, 10)), 10);
    setTimeout(
      () => process.stdout.write(header.slice(10) + json.slice(0, 20)),
      45
    );
    setTimeout(() => process.stdout.write(json.slice(20)), 80);
    return;
  }
  if (msg.method === "textDocument/didChange") {
    const { textDocument, contentChanges } = msg.params;
    const last = contentChanges[contentChanges.length - 1];
    openDocs.set(textDocument.uri, last.text);
    send({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: textDocument.uri,
        version: textDocument.version,
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            severity: 2,
            code: "FAKE2",
            source: "fake-lsp",
            message: `chars:${last.text.length}`,
          },
        ],
      },
    });
    // Two complete frames batched into a single stdout write.
    const m1 = JSON.stringify({
      jsonrpc: "2.0",
      method: "window/logMessage",
      params: { type: 4, message: "fake: change processed" },
    });
    const m2 = JSON.stringify({
      jsonrpc: "2.0",
      method: "window/logMessage",
      params: { type: 1, message: "fake: deliberate error line" },
    });
    process.stdout.write(
      `Content-Length: ${Buffer.byteLength(m1, "utf8")}\r\n\r\n${m1}` +
        `Content-Length: ${Buffer.byteLength(m2, "utf8")}\r\n\r\n${m2}`
    );
    return;
  }
  if (msg.method === "shutdown") {
    send({ jsonrpc: "2.0", id: msg.id, result: null });
    return;
  }
  if (msg.method === "exit") {
    log({ exiting: true });
    process.exit(0);
  }
  if (msg.id !== undefined && msg.method === undefined) {
    log({ clientResponse: msg });
    return;
  }
  // didSave / didClose / anything else: already logged as `received`.
}

process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const idx = buf.indexOf("\r\n\r\n");
    if (idx === -1) return;
    const header = buf.subarray(0, idx).toString("ascii");
    const m = /content-length:\s*(\d+)/i.exec(header);
    if (!m) {
      buf = buf.subarray(idx + 4);
      continue;
    }
    const len = parseInt(m[1], 10);
    if (buf.length < idx + 4 + len) return;
    const body = buf.subarray(idx + 4, idx + 4 + len).toString("utf8");
    buf = buf.subarray(idx + 4 + len);
    try {
      handle(JSON.parse(body));
    } catch (e) {
      log({ parseError: String(e) });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
