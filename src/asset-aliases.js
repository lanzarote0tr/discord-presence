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

  function resolve(value) {
    const text = String(value || '').trim();
    if (/^asset:/i.test(text)) {
      return text.slice(6).trim();
    }
    const keyword = canonicalKeyword(text);
    return keyword ? externalIconUrl(keyword) : text;
  }

  return {
    canonicalKeyword,
    keywords: Object.freeze(Object.keys(iconFiles)),
    resolve
  };
}));
