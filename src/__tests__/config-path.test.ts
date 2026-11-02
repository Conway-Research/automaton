import {afterEach, expect, it, vi} from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {resolvePath} from '../config.js';

afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

it('uses the operating system home when HOME is absent or empty',()=>{
  const home=path.resolve('test-user-home');
  vi.spyOn(os,'homedir').mockReturnValue(home);
  for(const value of [undefined,'']){
    vi.stubEnv('HOME',value);
    expect(resolvePath('~/.automaton/state.db')).toBe(path.join(home,'.automaton/state.db'));
    expect(resolvePath('~')).toBe(home);
  }
});

it('preserves explicit HOME overrides',()=>{
  const home=path.resolve('isolated-test-home');vi.stubEnv('HOME',home);
  expect(resolvePath('~/.automaton/state.db')).toBe(path.join(home,'.automaton/state.db'));
});

it('preserves literal relative, absolute and named-user paths',()=>{
  for(const input of ['state.db','./data/state.db',path.resolve('data/state.db'),'~other/state.db','~backup']){
    expect(resolvePath(input)).toBe(input);
  }
});

it('selects the same system home for configuration, wallet and database without HOME',async()=>{
  const home=path.resolve('system-test-home');
  vi.stubEnv('HOME',undefined);vi.spyOn(os,'homedir').mockReturnValue(home);
  vi.resetModules();
  const wallet=await import('../identity/wallet.js');
  const config=await import('../config.js');
  expect(wallet.getAutomatonDir()).toBe(path.join(home,'.automaton'));
  expect(wallet.getWalletPath()).toBe(path.join(home,'.automaton','wallet.json'));
  expect(config.getConfigPath()).toBe(path.join(home,'.automaton','automaton.json'));
  expect(config.resolvePath('~/.automaton/state.db')).toBe(path.join(wallet.getAutomatonDir(),'state.db'));
});
