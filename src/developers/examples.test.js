// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PKCE_NODE, PKCE_PYTHON, PKCE_VECTOR, SIGNATURE_HEADER, SIGNATURE_VECTOR, VERIFY_NODE, VERIFY_PHP, VERIFY_PYTHON } from "@/content/developers/examples";

/*
 * The code the Webhooks and Authentication pages show, run as it is: the
 * Node example in Node itself (a child process, not the test runner), and
 * the Python and PHP examples in Python and PHP when this machine has them.
 * Every one must accept the known vector and refuse the same cases.
 */
const dir = mkdtempSync(join(tmpdir(), "moa-devdocs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const V = SIGNATURE_VECTOR;
const T = V.timestamp;
const sign = (body, t = T, secret = V.secret) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

/** [label, body, header, secret, now, expected] */
const CASES = [
  ["the vector", V.body, SIGNATURE_HEADER, V.secret, T + 10, true],
  ["the vector, with spaces after the commas", V.body, `t=${T}, v1=${V.signature}`, V.secret, T, true],
  ["the vector, its signature in capitals", V.body, `t=${T},v1=${V.signature.toUpperCase()}`, V.secret, T, true],
  ["two v1 values, the second the right one", V.body, `t=${T},v1=${"0".repeat(64)},v1=${V.signature}`, V.secret, T, true],
  ["a body changed by one character", V.body.replace("Main gate", "Main Gate"), SIGNATURE_HEADER, V.secret, T, false],
  ["the wrong secret", V.body, SIGNATURE_HEADER, "whsec_not_the_secret", T, false],
  ["a header older than five minutes", V.body, SIGNATURE_HEADER, V.secret, T + 301, false],
  ["a header from more than five minutes ahead", V.body, SIGNATURE_HEADER, V.secret, T - 301, false],
  ["exactly five minutes old", V.body, SIGNATURE_HEADER, V.secret, T + 300, true],
  ["no header", V.body, "", V.secret, T, false],
  ["no timestamp", V.body, `v1=${V.signature}`, V.secret, T, false],
  ["no signature", V.body, `t=${T}`, V.secret, T, false],
  ["a timestamp that isn't a number", V.body, `t=12ab,v1=${V.signature}`, V.secret, T, false],
  ["a signature cut short", V.body, `t=${T},v1=${V.signature.slice(0, 63)}`, V.secret, T, false],
  ["a signature that isn't hex", V.body, `t=${T},v1=${"z".repeat(64)}`, V.secret, T, false],
  ["only a v0 signature", V.body, `t=${T},v0=${V.signature}`, V.secret, T, false],
  ["a body with non-ASCII text", '{"name":"Āsha — ₹499"}', `t=${T},v1=${sign('{"name":"Āsha — ₹499"}')}`, V.secret, T, true],
];
const EXPECTED = CASES.map((c) => c[5]);

const have = (cmd, args) => {
  try {
    return spawnSync(cmd, args, { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
};
const PYTHON = ["/usr/bin/python3", "python3"].find((p) => have(p, ["--version"]));
const PHP = ["php", "/opt/homebrew/bin/php", "/usr/bin/php"].find((p) => have(p, ["--version"]));

describe("the signature vector", () => {
  it("is what HMAC-SHA256 of \"<t>.<raw body>\" with the secret gives", () => {
    expect(sign(V.body)).toBe(V.signature);
    expect(SIGNATURE_HEADER).toBe(`t=1794458702,v1=${V.signature}`);
  });
});

describe("the Node example", () => {
  it("accepts the vector and refuses what it must, run in Node", () => {
    writeFileSync(join(dir, "verify-moa-signature.mjs"), VERIFY_NODE);
    writeFileSync(
      join(dir, "run-node.mjs"),
      `import { verifyMoaSignature } from "./verify-moa-signature.mjs";
const cases = JSON.parse(process.argv[2]);
const out = cases.map(([, body, header, secret, now]) => verifyMoaSignature(Buffer.from(body, "utf8"), header, secret, now));
// A string body works the same as a Buffer.
out.push(verifyMoaSignature(cases[0][1], cases[0][2], cases[0][3], cases[0][4]));
console.log(JSON.stringify(out));`
    );
    const out = JSON.parse(execFileSync(process.execPath, [join(dir, "run-node.mjs"), JSON.stringify(CASES)], { encoding: "utf8" }));
    expect(out).toEqual([...EXPECTED, true]);
  });

  it("uses the current time when none is given (the vector is long past: refused)", () => {
    writeFileSync(join(dir, "verify-moa-signature.mjs"), VERIFY_NODE);
    writeFileSync(
      join(dir, "run-now.mjs"),
      `import { createHmac } from "node:crypto";
import { verifyMoaSignature } from "./verify-moa-signature.mjs";
const [body, secret] = JSON.parse(process.argv[2]);
const t = Math.floor(Date.now() / 1000);
const fresh = \`t=\${t},v1=\${createHmac("sha256", secret).update(\`\${t}.\${body}\`).digest("hex")}\`;
console.log(JSON.stringify([verifyMoaSignature(body, fresh, secret), verifyMoaSignature(body, process.argv[3], secret)]));`
    );
    const out = JSON.parse(execFileSync(process.execPath, [join(dir, "run-now.mjs"), JSON.stringify([V.body, V.secret]), SIGNATURE_HEADER], { encoding: "utf8" }));
    expect(out).toEqual([true, false]);
  });
});

describe.skipIf(!PYTHON)("the Python example", () => {
  it("accepts the vector and refuses what it must, run in Python", () => {
    writeFileSync(join(dir, "verify_moa_signature.py"), VERIFY_PYTHON);
    writeFileSync(
      join(dir, "run_python.py"),
      `import json, sys
sys.path.insert(0, ${JSON.stringify(dir)})
from verify_moa_signature import verify_moa_signature
cases = json.loads(sys.argv[1])
print(json.dumps([verify_moa_signature(body.encode("utf-8"), header, secret, now) for _, body, header, secret, now, _ in cases]))`
    );
    const out = JSON.parse(execFileSync(PYTHON, ["-I", join(dir, "run_python.py"), JSON.stringify(CASES)], { encoding: "utf8" }));
    expect(out).toEqual(EXPECTED);
  });

  it("makes RFC 7636's PKCE challenge", () => {
    writeFileSync(join(dir, "pkce.py"), PKCE_PYTHON);
    const code = `import sys\nsys.path.insert(0, ${JSON.stringify(dir)})\nfrom pkce import pkce_challenge, new_pkce\nv, c = new_pkce()\nprint(pkce_challenge(${JSON.stringify(PKCE_VECTOR.verifier)}), len(v), c == pkce_challenge(v))`;
    expect(execFileSync(PYTHON, ["-I", "-c", code], { encoding: "utf8" }).trim()).toBe(`${PKCE_VECTOR.challenge} 43 True`);
  });
});

describe.skipIf(!PHP)("the PHP example", () => {
  it("accepts the vector and refuses what it must, run in PHP", () => {
    writeFileSync(join(dir, "verify_moa_signature.php"), VERIFY_PHP);
    writeFileSync(
      join(dir, "run_php.php"),
      `<?php
require ${JSON.stringify(join(dir, "verify_moa_signature.php"))};
$cases = json_decode($argv[1], true);
$out = [];
foreach ($cases as $c) { $out[] = verify_moa_signature($c[1], $c[2], $c[3], $c[4]); }
echo json_encode($out);`
    );
    const out = JSON.parse(execFileSync(PHP, [join(dir, "run_php.php"), JSON.stringify(CASES)], { encoding: "utf8" }));
    expect(out).toEqual(EXPECTED);
  });
});

describe("the PKCE example (Node)", () => {
  it("makes RFC 7636's challenge, and a 43-character verifier", () => {
    writeFileSync(join(dir, "pkce.mjs"), PKCE_NODE);
    writeFileSync(
      join(dir, "run-pkce.mjs"),
      `import { newPkce, pkceChallenge } from "./pkce.mjs";
const p = newPkce();
console.log(JSON.stringify([pkceChallenge(${JSON.stringify(PKCE_VECTOR.verifier)}), p.verifier.length, p.challenge === pkceChallenge(p.verifier)]));`
    );
    expect(JSON.parse(execFileSync(process.execPath, [join(dir, "run-pkce.mjs")], { encoding: "utf8" }))).toEqual([PKCE_VECTOR.challenge, 43, true]);
  });
});
