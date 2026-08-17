const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const DiscordRPC = require('discord-rpc');
const assetAliases = require('./asset-aliases');

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
let mainWindow;
let rpcClient = null;
let currentClientId = '';
let currentActivity = null;
let configWriteQueue = Promise.resolve();
let quitAfterDisconnect = false;

function configPath() {
  return path.join(app.getPath('userData'), 'presence-config.json');
}

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    return { config: JSON.parse(raw), warning: '' };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { config: null, warning: '' };
    }
    if (error instanceof SyntaxError) {
      const backupPath = `${configPath()}.corrupt-${Date.now()}`;
      let moved = false;
      try {
        await fs.rename(configPath(), backupPath);
        moved = true;
      } catch {
        // Keep the original parse error as the useful failure context.
      }
      return {
        config: null,
        warning: moved
          ? `The saved workspace was invalid and was moved to ${backupPath}.`
          : 'The saved workspace is invalid and could not be loaded.'
      };
    }
    throw error;
  }
}

function serializeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Workspace data must be an object.');
  }
  const serialized = JSON.stringify(config, null, 2);
  if (typeof serialized !== 'string') {
    throw new Error('Workspace data could not be serialized.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_BYTES) {
    throw new Error('Workspace data is too large to save.');
  }
  return serialized;
}

async function writeConfigFile(serialized) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  const temporaryPath = `${configPath()}.${process.pid}-${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, serialized, 'utf8');
    await fs.rename(temporaryPath, configPath());
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

function writeConfig(config) {
  const serialized = serializeConfig(config);
  configWriteQueue = configWriteQueue
    .catch(() => {})
    .then(() => writeConfigFile(serialized));
  return configWriteQueue;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 840,
    height: 760,
    minWidth: 380,
    minHeight: 620,
    title: 'Custom Discord Presence',
    backgroundColor: '#101114',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const rendererUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) {
      event.preventDefault();
    }
  });
  mainWindow.loadURL(rendererUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clientId(value) {
  const cleaned = cleanText(value);
  if (!/^\d{17,20}$/.test(cleaned)) {
    throw new Error('A valid Discord application client ID is required.');
  }
  return cleaned;
}

function activityType(value) {
  const parsed = Number.parseInt(value, 10);
  return [0, 2, 3, 5].includes(parsed) ? parsed : 0;
}

function statusDisplayType(value) {
  const parsed = Number.parseInt(value, 10);
  return [0, 1, 2].includes(parsed) ? parsed : 0;
}

function statusDisplayName(selection, displayType, state, details, displayText) {
  if (selection === 'custom') {
    return displayText;
  }
  if (displayType === 1) {
    return state;
  }
  if (displayType === 2) {
    return details;
  }
  return '';
}

function elapsedPart(value, label, maximum) {
  const text = typeof value === 'number' ? String(value) : cleanText(value);
  if (!text) {
    return 0;
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`${label} must be a whole number.`);
  }

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${label} must be between 0 and ${maximum}.`);
  }
  return parsed;
}

function elapsedOffsetSeconds(input) {
  const hours = elapsedPart(input.elapsedHours, 'Elapsed hours', 99999);
  const minutes = elapsedPart(input.elapsedMinutes, 'Elapsed minutes', 59);
  const seconds = elapsedPart(input.elapsedSeconds, 'Elapsed seconds', 59);
  return hours * 3600 + minutes * 60 + seconds;
}

function cleanUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return '';
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `https://${text}`;

  try {
    const parsed = new URL(withProtocol);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function buildActivity(input) {
  const displaySelection = cleanText(input.statusDisplayType);
  const displayType = statusDisplayType(input.statusDisplayType);
  const details = cleanText(input.details);
  const state = cleanText(input.state);
  const displayText = cleanText(input.displayText);
  const activity = {
    type: activityType(input.activityType),
    statusDisplayType: displayType,
    name: statusDisplayName(displaySelection, displayType, state, details, displayText),
    details,
    state,
    largeImageKey: cleanText(assetAliases.resolve(input.largeImageKey)),
    largeImageText: cleanText(input.largeImageText),
    smallImageKey: cleanText(assetAliases.resolve(input.smallImageKey)),
    smallImageText: cleanText(input.smallImageText),
    instance: false
  };

  if (input.showTimestamp === true) {
    activity.startTimestamp = Date.now() - elapsedOffsetSeconds(input) * 1000;
  }

  const buttons = [];
  const button1Label = cleanText(input.button1Label);
  const button1Url = cleanUrl(input.button1Url);
  const button2Label = cleanText(input.button2Label);
  const button2Url = cleanUrl(input.button2Url);

  if (button1Label && cleanText(input.button1Url) && !button1Url) {
    throw new Error('Button 1 URL must be a valid http or https URL.');
  }
  if (button2Label && cleanText(input.button2Url) && !button2Url) {
    throw new Error('Button 2 URL must be a valid http or https URL.');
  }

  if (button1Label && button1Url) {
    buttons.push({ label: button1Label, url: button1Url });
  }
  if (button2Label && button2Url) {
    buttons.push({ label: button2Label, url: button2Url });
  }
  if (buttons.length) {
    activity.buttons = buttons;
  }

  Object.keys(activity).forEach((key) => {
    if (activity[key] === '' || activity[key] === false && key !== 'instance') {
      delete activity[key];
    }
  });

  return activity;
}

function pruneEmptyValues(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.keys(value).forEach((key) => {
    if (value[key] && typeof value[key] === 'object' && !(value[key] instanceof Date)) {
      pruneEmptyValues(value[key]);
    }

    if (value[key] === '' || value[key] === undefined || value[key] === null) {
      delete value[key];
    }
  });

  return value;
}

function publishActivity(client, activity) {
  const hasTimestamps = Boolean(activity.startTimestamp || activity.endTimestamp);
  const payload = pruneEmptyValues({
    pid: process.pid,
    activity: {
      name: activity.name,
      type: activity.type,
      status_display_type: activity.statusDisplayType,
      state: activity.state,
      details: activity.details,
      timestamps: hasTimestamps
        ? {
            start: activity.startTimestamp,
            end: activity.endTimestamp
          }
        : undefined,
      assets: activity.largeImageKey || activity.largeImageText
        || activity.smallImageKey || activity.smallImageText
        ? {
            large_image: activity.largeImageKey,
            large_text: activity.largeImageText,
            small_image: activity.smallImageKey,
            small_text: activity.smallImageText
          }
        : undefined,
      buttons: activity.buttons,
      instance: Boolean(activity.instance)
    }
  });

  return client.request('SET_ACTIVITY', payload);
}

async function replaceActivity(client, nextActivity) {
  await publishActivity(client, nextActivity);
}

if (process.env.NODE_ENV === 'test') {
  module.exports = {
    buildActivity,
    clientId,
    publishActivity,
    replaceActivity,
    serializeConfig
  };
}

function discordIpcDirectories() {
  const candidates = [
    process.env.XDG_RUNTIME_DIR,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    '/tmp'
  ];

  return [...new Set(candidates.filter(Boolean).map((dir) => dir.replace(/\/$/, '')))];
}

function findDiscordIpcPaths() {
  const paths = [];
  for (const dir of discordIpcDirectories()) {
    for (let index = 0; index < 10; index += 1) {
      const socketPath = path.join(dir, `discord-ipc-${index}`);
      if (fsSync.existsSync(socketPath)) {
        paths.push(socketPath);
      }
    }
  }
  return paths;
}

function probeDiscordIpcPath(socketPath) {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once('connect', () => finish({ path: socketPath, live: true }));
    socket.once('timeout', () => finish({ path: socketPath, live: false, code: 'ETIMEDOUT' }));
    socket.once('error', (error) => {
      finish({ path: socketPath, live: false, code: error.code || 'UNKNOWN' });
    });
  });
}

async function probeDiscordIpcPaths() {
  return Promise.all(findDiscordIpcPaths().map(probeDiscordIpcPath));
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function discordAppNames(release) {
  const selected = cleanText(release);
  const names = {
    canary: 'Discord Canary',
    ptb: 'Discord PTB',
    stable: 'Discord'
  };

  if (names[selected]) {
    return [names[selected], ...Object.values(names).filter((name) => name !== names[selected])];
  }

  return ['Discord Canary', 'Discord PTB', 'Discord'];
}

async function connectionErrorMessage(error, release) {
  if (!error || error.message !== 'Could not connect') {
    return error;
  }

  const checkedLocations = discordIpcDirectories().join(', ');
  const sockets = await probeDiscordIpcPaths();
  const selectedApp = discordAppNames(release)[0];
  const liveSockets = sockets.filter((socket) => socket.live);
  const staleSockets = sockets.filter((socket) => !socket.live);

  if (staleSockets.length && !liveSockets.length) {
    const details = staleSockets
      .map((socket) => `${socket.path} (${socket.code})`)
      .join(', ');
    return new Error(
      `${selectedApp} is running, but its IPC socket is refusing new connections: ${details}. `
      + `Quit and reopen ${selectedApp} yourself, then try again. This app will not start or restart Discord.`
    );
  }

  const socketText = liveSockets.length
    ? `Discord IPC socket(s) accepted a connection, but the RPC handshake failed: ${liveSockets.map((socket) => socket.path).join(', ')}.`
    : `No Discord IPC socket was found in: ${checkedLocations}.`;

  return new Error(
    `${socketText} ${selectedApp} must already be running and fully logged in before this app can publish Rich Presence.`
  );
}

function errorResponse(error) {
  return {
    ok: false,
    error: error && error.message ? error.message : 'Something went wrong.'
  };
}

async function safelyDestroyClient(client) {
  try {
    if (!client || !client.transport || !client.transport.socket) {
      return;
    }
    await client.destroy();
  } catch {
    // Failed connection attempts often do not have a complete transport to close.
  }
}

async function disconnectRpc() {
  const client = rpcClient;
  rpcClient = null;
  currentClientId = '';
  currentActivity = null;
  if (!client) {
    return;
  }

  try {
    await client.clearActivity();
  } catch {
    // Discord may already be closed; clearing is best effort.
  }

  try {
    await safelyDestroyClient(client);
  } catch {
    // Ignore shutdown races from the Discord IPC transport.
  }
}

function notifyRenderer(status, message = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('presence:status', { status, message });
  }
}

async function connectRpc(clientId, release) {
  if (rpcClient && currentClientId === clientId) {
    return rpcClient;
  }

  await disconnectRpc();
  DiscordRPC.register(clientId);

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const client = new DiscordRPC.Client({ transport: 'ipc' });
    try {
      await client.login({ clientId });
      rpcClient = client;
      currentClientId = clientId;
      client.once('disconnected', () => {
        if (rpcClient !== client) {
          return;
        }
        rpcClient = null;
        currentClientId = '';
        currentActivity = null;
        notifyRenderer('disconnected', 'Discord closed the Rich Presence connection.');
      });
      return client;
    } catch (error) {
      lastError = error;
      await safelyDestroyClient(client);

      if (error && error.message === 'Could not connect') {
        const sockets = await probeDiscordIpcPaths();
        if (sockets.length && sockets.every((socket) => !socket.live)) {
          throw await connectionErrorMessage(error, release);
        }
      }

      await delay(1000);
    }
  }

  throw await connectionErrorMessage(lastError, release);
}

function registerIpcHandlers() {
  ipcMain.handle('config:load', async () => {
    try {
      return { ok: true, ...await readConfig() };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('config:save', async (_event, config) => {
    try {
      await writeConfig(config);
      return { ok: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('url:open-external', async (_event, url) => {
    try {
      const safeUrl = cleanUrl(url);
      if (!safeUrl) {
        throw new Error('URL must be a valid http or https URL.');
      }

      await shell.openExternal(safeUrl);
      return { ok: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('presence:start', async (_event, config) => {
    try {
      const nextClientId = clientId(config.clientId);

      const client = await connectRpc(nextClientId, config.discordRelease);
      const nextActivity = buildActivity(config);
      await replaceActivity(client, nextActivity);
      currentActivity = nextActivity;
      return { ok: true, activity: currentActivity };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('presence:update', async (_event, config) => {
    try {
      const nextClientId = clientId(config.clientId);

      const client = await connectRpc(nextClientId, config.discordRelease);
      const nextActivity = buildActivity(config);
      await replaceActivity(client, nextActivity);
      currentActivity = nextActivity;
      return { ok: true, activity: currentActivity };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('presence:stop', async () => {
    try {
      await disconnectRpc();
      return { ok: true };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('presence:get-status', async () => ({
    ok: true,
    running: Boolean(rpcClient),
    activity: currentActivity
  }));
}

if (process.env.NODE_ENV !== 'test') {
  registerIpcHandlers();

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (quitAfterDisconnect || !rpcClient) {
      return;
    }
    event.preventDefault();
    disconnectRpc().finally(() => {
      quitAfterDisconnect = true;
      app.quit();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
