(function exposeAssetAliases(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.assetAliases = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DEVICON_VERSION = 'v2.17.0';
  const REPOSITORY_RAW_ROOT = 'https://raw.githubusercontent.com/lanzarote0tr/discord-presence/main';
  const repositoryIcons = Object.freeze({
    neovim: `${REPOSITORY_RAW_ROOT}/neovim-mark.png`,
    terminal: `${REPOSITORY_RAW_ROOT}/Terminalicon3.png`
  });
  const repositoryAliases = Object.freeze({
    nvim: 'neovim',
    'neovim-mark': 'neovim',
    terminalicon3: 'terminal'
  });
  const iconFiles = Object.freeze({
    bash: ['bash', 'bash-original'],
    css: ['css3', 'css3-original'],
    electron: ['electron', 'electron-original'],
    git: ['git', 'git-original'],
    github: ['github', 'github-original'],
    html: ['html5', 'html5-original'],
    javascript: ['javascript', 'javascript-original'],
    nodejs: ['nodejs', 'nodejs-original'],
    python: ['python', 'python-original'],
    react: ['react', 'react-original'],
    typescript: ['typescript', 'typescript-original'],
    vscode: ['vscode', 'vscode-original']
  });
  const aliasNames = Object.freeze({
    shell: 'bash',
    css3: 'css',
    html5: 'html',
    js: 'javascript',
    node: 'nodejs',
    py: 'python',
    ts: 'typescript',
    code: 'vscode',
    'visual-studio-code': 'vscode',
    visualstudiocode: 'vscode'
  });

  function externalIconUrl(name) {
    const [folder, file] = iconFiles[name];
    const source = `cdn.jsdelivr.net/gh/devicons/devicon@${DEVICON_VERSION}/icons/${folder}/${file}.svg`;
    return `https://images.weserv.nl/?url=${source}&output=png&w=512&h=512&fit=contain`;
  }

  function canonicalKeyword(value) {
    const keyword = String(value || '').trim().toLowerCase();
    if (Object.hasOwn(iconFiles, keyword)) {
      return keyword;
    }
    return aliasNames[keyword] || '';
  }

  function canonicalRepositoryKeyword(value) {
    const keyword = String(value || '').trim().toLowerCase().replace(/\.png$/, '');
    if (Object.hasOwn(repositoryIcons, keyword)) {
      return keyword;
    }
    return repositoryAliases[keyword] || '';
  }

  function resolve(value) {
    const text = String(value || '').trim();
    if (/^asset:/i.test(text)) {
      return text.slice(6).trim();
    }
    if (/^icon:/i.test(text)) {
      const keyword = canonicalKeyword(text.slice(5));
      return keyword ? externalIconUrl(keyword) : text;
    }
    const repositoryKeyword = canonicalRepositoryKeyword(text);
    if (repositoryKeyword) {
      return repositoryIcons[repositoryKeyword];
    }
    return text;
  }

  function preview(value) {
    const text = String(value || '').trim();
    if (/^asset:/i.test(text)) {
      return text.slice(6).trim();
    }
    const repositoryKeyword = canonicalRepositoryKeyword(text);
    if (repositoryKeyword) {
      return repositoryIcons[repositoryKeyword];
    }
    const keyword = canonicalKeyword(text.replace(/^icon:/i, ''));
    return keyword ? externalIconUrl(keyword) : text;
  }

  return {
    canonicalKeyword,
    canonicalRepositoryKeyword,
    keywords: Object.freeze(Object.keys(iconFiles)),
    preview,
    repositoryKeywords: Object.freeze(Object.keys(repositoryIcons)),
    resolve
  };
}));
