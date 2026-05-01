/**
 * BIP352 Stealth Address unit tests
 * Tests: round-trip send/scan, key recovery, determinism, edge cases
 */

import assert from 'assert';
import { secp256k1 } from '@noble/curves/secp256k1';
import { stealthSend, stealthScan, stealthPriv, b2h, h2b } from '../src/stealth/index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── Fixed test keys ────────────────────────────────────────────────────────
const scanPriv  = h2b('0101010101010101010101010101010101010101010101010101010101010101');
const spendPriv = h2b('0202020202020202020202020202020202020202020202020202020202020202');
const senderPriv = h2b('0303030303030303030303030303030303030303030303030303030303030303');

const scanPub  = secp256k1.getPublicKey(scanPriv, true);
const spendPub = secp256k1.getPublicKey(spendPriv, true);

console.log('\nBIP352 Stealth Address Tests\n');

// ─── Test 1: Basic round-trip ────────────────────────────────────────────────
test('send → scan round-trip (output is found)', () => {
  const { pub, senderPub } = stealthSend(scanPub, spendPub, senderPriv);
  const found = stealthScan({ scanPriv, spendPub }, senderPub, pub);
  assert.strictEqual(found, true, 'recipient should find the output');
});

// ─── Test 2: Wrong output pubkey not matched ──────────────────────────────────
test('wrong output pubkey is NOT matched', () => {
  const { senderPub } = stealthSend(scanPub, spendPub, senderPriv);
  const wrongPriv = h2b('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  const wrongPub  = secp256k1.getPublicKey(wrongPriv, true);
  const found     = stealthScan({ scanPriv, spendPub }, senderPub, wrongPub);
  assert.strictEqual(found, false, 'wrong key should not match');
});

// ─── Test 3: Key recovery ────────────────────────────────────────────────────
test('recovered private key matches output pubkey', () => {
  const { pub, senderPub } = stealthSend(scanPub, spendPub, senderPriv);
  const priv       = stealthPriv({ scanPriv, spendPriv }, senderPub);
  const recoveredPub = secp256k1.getPublicKey(priv, true);
  assert.strictEqual(b2h(recoveredPub), b2h(pub), 'recovered priv → pub should match output');
});

// ─── Test 4: Determinism ─────────────────────────────────────────────────────
test('stealthSend is deterministic (same inputs → same output)', () => {
  const r1 = stealthSend(scanPub, spendPub, senderPriv);
  const r2 = stealthSend(scanPub, spendPub, senderPriv);
  assert.strictEqual(b2h(r1.pub), b2h(r2.pub), 'output pub must be deterministic');
  assert.strictEqual(b2h(r1.senderPub), b2h(r2.senderPub), 'sender pub must be deterministic');
});

// ─── Test 5: Different senders produce different outputs ──────────────────────
test('different sender keys produce different stealth outputs', () => {
  const senderPriv2 = h2b('0404040404040404040404040404040404040404040404040404040404040404');
  const r1 = stealthSend(scanPub, spendPub, senderPriv);
  const r2 = stealthSend(scanPub, spendPub, senderPriv2);
  assert.notStrictEqual(b2h(r1.pub), b2h(r2.pub), 'different senders → different outputs');
});

// ─── Test 6: Different recipients produce different outputs ───────────────────
test('different recipient keys produce different stealth outputs', () => {
  const scanPriv2  = h2b('0505050505050505050505050505050505050505050505050505050505050505');
  const spendPriv2 = h2b('0606060606060606060606060606060606060606060606060606060606060606');
  const scanPub2   = secp256k1.getPublicKey(scanPriv2, true);
  const spendPub2  = secp256k1.getPublicKey(spendPriv2, true);

  const r1 = stealthSend(scanPub, spendPub, senderPriv);
  const r2 = stealthSend(scanPub2, spendPub2, senderPriv);
  assert.notStrictEqual(b2h(r1.pub), b2h(r2.pub), 'different recipients → different outputs');
});

// ─── Test 7: Output pubkey is a valid compressed secp256k1 point ─────────────
test('output pubkey is a valid compressed secp256k1 point', () => {
  const { pub } = stealthSend(scanPub, spendPub, senderPriv);
  assert.strictEqual(pub.length, 33, 'compressed pubkey must be 33 bytes');
  assert.ok(pub[0] === 0x02 || pub[0] === 0x03, 'must start with 0x02 or 0x03');
  // Verify it parses without throwing
  secp256k1.ProjectivePoint.fromHex(pub);
});

// ─── Test 8: Wrong scan key does not find the output ─────────────────────────
test('wrong scan private key does NOT find the output', () => {
  const { pub, senderPub } = stealthSend(scanPub, spendPub, senderPriv);
  const wrongScanPriv = h2b('1111111111111111111111111111111111111111111111111111111111111111');
  const found = stealthScan({ scanPriv: wrongScanPriv, spendPub }, senderPub, pub);
  assert.strictEqual(found, false, 'wrong scan key should not find the output');
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(45)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
