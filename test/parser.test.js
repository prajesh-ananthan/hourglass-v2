'use strict';

// Minimal dependency-free test runner for the time parser.
const assert = require('assert');
const { parseInput, formatDuration } = require('../src/timeParser.js');

const NOW = new Date('2026-07-20T10:00:00');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.log('  ✗ ' + name + '\n      ' + err.message);
  }
}

function ms(input) {
  return parseInput(input, NOW).ms;
}

console.log('timeParser');

test('bare number is minutes', () => {
  assert.strictEqual(ms('5'), 5 * 60 * 1000);
  assert.strictEqual(ms('90'), 90 * 60 * 1000);
});

test('mm:ss colon duration', () => {
  assert.strictEqual(ms('5:30'), (5 * 60 + 30) * 1000);
});

test('hh:mm:ss colon duration', () => {
  assert.strictEqual(ms('1:30:00'), (90 * 60) * 1000);
});

test('dd:hh:mm:ss colon duration', () => {
  assert.strictEqual(ms('1:00:00:00'), 86400 * 1000);
});

test('unit durations', () => {
  assert.strictEqual(ms('10m'), 10 * 60 * 1000);
  assert.strictEqual(ms('10 min'), 10 * 60 * 1000);
  assert.strictEqual(ms('1h 30m'), 90 * 60 * 1000);
  assert.strictEqual(ms('1.5 hours'), 90 * 60 * 1000);
  assert.strictEqual(ms('90 seconds'), 90 * 1000);
  assert.strictEqual(ms('2 days'), 2 * 86400 * 1000);
});

test('time of day resolves to future', () => {
  const r = parseInput('5:30 pm', NOW);
  assert.strictEqual(r.type, 'datetime');
  assert.strictEqual(r.target.getHours(), 17);
  assert.strictEqual(r.target.getMinutes(), 30);
});

test('7pm shorthand', () => {
  const r = parseInput('7pm', NOW);
  assert.strictEqual(r.target.getHours(), 19);
});

test('noon and midnight', () => {
  assert.strictEqual(parseInput('noon', NOW).target.getHours(), 12);
  // midnight is next day 00:00
  assert.strictEqual(parseInput('midnight', NOW).target.getHours(), 0);
});

test('time in the past rolls to tomorrow', () => {
  const r = parseInput('9am', NOW); // 9am already passed at 10am
  assert.ok(r.ms > 0);
  assert.strictEqual(r.target.getDate(), 21);
});

test('absolute date-time', () => {
  const r = parseInput('2026-12-31 15:00', NOW);
  assert.strictEqual(r.type, 'datetime');
  assert.ok(r.ms > 0);
});

test('empty input throws', () => {
  assert.throws(() => parseInput('', NOW));
});

test('zero duration throws', () => {
  assert.throws(() => parseInput('0', NOW));
});

test('gibberish throws', () => {
  assert.throws(() => parseInput('not a time', NOW));
});

test('formatDuration formatting', () => {
  assert.strictEqual(formatDuration(5 * 60 * 1000), '5:00');
  assert.strictEqual(formatDuration(90 * 60 * 1000), '1:30:00');
  assert.strictEqual(formatDuration(0), '0:00');
  assert.strictEqual(formatDuration(86400 * 1000), '1:00:00:00');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
