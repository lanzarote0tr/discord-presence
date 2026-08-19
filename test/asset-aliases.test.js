const assert = require('node:assert/strict');
const test = require('node:test');

const aliases = require('../src/asset-aliases');

test('resolves explicit built-in icons to public PNG URLs', () => {
  const vscode = aliases.resolve('icon:vscode');
  const javascript = aliases.resolve('icon:javascript');

  assert.match(vscode, /^https:\/\/images\.weserv\.nl\//);
  assert.match(vscode, /vscode-original\.svg/);
  assert.match(vscode, /output=png/);
  assert.match(javascript, /javascript-original\.svg/);
});

test('resolves aliases case-insensitively', () => {
  assert.equal(aliases.canonicalKeyword(' JS '), 'javascript');
  assert.equal(aliases.canonicalKeyword('Visual-Studio-Code'), 'vscode');
  assert.equal(aliases.resolve('icon:TS'), aliases.resolve('icon:typescript'));
});

test('replaces repository icon phrases with raw GitHub URLs', () => {
  const terminal = 'https://raw.githubusercontent.com/lanzarote0tr/discord-presence/main/Terminalicon3.png';
  const neovim = 'https://raw.githubusercontent.com/lanzarote0tr/discord-presence/main/neovim-mark.png';

  assert.equal(aliases.resolve('terminal'), terminal);
  assert.equal(aliases.resolve('Terminalicon3.png'), terminal);
  assert.equal(aliases.resolve('NEOVIM'), neovim);
  assert.equal(aliases.resolve('nvim'), neovim);
});

test('preserves URLs and unrecognized uploaded asset keys', () => {
  assert.equal(aliases.resolve('https://example.com/icon.png'), 'https://example.com/icon.png');
  assert.equal(aliases.resolve('my-portal-asset'), 'my-portal-asset');
  assert.equal(aliases.resolve('vscode'), 'vscode');
  assert.equal(aliases.resolve('javascript'), 'javascript');
});

test('accepts an explicit portal asset prefix', () => {
  assert.equal(aliases.resolve('asset:vscode'), 'vscode');
  assert.equal(aliases.resolve('ASSET:javascript'), 'javascript');
  assert.equal(aliases.resolve('asset:terminal'), 'terminal');
});

test('previews familiar portal keys with matching built-in artwork', () => {
  assert.match(aliases.preview('vscode'), /vscode-original\.svg/);
  assert.match(aliases.preview('javascript'), /javascript-original\.svg/);
  assert.equal(aliases.preview('my-portal-asset'), 'my-portal-asset');
});
