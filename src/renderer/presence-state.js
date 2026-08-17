(function exposePresenceState(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.presenceState = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
  const MAX_ELAPSED_SECONDS = 99999 * 3600 + 59 * 60 + 59;

  const defaultConnection = Object.freeze({
    clientId: '',
    discordRelease: 'canary'
  });

  const defaultFields = Object.freeze({
    activityType: '0',
    statusDisplayType: 'custom',
    displayText: 'Discord Presence',
    details: 'Editing presence.js',
    state: 'Workspace: Discord Presence',
    largeImageKey: 'vscode',
    largeImageText: 'Visual Studio Code',
    smallImageKey: 'javascript',
    smallImageText: 'JavaScript',
    button1Label: '',
    button1Url: '',
    button2Label: '',
    button2Url: '',
    showTimestamp: true
  });

  function normalizeConnection(input = {}, fallback = {}) {
    const connection = {};
    Object.keys(defaultConnection).forEach((key) => {
      const value = input[key] ?? fallback[key] ?? defaultConnection[key];
      connection[key] = String(value);
    });
    return connection;
  }

  function makeId() {
    if (root && root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeFields(input = {}) {
    const fields = { ...defaultFields };
    Object.keys(defaultFields).forEach((key) => {
      if (key === 'showTimestamp') {
        fields[key] = true;
      } else if (input[key] !== undefined && input[key] !== null) {
        fields[key] = String(input[key]);
      }
    });

    if (fields.statusDisplayType !== 'custom') {
      if (!String(input.displayText || '').trim()) {
        if (fields.statusDisplayType === '1') {
          fields.displayText = fields.state;
        } else if (fields.statusDisplayType === '2') {
          fields.displayText = fields.details;
        } else {
          fields.displayText = defaultFields.displayText;
        }
      }
      fields.statusDisplayType = 'custom';
    }
    return fields;
  }

  function boundedInteger(value, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.min(maximum, Math.max(0, parsed));
  }

  function elapsedFromParts(input = {}) {
    const hours = boundedInteger(input.elapsedHours, 99999);
    const minutes = boundedInteger(input.elapsedMinutes, 59);
    const seconds = boundedInteger(input.elapsedSeconds, 59);
    return hours * 3600 + minutes * 60 + seconds;
  }

  function elapsedParts(totalSeconds) {
    const total = boundedInteger(totalSeconds, MAX_ELAPSED_SECONDS);
    return {
      elapsedHours: String(Math.floor(total / 3600)),
      elapsedMinutes: String(Math.floor(total % 3600 / 60)),
      elapsedSeconds: String(total % 60)
    };
  }

  function normalizeTimeline(timeline = {}, fallbackElapsed = 0, now = Date.now()) {
    const elapsedSeconds = timeline.elapsedSeconds === undefined
      ? boundedInteger(fallbackElapsed, MAX_ELAPSED_SECONDS)
      : boundedInteger(timeline.elapsedSeconds, MAX_ELAPSED_SECONDS);
    const updatedAt = Number.isFinite(timeline.updatedAt) ? timeline.updatedAt : now;
    return {
      elapsedSeconds,
      running: timeline.running === true,
      updatedAt
    };
  }

  function createPreset(name, fields = {}, now = Date.now()) {
    return {
      id: makeId(),
      name: String(name || 'Untitled Preset').trim().slice(0, 60) || 'Untitled Preset',
      fields: normalizeFields(fields),
      timeline: normalizeTimeline({}, elapsedFromParts(fields), now)
    };
  }

  function normalizePreset(input, index, now) {
    const fallbackFields = input && input.fields ? input.fields : input;
    const preset = createPreset(input && input.name || `Preset ${index + 1}`, fallbackFields, now);
    if (input && typeof input.id === 'string' && input.id) {
      preset.id = input.id;
    }
    preset.timeline = normalizeTimeline(
      input && input.timeline,
      elapsedFromParts(fallbackFields),
      now
    );
    return preset;
  }

  function normalizeWorkspace(saved, now = Date.now()) {
    if (saved && saved.version === 2 && Array.isArray(saved.presets) && saved.presets.length) {
      const savedActivePreset = saved.presets.find((preset) => preset.id === saved.activePresetId)
        || saved.presets[0];
      const legacyConnection = savedActivePreset && savedActivePreset.fields
        ? savedActivePreset.fields
        : savedActivePreset;
      const connection = normalizeConnection(saved.connection, legacyConnection || {});
      const presets = saved.presets.map((preset, index) => normalizePreset(preset, index, now));
      const activePresetId = presets.some((preset) => preset.id === saved.activePresetId)
        ? saved.activePresetId
        : presets[0].id;
      presets.forEach((preset) => {
        if (preset.id !== activePresetId && preset.timeline.running) {
          pauseTimeline(preset, now);
        }
      });
      const idlePresetId = presets.some((preset) => preset.id === saved.idlePresetId)
        ? saved.idlePresetId
        : '';
      const idlingForPresetId = idlePresetId
        && activePresetId === idlePresetId
        && saved.idlingForPresetId !== idlePresetId
        && presets.some((preset) => preset.id === saved.idlingForPresetId)
        ? saved.idlingForPresetId
        : '';
      return { version: 2, connection, activePresetId, idlePresetId, idlingForPresetId, presets };
    }

    const preset = createPreset('Default', saved || {}, now);
    return {
      version: 2,
      connection: normalizeConnection(saved || {}),
      activePresetId: preset.id,
      idlePresetId: '',
      idlingForPresetId: '',
      presets: [preset]
    };
  }

  function currentElapsedSeconds(preset, now = Date.now()) {
    const timeline = preset.timeline;
    const additional = timeline.running
      ? Math.max(0, Math.floor((now - timeline.updatedAt) / 1000))
      : 0;
    return Math.min(MAX_ELAPSED_SECONDS, timeline.elapsedSeconds + additional);
  }

  function setTimelineElapsed(preset, elapsedSeconds, now = Date.now()) {
    preset.timeline.elapsedSeconds = boundedInteger(elapsedSeconds, MAX_ELAPSED_SECONDS);
    preset.timeline.updatedAt = now;
  }

  function pauseTimeline(preset, now = Date.now()) {
    setTimelineElapsed(preset, currentElapsedSeconds(preset, now), now);
    preset.timeline.running = false;
  }

  function resumeTimeline(preset, now = Date.now()) {
    if (preset.timeline.running) {
      return;
    }
    preset.timeline.updatedAt = now;
    preset.timeline.running = true;
  }

  function switchActivePreset(workspace, nextPresetId, now = Date.now()) {
    const currentPreset = workspace.presets.find((preset) => preset.id === workspace.activePresetId);
    const nextPreset = workspace.presets.find((preset) => preset.id === nextPresetId);
    if (!nextPreset) {
      return null;
    }

    const shouldRunNext = Boolean(currentPreset && currentPreset.timeline.running);
    workspace.presets.forEach((preset) => {
      if (preset.timeline.running) {
        pauseTimeline(preset, now);
      }
    });
    workspace.activePresetId = nextPreset.id;
    if (shouldRunNext) {
      resumeTimeline(nextPreset, now);
    }
    return nextPreset;
  }

  return {
    MAX_ELAPSED_SECONDS,
    createPreset,
    currentElapsedSeconds,
    defaultConnection,
    defaultFields,
    elapsedFromParts,
    elapsedParts,
    normalizeFields,
    normalizeConnection,
    normalizeWorkspace,
    pauseTimeline,
    resumeTimeline,
    setTimelineElapsed,
    switchActivePreset
  };
}));
