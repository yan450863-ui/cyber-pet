import { existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Both portable releases and existing customized pet installs keep their own
// Electron state. Never reuse the upstream DSH global data-directory locator.
export function preparePetPortable(app, root) {
  const petInstall = existsSync(join(root, '插件', 'dsh-bili-scroll', 'index.js')) && existsSync(join(root, '数据', 'bili-duty'));
  if (!existsSync(join(root, 'pet-portable.json')) && !petInstall) return false;
  const home = join(root, '数据');
  const state = join(home, 'desktop-shell');
  mkdirSync(state, { recursive: true });
  app.setName('赛博小宠物');
  for (const name of ['appData', 'sessionData', 'crashDumps']) {
    const path = join(home, name === 'appData' ? 'appdata' : name === 'sessionData' ? 'desktop-shell' : 'crashes');
    mkdirSync(path, { recursive: true });
    app.setPath(name, path);
  }
  app.setPath('userData', state);
  app.setAppLogsPath(join(state, 'logs'));
  process.env.CYBER_PET_ROOT = root;
  process.env.CYBER_PET_HOME = home;
  delete process.env.NODE_PATH;
  process.env.DSH_HOME = home;
  const temp = join(home, "tmp");
  mkdirSync(temp, { recursive: true });
  process.env.TEMP = temp;
  process.env.TMP = temp;
  process.env.DSH_HOST_MODULES = join(root, "resources", "app", "node_modules", "@deepseek-ai");
  for (const name of ['desktop', 'headless']) {
    const dir = join(home, 'profiles', name);
    mkdirSync(dir, { recursive: true });
    const create = (file, value) => {
      if (!existsSync(join(dir, file))) writeFileSync(join(dir, file), JSON.stringify(value, null, 2) + '\n');
    };
    create('package.json', {
      name: `dsh-profile-${name}`, private: true, dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', name === 'desktop' ? '@deepseek-ai/dsh-web-app' : '@deepseek-ai/dsh-headless', ...(name === 'desktop' ? ['dsh-bili-scroll'] : [])] } },
    });
    create('cordis.yml', []);
    create('cordis.patch.yml', [
      ...(name === 'desktop' ? [{ id: 'desktop-shell', name: 'dsh-plugin-desktop', config: { mode: 'extended', windowsMaterial: 'off', openBrowser: false, networkExposure: 'loopback' } }] : []),
      { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: {} } },
      { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', disabled: true, config: {} },
      { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', disabled: false, config: { path: join(home, '.credentials.yaml'), dshHome: home } },
      { id: 'llm-deepseek', disabled: true }, { id: 'llm-deepseek-account', disabled: true },
    ]);

  }
  const bundledPlugin = join(root, 'resources', 'app', 'node_modules', 'dsh-bili-scroll');
  cpSync(join(root, '插件', 'dsh-bili-scroll'), bundledPlugin, { recursive: true,
    filter: path => !/[\\/](node_modules|\.git|__pycache__)([\\/]|$)/.test(path) });
  return true;
}
