const assert = require('node:assert/strict');
const test = require('node:test');

const state = require('../src/renderer/presence-state');

test('migrates a flat configuration into a default preset', () => {
  const workspace = state.normalizeWorkspace({
    clientId: '123456789012345678',
    discordRelease: 'stable',
    details: 'Migrated details',
    elapsedHours: '1',
    elapsedMinutes: '2',
    elapsedSeconds: '3'
  }, 1000);

  assert.equal(workspace.version, 2);
  assert.deepEqual(workspace.connection, {
    clientId: '123456789012345678',
    discordRelease: 'stable'
  });
  assert.equal(workspace.presets.length, 1);
  assert.equal(workspace.presets[0].fields.details, 'Migrated details');
  assert.equal(workspace.presets[0].fields.clientId, undefined);
  assert.equal(workspace.presets[0].fields.discordRelease, undefined);
  assert.equal(workspace.presets[0].timeline.elapsedSeconds, 3723);
  assert.equal(workspace.presets[0].timeline.running, false);
});

test('promotes the active preset connection into global workspace state', () => {
  const workspace = state.normalizeWorkspace({
    version: 2,
    activePresetId: 'second',
    presets: [
      {
        id: 'first',
        name: 'First',
        fields: { clientId: '111111111111111111', discordRelease: 'canary' }
      },
      {
        id: 'second',
        name: 'Second',
        fields: { clientId: '222222222222222222', discordRelease: 'ptb' }
      }
    ]
  });

  assert.deepEqual(workspace.connection, {
    clientId: '222222222222222222',
    discordRelease: 'ptb'
  });
  workspace.presets.forEach((preset) => {
    assert.equal(preset.fields.clientId, undefined);
    assert.equal(preset.fields.discordRelease, undefined);
  });
});

test('preserves an existing global connection instead of preset copies', () => {
  const workspace = state.normalizeWorkspace({
    version: 2,
    connection: {
      clientId: '333333333333333333',
      discordRelease: 'stable'
    },
    activePresetId: 'one',
    presets: [{
      id: 'one',
      name: 'One',
      fields: { clientId: '111111111111111111', discordRelease: 'canary' }
    }]
  });

  assert.deepEqual(workspace.connection, {
    clientId: '333333333333333333',
    discordRelease: 'stable'
  });
});

test('keeps independent elapsed timelines for each preset', () => {
  const first = state.createPreset('First', {}, 1000);
  const second = state.createPreset('Second', {}, 1000);
  state.setTimelineElapsed(first, 10, 1000);
  state.setTimelineElapsed(second, 90, 1000);
  state.resumeTimeline(first, 1000);

  assert.equal(state.currentElapsedSeconds(first, 6000), 15);
  assert.equal(state.currentElapsedSeconds(second, 6000), 90);
});

test('pauses and resumes without losing elapsed time', () => {
  const preset = state.createPreset('Timeline', {}, 1000);
  state.setTimelineElapsed(preset, 30, 1000);
  state.resumeTimeline(preset, 1000);
  state.pauseTimeline(preset, 6500);

  assert.equal(state.currentElapsedSeconds(preset, 20000), 35);

  state.resumeTimeline(preset, 20000);
  assert.equal(state.currentElapsedSeconds(preset, 23000), 38);
});

test('switches the running timeline exclusively to the active preset', () => {
  const first = state.createPreset('First', {}, 1000);
  const second = state.createPreset('Second', {}, 1000);
  state.setTimelineElapsed(first, 10, 1000);
  state.setTimelineElapsed(second, 20, 1000);
  state.resumeTimeline(first, 1000);
  const workspace = {
    activePresetId: first.id,
    presets: [first, second]
  };

  state.switchActivePreset(workspace, second.id, 6000);

  assert.equal(workspace.activePresetId, second.id);
  assert.equal(first.timeline.running, false);
  assert.equal(state.currentElapsedSeconds(first, 9000), 15);
  assert.equal(second.timeline.running, true);
  assert.equal(state.currentElapsedSeconds(second, 9000), 23);
});

test('keeps the selected timer paused when switching from a paused preset', () => {
  const first = state.createPreset('First', {}, 1000);
  const second = state.createPreset('Second', {}, 1000);
  state.resumeTimeline(second, 1000);
  const workspace = {
    activePresetId: first.id,
    presets: [first, second]
  };

  state.switchActivePreset(workspace, second.id, 6000);

  assert.equal(first.timeline.running, false);
  assert.equal(second.timeline.running, false);
});

test('normalizes a saved running timeline using its persisted anchor', () => {
  const workspace = state.normalizeWorkspace({
    version: 2,
    activePresetId: 'one',
    presets: [{
      id: 'one',
      name: 'One',
      fields: { details: 'Saved' },
      timeline: { elapsedSeconds: 50, running: true, updatedAt: 1000 }
    }]
  }, 5000);

  assert.equal(state.currentElapsedSeconds(workspace.presets[0], 5000), 54);
});

test('stops background timers when loading saved presets', () => {
  const workspace = state.normalizeWorkspace({
    version: 2,
    activePresetId: 'one',
    presets: [
      {
        id: 'one',
        name: 'One',
        fields: {},
        timeline: { elapsedSeconds: 10, running: true, updatedAt: 1000 }
      },
      {
        id: 'two',
        name: 'Two',
        fields: {},
        timeline: { elapsedSeconds: 20, running: true, updatedAt: 1000 }
      }
    ]
  }, 5000);

  assert.equal(workspace.presets[0].timeline.running, true);
  assert.equal(workspace.presets[1].timeline.running, false);
  assert.equal(state.currentElapsedSeconds(workspace.presets[1], 9000), 24);
});

test('enables timestamps when migrating older serialized data', () => {
  const workspace = state.normalizeWorkspace({ showTimestamp: 'false' }, 1000);

  assert.equal(workspace.presets[0].fields.showTimestamp, true);
});

test('stores custom display text independently in each preset', () => {
  const preset = state.createPreset('Custom', {
    statusDisplayType: 'custom',
    displayText: 'Separate status text',
    state: 'State value',
    details: 'Details value'
  });

  assert.equal(preset.fields.displayText, 'Separate status text');
  assert.equal(preset.fields.state, 'State value');
  assert.equal(preset.fields.details, 'Details value');
});

test('migrates a selected details display line into the independent name field', () => {
  const workspace = state.normalizeWorkspace({
    statusDisplayType: '2',
    displayText: '',
    details: 'Previously displayed details',
    state: 'Separate state'
  });

  assert.equal(workspace.presets[0].fields.statusDisplayType, 'custom');
  assert.equal(workspace.presets[0].fields.displayText, 'Previously displayed details');
  assert.equal(workspace.presets[0].fields.details, 'Previously displayed details');
  assert.equal(workspace.presets[0].fields.state, 'Separate state');
});

test('preserves a valid idling preset and source preset selection', () => {
  const workspace = state.normalizeWorkspace({
    version: 2,
    activePresetId: 'idle',
    idlePresetId: 'idle',
    idlingForPresetId: 'active',
    presets: [
      { id: 'active', name: 'Active', fields: {} },
      { id: 'idle', name: 'Idling', fields: {} }
    ]
  });

  assert.equal(workspace.activePresetId, 'idle');
  assert.equal(workspace.idlePresetId, 'idle');
  assert.equal(workspace.idlingForPresetId, 'active');
});

test('clears an inconsistent idling transition', () => {
  const workspace = state.normalizeWorkspace({
    version: 2,
    activePresetId: 'active',
    idlePresetId: 'idle',
    idlingForPresetId: 'active',
    presets: [
      { id: 'active', name: 'Active', fields: {} },
      { id: 'idle', name: 'Idling', fields: {} }
    ]
  });

  assert.equal(workspace.idlingForPresetId, '');
});
