import { existsSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Only release builds contain this marker. The working installation is untouched.
export function preparePetPortable(app, root) {
  if (!existsSync(join(root, 'pet-portable.json'))) return false;
  const home = join(root, '数据');
  const state = join(home, 'desktop-shell');
  mkdirSync(state, { recursive: true });
  app.setPath('userData', state);
  process.env.DSH_HOME = home;
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
      { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local' },
      { id: 'llm-deepseek', disabled: true }, { id: 'llm-deepseek-account', disabled: true },
    ]);
    if (name === 'desktop') {
      const modules = join(dir, 'node_modules');
      const link = join(modules, 'dsh-bili-scroll');
      const target = join(root, '插件', 'dsh-bili-scroll');
      mkdirSync(modules, { recursive: true });
      // Recreate the junction after moving the extracted folder; never remove a real directory.
      let old;
      try { old = lstatSync(link); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (old && (!old.isSymbolicLink() || resolve(readlinkSync(link)) !== resolve(target))) {
        if (!old.isSymbolicLink()) throw Error('宠物插件链接位置被其他文件占用：' + link);
        unlinkSync(link);
        old = undefined;
      }
      if (!old) symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  return true;
}
