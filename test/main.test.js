const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';

const { buildActivity, publishActivity } = require('../src/main');

async function publishedPayload(input) {
  let sentPayload;
  const client = {
    request(_command, payload) {
      sentPayload = payload;
      return Promise.resolve();
    }
  };

  await publishActivity(client, buildActivity(input));
  return sentPayload;
}

test('omits timestamps when elapsed time is disabled', async () => {
  const payload = await publishedPayload({ showTimestamp: false });

  assert.equal(Object.hasOwn(payload.activity, 'timestamps'), false);
});

test('publishes a start timestamp when elapsed time is enabled', async () => {
  const before = Date.now();
  const payload = await publishedPayload({ showTimestamp: true });
  const after = Date.now();

  assert.ok(payload.activity.timestamps.start >= before);
  assert.ok(payload.activity.timestamps.start <= after);
});

test('backdates the start timestamp by the configured elapsed time', async () => {
  const offset = (2 * 3600 + 3 * 60 + 4) * 1000;
  const before = Date.now() - offset;
  const payload = await publishedPayload({
    showTimestamp: true,
    elapsedHours: '2',
    elapsedMinutes: '3',
    elapsedSeconds: '4'
  });
  const after = Date.now() - offset;

  assert.ok(payload.activity.timestamps.start >= before);
  assert.ok(payload.activity.timestamps.start <= after);
});

test('rejects an invalid elapsed time', () => {
  assert.throws(
    () => buildActivity({ showTimestamp: true, elapsedMinutes: '60' }),
    /Elapsed minutes must be between 0 and 59/
  );
});

test('does not treat a string value as an enabled timestamp toggle', async () => {
  const payload = await publishedPayload({ showTimestamp: 'false' });

  assert.equal(Object.hasOwn(payload.activity, 'timestamps'), false);
});

test('publishes state as both the selected display field and compatibility name', async () => {
  const payload = await publishedPayload({
    statusDisplayType: '1',
    state: 'Building a feature',
    details: 'Discord Presence'
  });

  assert.equal(payload.activity.status_display_type, 1);
  assert.equal(payload.activity.name, 'Building a feature');
});

test('publishes details as both the selected display field and compatibility name', async () => {
  const payload = await publishedPayload({
    statusDisplayType: '2',
    state: 'In the editor',
    details: 'Fixing display text'
  });

  assert.equal(payload.activity.status_display_type, 2);
  assert.equal(payload.activity.name, 'Fixing display text');
});

test('leaves the application name under Discord control by default', async () => {
  const payload = await publishedPayload({
    statusDisplayType: '0',
    state: 'In the editor',
    details: 'Discord Presence'
  });

  assert.equal(payload.activity.status_display_type, 0);
  assert.equal(Object.hasOwn(payload.activity, 'name'), false);
});

test('publishes independent custom display text as the activity name', async () => {
  const payload = await publishedPayload({
    statusDisplayType: 'custom',
    displayText: 'A separate display line',
    state: 'Unchanged state',
    details: 'Unchanged details'
  });

  assert.equal(payload.activity.status_display_type, 0);
  assert.equal(payload.activity.name, 'A separate display line');
  assert.equal(payload.activity.state, 'Unchanged state');
  assert.equal(payload.activity.details, 'Unchanged details');
});

test('passes external image URLs through to Discord activity assets', async () => {
  const payload = await publishedPayload({
    largeImageKey: 'https://example.com/large.webp',
    smallImageKey: 'https://example.com/small.gif'
  });

  assert.equal(payload.activity.assets.large_image, 'https://example.com/large.webp');
  assert.equal(payload.activity.assets.small_image, 'https://example.com/small.gif');
});
