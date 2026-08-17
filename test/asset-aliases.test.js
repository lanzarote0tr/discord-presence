const assert = require('node:assert/strict');
const test = require('node:test');

const aliases = require('../src/asset-aliases');

test('resolves built-in asset keywords to public PNG URLs', () => {
  const vscode = aliases.resolve('vscode');
  const javascript = aliases.resolve('javascript');

  assert.match(vscode, /^https:\/\/images\.weserv\.nl\//);
  assert.match(vscode, /vscode-original\.svg/);
  assert.match(vscode, /output=png/);
  assert.match(javascript, /javascript-original\.svg/);
});

test('resolves aliases case-insensitively', () => {
  assert.equal(aliases.canonicalKeyword(' JS '), 'javascript');
  assert.equal(aliases.canonicalKeyword('Visual-Studio-Code'), 'vscode');
  assert.equal(aliases.resolve('TS'), aliases.resolve('typescript'));
});

test('preserves URLs and unrecognized uploaded asset keys', () => {
  assert.equal(aliases.resolve('https://example.com/icon.png'), 'https://example.com/icon.png');
  assert.equal(aliases.resolve('my-portal-asset'), 'my-portal-asset');
});

test('allows a built-in keyword to be forced back to a portal asset key', () => {
  assert.equal(aliases.resolve('asset:vscode'), 'vscode');
  assert.equal(aliases.resolve('ASSET:javascript'), 'javascript');
});
