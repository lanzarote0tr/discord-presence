const form = document.querySelector('#presenceForm');
const statusPill = document.querySelector('#statusPill');
const saveState = document.querySelector('#saveState');
const message = document.querySelector('#message');
const presetSelect = document.querySelector('#presetSelect');
const idlePresetSelect = document.querySelector('#idlePresetSelect');
const presetName = document.querySelector('#presetName');
const newPresetButton = document.querySelector('#newPresetButton');
const deletePresetButton = document.querySelector('#deletePresetButton');
const startButton = document.querySelector('#startButton');
const updateButton = document.querySelector('#updateButton');
const pauseResumeButton = document.querySelector('#pauseResumeButton');
const stopButton = document.querySelector('#stopButton');
const saveButton = document.querySelector('#saveButton');
const timePreview = document.querySelector('#timePreview');
const largePreview = document.querySelector('#largePreview');
const smallPreview = document.querySelector('#smallPreview');
const largePreviewImage = document.querySelector('#largePreviewImage');
const smallPreviewImage = document.querySelector('#smallPreviewImage');
const buttonPreview = document.querySelector('#buttonPreview');
const assetKeywordList = document.querySelector('#assetKeywordList');
const elapsedFields = document.querySelector('#elapsedFields');
const assetApi = window.assetAliases;
const stateApi = window.presenceState;

const connectionFieldNames = Object.keys(stateApi.defaultConnection);
const elapsedFieldNames = ['elapsedHours', 'elapsedMinutes', 'elapsedSeconds'];
let workspace = null;
let presenceRunning = false;
let timelineDirty = false;
let timer = null;
let saveTimer = null;
let statusUnsubscribe = null;
let busy = false;
let saveRevision = 0;
let validationMessage = '';

function formControl(name) {
  return form.elements.namedItem(name);
}

function activePreset() {
  if (!workspace) {
    return null;
  }
  return workspace.presets.find((preset) => preset.id === workspace.activePresetId)
    || workspace.presets[0];
}

function presetById(id) {
  return (workspace && workspace.presets.find((preset) => preset.id === id)) || null;
}

function idlePreset() {
  return presetById(workspace && workspace.idlePresetId);
}

function isIdling() {
  return Boolean(workspace && workspace.idlingForPresetId);
}

function getFields() {
  const fields = {};
  Object.keys(stateApi.defaultFields).forEach((name) => {
    const control = formControl(name);
    fields[name] = control.type === 'checkbox' ? control.checked : control.value.trim();
  });
  return fields;
}

function getConnection() {
  const connection = {};
  connectionFieldNames.forEach((name) => {
    connection[name] = formControl(name).value.trim();
  });
  return connection;
}

function getDraftConfig() {
  const elapsed = {};
  elapsedFieldNames.forEach((name) => {
    elapsed[name] = formControl(name).value;
  });
  return { ...getConnection(), ...getFields(), ...elapsed };
}

function previewElapsedSeconds() {
  const preset = activePreset();
  if (!preset || timelineDirty) {
    return stateApi.elapsedFromParts(getDraftConfig());
  }
  return stateApi.currentElapsedSeconds(preset);
}

function getPresetPublishConfig(preset) {
  const elapsed = stateApi.elapsedParts(stateApi.currentElapsedSeconds(preset));
  return {
    ...workspace.connection,
    ...preset.fields,
    ...elapsed,
    showTimestamp: preset.fields.showTimestamp && preset.timeline.running
  };
}

function getPublishConfig() {
  return getPresetPublishConfig(activePreset());
}

function setElapsedInputs(totalSeconds) {
  const parts = stateApi.elapsedParts(totalSeconds);
  elapsedFieldNames.forEach((name) => {
    formControl(name).value = parts[name];
  });
}

function refreshElapsedInputs() {
  const preset = activePreset();
  if (!preset || timelineDirty) {
    return;
  }
  const parts = stateApi.elapsedParts(stateApi.currentElapsedSeconds(preset));
  elapsedFieldNames.forEach((name) => {
    const control = formControl(name);
    if (document.activeElement !== control) {
      control.value = parts[name];
    }
  });
}

function applyPreset(preset) {
  Object.entries(preset.fields).forEach(([name, value]) => {
    const control = formControl(name);
    if (!control) {
      return;
    }
    if (control.type === 'checkbox') {
      control.checked = Boolean(value);
    } else {
      control.value = value ?? '';
    }
  });
  presetName.value = preset.name;
  setElapsedInputs(stateApi.currentElapsedSeconds(preset));
  timelineDirty = false;
  clearFieldErrors();
  renderPreview();
}

function applyConnection() {
  Object.entries(workspace.connection).forEach(([name, value]) => {
    const control = formControl(name);
    if (control) {
      control.value = value ?? '';
    }
  });
}

function cloneWorkspace() {
  return JSON.parse(JSON.stringify(workspace));
}

function restoreWorkspace(snapshot) {
  workspace = snapshot;
  applyConnection();
  renderPresetOptions();
  applyPreset(activePreset());
  setPresenceRunning(presenceRunning);
}

function renderPresetOptions() {
  presetSelect.replaceChildren();
  idlePresetSelect.replaceChildren();

  const noIdleOption = document.createElement('option');
  noIdleOption.value = '';
  noIdleOption.textContent = 'None';
  idlePresetSelect.appendChild(noIdleOption);

  workspace.presets.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    presetSelect.appendChild(option);

    const idleOption = option.cloneNode(true);
    idlePresetSelect.appendChild(idleOption);
  });
  presetSelect.value = workspace.activePresetId;
  idlePresetSelect.value = workspace.idlePresetId || '';
  deletePresetButton.disabled = workspace.presets.length === 1 || presenceRunning && isIdling();
}

function commitFormToPreset() {
  const preset = activePreset();
  if (!preset) {
    return;
  }
  preset.name = presetName.value.trim().slice(0, 60) || 'Untitled Preset';
  workspace.connection = stateApi.normalizeConnection(getConnection());
  preset.fields = stateApi.normalizeFields(getFields());
  if (timelineDirty) {
    stateApi.setTimelineElapsed(preset, stateApi.elapsedFromParts(getDraftConfig()));
    timelineDirty = false;
  }
}

function initials(value, fallback) {
  const text = value || fallback;
  return text
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatElapsed(totalSeconds, isRunning) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor(totalSeconds % 3600 / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const clock = hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
  return isRunning ? clock : `${clock} paused`;
}

function trayStatus(preset) {
  if (presenceRunning && isIdling()) {
    return 'idling';
  }
  if (!presenceRunning) {
    return 'stopped';
  }
  return preset && preset.timeline.running ? 'running' : 'paused';
}

function updateTrayPreview(elapsedText) {
  const preset = activePreset();
  if (!preset || !window.presenceApi.updateTray) {
    return;
  }

  window.presenceApi.updateTray({
    status: trayStatus(preset),
    elapsedText: elapsedText.replace(/ paused$/, ''),
    detail: preset.name
  }).catch(() => {});
}

function imageUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function renderAssetImage(image, label, value, fallback, alt) {
  const source = imageUrl(assetApi.preview(value));
  label.textContent = initials(value, fallback);

  if (!source) {
    image.dataset.source = '';
    image.removeAttribute('src');
    image.hidden = true;
    label.hidden = false;
    return;
  }

  image.alt = alt;
  if (image.dataset.source === source) {
    return;
  }

  image.dataset.source = source;
  image.hidden = true;
  label.hidden = false;
  image.onload = () => {
    if (image.dataset.source === source) {
      image.hidden = false;
      label.hidden = true;
    }
  };
  image.onerror = () => {
    if (image.dataset.source === source) {
      image.hidden = true;
      label.hidden = false;
    }
  };
  image.src = source;
}

function previewUrl(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(previewUrl(value)).protocol);
  } catch {
    return false;
  }
}

function elapsedPart(value, label, maximum) {
  const text = String(value || '').trim();
  if (!text) {
    return 0;
  }
  if (!/^\d+$/.test(text)) {
    return `${label} must be a whole number.`;
  }
  if (Number(text) > maximum) {
    return `${label} must be between 0 and ${maximum}.`;
  }
  return '';
}

function clearFieldErrors() {
  Array.from(form.elements).forEach((element) => {
    element.removeAttribute('aria-invalid');
  });
}

function markField(name) {
  const control = formControl(name);
  if (control) {
    control.setAttribute('aria-invalid', 'true');
  }
}

function validateConfig(config, requireClientId = false) {
  clearFieldErrors();

  if (requireClientId && !/^\d{17,20}$/.test(config.clientId)) {
    markField('clientId');
    return 'Enter a valid Discord application client ID.';
  }

  const selectedDisplayField = config.statusDisplayType === '1'
    ? ['state', 'State']
    : config.statusDisplayType === '2'
      ? ['details', 'Details']
      : config.statusDisplayType === 'custom'
        ? ['displayText', 'Custom display text']
      : null;
  if (selectedDisplayField && config[selectedDisplayField[0]].length < 2) {
    markField(selectedDisplayField[0]);
    return `${selectedDisplayField[1]} must contain at least 2 characters when used as the display line.`;
  }

  const elapsedError = config.showTimestamp && (
    elapsedPart(config.elapsedHours, 'Elapsed hours', 99999)
      || elapsedPart(config.elapsedMinutes, 'Elapsed minutes', 59)
      || elapsedPart(config.elapsedSeconds, 'Elapsed seconds', 59)
  );
  if (elapsedError) {
    elapsedFieldNames.forEach(markField);
    return elapsedError;
  }

  const buttonPairs = [
    ['button1Label', 'button1Url', 'Button 1'],
    ['button2Label', 'button2Url', 'Button 2']
  ];

  for (const [labelName, urlName, label] of buttonPairs) {
    const hasLabel = Boolean(config[labelName]);
    const hasUrl = Boolean(config[urlName]);
    if (hasLabel !== hasUrl) {
      markField(labelName);
      markField(urlName);
      return `${label} needs both a label and a URL.`;
    }
    if (hasUrl && !isHttpUrl(config[urlName])) {
      markField(urlName);
      return `${label} URL must be a valid http or https URL.`;
    }
  }

  return '';
}

function renderButtons(config) {
  buttonPreview.replaceChildren();
  [
    [config.button1Label, config.button1Url],
    [config.button2Label, config.button2Url]
  ].forEach(([label, url]) => {
    if (!label || !url) {
      return;
    }
    const item = document.createElement('button');
    item.className = 'preview-button';
    item.type = 'button';
    item.textContent = label;
    item.addEventListener('click', async () => {
      const result = await window.presenceApi.openExternal(previewUrl(url));
      if (result && result.ok === false) {
        setMessage(result.error, true);
      }
    });
    buttonPreview.appendChild(item);
  });
}

function renderPreview() {
  if (!workspace) {
    return;
  }

  refreshElapsedInputs();
  const config = getDraftConfig();
  const preset = activePreset();
  const elapsedText = formatElapsed(previewElapsedSeconds(), preset.timeline.running);
  elapsedFields.hidden = false;
  timePreview.hidden = false;
  timePreview.textContent = elapsedText;
  updateTrayPreview(elapsedText);
  pauseResumeButton.textContent = isIdling() || !preset.timeline.running
    ? 'Resume Timer'
    : 'Pause Timer';
  renderAssetImage(
    largePreviewImage,
    largePreview,
    config.largeImageKey,
    'APP',
    config.largeImageText || 'Large activity image'
  );
  renderAssetImage(
    smallPreviewImage,
    smallPreview,
    config.smallImageKey,
    'SM',
    config.smallImageText || 'Small activity image'
  );
  renderButtons(config);

  validationMessage = validateConfig(config, false);
  if (validationMessage) {
    setMessage(validationMessage, true, true);
  } else if (message.dataset.validation === 'true') {
    setMessage('');
  }
}

function setPresenceRunning(nextRunning) {
  presenceRunning = nextRunning;
  const idling = presenceRunning && isIdling();
  statusPill.textContent = idling ? 'Idling' : presenceRunning ? 'Running' : 'Stopped';
  statusPill.classList.toggle('running', presenceRunning);
  statusPill.classList.toggle('idling', idling);
  startButton.disabled = busy || presenceRunning;
  updateButton.disabled = busy || !presenceRunning;
  pauseResumeButton.disabled = busy;
  stopButton.disabled = busy || !presenceRunning;
  saveButton.disabled = busy;
  presetSelect.disabled = busy || idling;
  idlePresetSelect.disabled = busy || idling;
  newPresetButton.disabled = busy || idling;
  deletePresetButton.disabled = busy || idling || workspace.presets.length === 1;
  form.setAttribute('aria-busy', String(busy));
}

function setBusy(nextBusy) {
  busy = nextBusy;
  setPresenceRunning(presenceRunning);
}

function setMessage(text, isError = false, isValidation = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
  message.dataset.validation = isValidation ? 'true' : 'false';
}

function setSaveState(text, isError = false) {
  saveState.textContent = text;
  saveState.classList.toggle('error', isError);
}

function showValidationError(error) {
  validationMessage = error;
  setMessage(error, true, true);
}

async function persistWorkspace(successText = '') {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const revision = saveRevision;
  setSaveState('Saving');
  try {
    const result = await window.presenceApi.saveConfig(workspace);
    if (result && result.ok === false) {
      throw new Error(result.error);
    }
    if (successText) {
      setMessage(successText);
    }
    setSaveState(revision === saveRevision ? 'Saved' : 'Unsaved');
    return true;
  } catch (error) {
    setSaveState('Save failed', true);
    setMessage(error.message || 'Could not save presets.', true);
    return false;
  }
}

function scheduleWorkspaceSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveRevision += 1;
  setSaveState('Unsaved');
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    commitFormToPreset();
    await persistWorkspace();
  }, 500);
}

async function invoke(action, config, successText) {
  const error = validateConfig(config, true);
  if (error) {
    showValidationError(error);
    return null;
  }

  setMessage('Working...');
  setBusy(true);
  try {
    const result = await window.presenceApi[action](config);
    if (result && result.ok === false) {
      throw new Error(result.error);
    }
    setMessage(successText);
    return result;
  } catch (requestError) {
    setMessage(requestError.message || 'Something went wrong.', true);
    return null;
  } finally {
    setBusy(false);
  }
}

async function updatePresenceForActivePreset(successText) {
  const config = getPublishConfig();
  return invoke('update', config, successText);
}

form.addEventListener('input', (event) => {
  if (connectionFieldNames.includes(event.target.name)) {
    workspace.connection = stateApi.normalizeConnection(getConnection());
  }
  if (elapsedFieldNames.includes(event.target.name)) {
    timelineDirty = true;
  }
  renderPreview();
  scheduleWorkspaceSave();
});

idlePresetSelect.addEventListener('change', async () => {
  commitFormToPreset();
  workspace.idlePresetId = idlePresetSelect.value;
  renderPresetOptions();
  await persistWorkspace('Idling preset updated.');
});

presetSelect.addEventListener('change', async () => {
  commitFormToPreset();
  const snapshot = cloneWorkspace();
  const previousTimerWasRunning = activePreset().timeline.running;
  const nextPreset = stateApi.switchActivePreset(workspace, presetSelect.value);
  if (!nextPreset) {
    renderPresetOptions();
    return;
  }

  renderPresetOptions();
  applyPreset(nextPreset);

  if (presenceRunning) {
    const error = validateConfig(getDraftConfig(), true);
    if (error) {
      restoreWorkspace(snapshot);
      setMessage(`Cannot switch to "${nextPreset.name}": ${error}`, true);
      return;
    }
  }

  await persistWorkspace();

  if (presenceRunning) {
    const result = await updatePresenceForActivePreset(`Switched to ${nextPreset.name}. Timer switched.`);
    if (!result) {
      restoreWorkspace(snapshot);
      await persistWorkspace();
    }
  } else {
    setMessage(previousTimerWasRunning
      ? `Loaded ${nextPreset.name}. Timer switched.`
      : `Loaded ${nextPreset.name}. Timer remains paused.`);
  }
});

newPresetButton.addEventListener('click', async () => {
  commitFormToPreset();
  const snapshot = cloneWorkspace();
  const preset = stateApi.createPreset(`Preset ${workspace.presets.length + 1}`);
  workspace.presets.push(preset);
  stateApi.switchActivePreset(workspace, preset.id);
  renderPresetOptions();
  applyPreset(preset);
  await persistWorkspace();

  if (presenceRunning) {
    const result = await updatePresenceForActivePreset(`Created and switched to ${preset.name}.`);
    if (!result) {
      restoreWorkspace(snapshot);
      await persistWorkspace();
    }
  } else {
    setMessage('New preset created.');
  }
});

deletePresetButton.addEventListener('click', async () => {
  if (workspace.presets.length === 1) {
    return;
  }
  const preset = activePreset();
  if (!window.confirm(`Delete preset "${preset.name}"?`)) {
    return;
  }

  commitFormToPreset();
  const snapshot = cloneWorkspace();
  const index = workspace.presets.findIndex((item) => item.id === preset.id);
  const nextPreset = workspace.presets[index === workspace.presets.length - 1 ? index - 1 : index + 1];
  stateApi.switchActivePreset(workspace, nextPreset.id);
  workspace.presets.splice(index, 1);
  if (workspace.idlePresetId === preset.id) {
    workspace.idlePresetId = '';
  }
  if (workspace.idlingForPresetId === preset.id) {
    workspace.idlingForPresetId = '';
  }
  renderPresetOptions();
  applyPreset(nextPreset);
  await persistWorkspace();

  if (presenceRunning) {
    const result = await updatePresenceForActivePreset(`Deleted ${preset.name} and switched to ${nextPreset.name}.`);
    if (!result) {
      restoreWorkspace(snapshot);
      await persistWorkspace();
    }
  } else {
    setMessage(`${preset.name} deleted.`);
  }
});

startButton.addEventListener('click', async () => {
  const draft = getDraftConfig();
  const error = validateConfig(draft, true);
  if (error) {
    showValidationError(error);
    return;
  }

  commitFormToPreset();
  const preset = activePreset();
  const previousTimeline = { ...preset.timeline };
  if (preset.fields.showTimestamp && !preset.timeline.running) {
    stateApi.resumeTimeline(preset);
  }
  setElapsedInputs(stateApi.currentElapsedSeconds(preset));
  await persistWorkspace();

  const result = await invoke('start', getPublishConfig(), 'Presence is visible in Discord.');
  if (result) {
    setPresenceRunning(true);
    renderPreview();
  } else {
    preset.timeline = previousTimeline;
    setElapsedInputs(stateApi.currentElapsedSeconds(preset));
    await persistWorkspace();
    renderPreview();
  }
});

updateButton.addEventListener('click', async () => {
  const draft = getDraftConfig();
  const error = validateConfig(draft, true);
  if (error) {
    showValidationError(error);
    return;
  }

  commitFormToPreset();
  renderPresetOptions();
  await persistWorkspace();
  const result = await updatePresenceForActivePreset('Presence updated.');
  if (result) {
    renderPreview();
  }
});

pauseResumeButton.addEventListener('click', async () => {
  if (presenceRunning && isIdling()) {
    commitFormToPreset();
    const preset = activePreset();
    const sourcePreset = presetById(workspace.idlingForPresetId);
    if (!sourcePreset) {
      workspace.idlingForPresetId = '';
      setPresenceRunning(true);
      await persistWorkspace();
      renderPreview();
      return;
    }

    const sourceError = validateConfig(getPresetPublishConfig(sourcePreset), true);
    clearFieldErrors();
    if (sourceError) {
      setMessage(`Preset "${sourcePreset.name}" cannot be resumed: ${sourceError}`, true);
      return;
    }

    stateApi.pauseTimeline(preset);
    stateApi.resumeTimeline(sourcePreset);
    workspace.idlingForPresetId = '';
    workspace.activePresetId = sourcePreset.id;
    renderPresetOptions();
    applyPreset(sourcePreset);
    await persistWorkspace();

    const result = await invoke(
      'update',
      getPresetPublishConfig(sourcePreset),
      `Resumed ${sourcePreset.name}.`
    );
    if (!result) {
      stateApi.pauseTimeline(sourcePreset);
      stateApi.resumeTimeline(preset);
      workspace.idlingForPresetId = sourcePreset.id;
      workspace.activePresetId = preset.id;
      renderPresetOptions();
      applyPreset(preset);
      await persistWorkspace();
    }
    setPresenceRunning(true);
    renderPreview();
    return;
  }

  const draft = getDraftConfig();
  const error = validateConfig(draft, presenceRunning);
  if (error) {
    showValidationError(error);
    return;
  }

  commitFormToPreset();
  const preset = activePreset();
  const previousTimeline = { ...preset.timeline };

  if (preset.timeline.running) {
    const idle = presenceRunning ? idlePreset() : null;
    if (idle && idle.id !== preset.id) {
      const idleError = validateConfig(getPresetPublishConfig(idle), true);
      clearFieldErrors();
      if (idleError) {
        setMessage(`Idling preset "${idle.name}" cannot be published: ${idleError}`, true);
        return;
      }

      stateApi.pauseTimeline(preset);
      stateApi.setTimelineElapsed(idle, 0);
      stateApi.resumeTimeline(idle);
      workspace.idlingForPresetId = preset.id;
      workspace.activePresetId = idle.id;
      renderPresetOptions();
      applyPreset(idle);
      await persistWorkspace();

      const result = await invoke(
        'update',
        getPresetPublishConfig(idle),
        `Showing ${idle.name}.`
      );
      if (!result) {
        stateApi.pauseTimeline(idle);
        stateApi.resumeTimeline(preset);
        workspace.idlingForPresetId = '';
        workspace.activePresetId = preset.id;
        renderPresetOptions();
        applyPreset(preset);
        await persistWorkspace();
      }
      setPresenceRunning(true);
      renderPreview();
      return;
    }
    stateApi.pauseTimeline(preset);
  } else {
    stateApi.resumeTimeline(preset);
  }
  setElapsedInputs(stateApi.currentElapsedSeconds(preset));
  await persistWorkspace();

  const stateText = preset.timeline.running ? 'resumed' : 'paused';
  if (presenceRunning) {
    const result = await updatePresenceForActivePreset(`Timer ${stateText}.`);
    if (!result) {
      preset.timeline = previousTimeline;
      setElapsedInputs(stateApi.currentElapsedSeconds(preset));
      await persistWorkspace();
    }
  } else {
    setMessage(`Timer ${stateText}.`);
  }
  renderPreview();
});

stopButton.addEventListener('click', async () => {
  setMessage('Working...');
  setBusy(true);
  try {
    const result = await window.presenceApi.stop();
    if (result && result.ok === false) {
      throw new Error(result.error);
    }
    if (isIdling()) {
      const idle = activePreset();
      const sourcePreset = presetById(workspace.idlingForPresetId);
      stateApi.pauseTimeline(idle);
      workspace.idlingForPresetId = '';
      if (sourcePreset) {
        workspace.activePresetId = sourcePreset.id;
        renderPresetOptions();
        applyPreset(sourcePreset);
      }
      await persistWorkspace();
    }
    setPresenceRunning(false);
    renderPreview();
    setMessage('Presence stopped. The preset timer keeps its current state.');
  } catch (error) {
    setMessage(error.message || 'Could not stop presence.', true);
  } finally {
    setBusy(false);
  }
});

saveButton.addEventListener('click', async () => {
  const error = validateConfig(getDraftConfig(), false);
  if (error) {
    showValidationError(error);
    return;
  }

  commitFormToPreset();
  renderPresetOptions();
  setElapsedInputs(stateApi.currentElapsedSeconds(activePreset()));
  await persistWorkspace('Preset saved.');
  renderPreview();
});

async function handlePresenceStatus(payload) {
  if (!payload || !['disconnected', 'stopped'].includes(payload.status) || !presenceRunning || !workspace) {
    return;
  }

  commitFormToPreset();
  if (isIdling()) {
    const idle = activePreset();
    const sourcePreset = presetById(workspace.idlingForPresetId);
    stateApi.pauseTimeline(idle);
    workspace.idlingForPresetId = '';
    if (sourcePreset) {
      workspace.activePresetId = sourcePreset.id;
    }
  } else {
    stateApi.pauseTimeline(activePreset());
  }

  setPresenceRunning(false);
  renderPresetOptions();
  applyPreset(activePreset());
  await persistWorkspace();
  setMessage(
    payload.message || 'Discord disconnected. The active timer was paused.',
    payload.status === 'disconnected'
  );
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    assetApi.repositoryKeywords.forEach((keyword) => {
      const option = document.createElement('option');
      option.value = keyword;
      assetKeywordList.appendChild(option);
    });
    assetApi.keywords.forEach((keyword) => {
      const option = document.createElement('option');
      option.value = `icon:${keyword}`;
      assetKeywordList.appendChild(option);
    });
    const [loaded, runtimeStatus] = await Promise.all([
      window.presenceApi.loadConfig(),
      window.presenceApi.getStatus()
    ]);
    if (loaded && loaded.ok === false) {
      throw new Error(loaded.error);
    }
    if (runtimeStatus && runtimeStatus.ok === false) {
      throw new Error(runtimeStatus.error);
    }
    const saved = loaded && Object.hasOwn(loaded, 'config') ? loaded.config : loaded;
    const loadWarning = loaded && loaded.warning;
    const runtimeRunning = Boolean(runtimeStatus && runtimeStatus.running);
    workspace = stateApi.normalizeWorkspace(saved || null);
    applyConnection();
    if (isIdling() && !runtimeRunning) {
      const idle = activePreset();
      const sourcePreset = presetById(workspace.idlingForPresetId);
      stateApi.pauseTimeline(idle);
      workspace.idlingForPresetId = '';
      if (sourcePreset) {
        workspace.activePresetId = sourcePreset.id;
      }
      await persistWorkspace();
    }
    renderPresetOptions();
    applyPreset(activePreset());
    setPresenceRunning(runtimeRunning);
    statusUnsubscribe = window.presenceApi.onStatus(handlePresenceStatus);
    timer = setInterval(renderPreview, 1000);
    if (loadWarning) {
      setMessage(loadWarning, true);
    } else if (runtimeRunning) {
      setMessage('Reconnected to the active presence session.');
    }
  } catch (error) {
    setMessage(error.message || 'Could not load presets.', true);
  }
});

window.addEventListener('beforeunload', () => {
  if (workspace) {
    commitFormToPreset();
    window.presenceApi.saveConfig(workspace);
  }
  if (timer) {
    clearInterval(timer);
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  if (statusUnsubscribe) {
    statusUnsubscribe();
  }
});
