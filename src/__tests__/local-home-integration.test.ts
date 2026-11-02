import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createConwayClient} from '../conway/client.js';
import {installDefaultSkills} from '../setup/defaults.js';
import {loadSkills} from '../skills/loader.js';
import {loadCurrentSoul,parseSoulMd} from '../soul/model.js';
import type {AutomatonDatabase,Skill} from '../types.js';

const dirs:string[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
function isolatedHome(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-home-'));dirs.push(dir);
 vi.stubEnv('HOME',undefined);vi.spyOn(os,'homedir').mockReturnValue(dir);
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Network forbidden');}));return dir;
}
afterEach(()=>vi.unstubAllGlobals());

it('reads and writes local files under the system home without contacting a provider',async()=>{
 const home=isolatedHome();
 const client=createConwayClient({apiUrl:'https://example.invalid',apiKey:'test-only',sandboxId:''});
 await client.writeFile('~/.automaton/test.txt','isolated fixture');
 expect(fs.readFileSync(path.join(home,'.automaton/test.txt'),'utf8')).toBe('isolated fixture');
 expect(await client.readFile('~/.automaton/test.txt')).toBe('isolated fixture');
 expect(fetch).not.toHaveBeenCalled();
});

it('installs and reloads default skills and reads the soul from the same isolated home',()=>{
 const home=isolatedHome();installDefaultSkills('~/.automaton/skills');
 const skills:Skill[]=[];
 const db={getSkillByName:()=>undefined,upsertSkill:(s:Skill)=>skills.push(s),getSkills:()=>skills} as unknown as AutomatonDatabase;
 expect(loadSkills('~/.automaton/skills',db).length).toBeGreaterThan(0);
 const soul='# Isolated test soul\n\nOnly a local fixture.\n';
 fs.writeFileSync(path.join(home,'.automaton/SOUL.md'),soul);
 const parsed=loadCurrentSoul(null);
 expect(parsed).not.toBeNull();expect(parsed?.rawContent).toBe(parseSoulMd(soul).rawContent);
 expect(fetch).not.toHaveBeenCalled();
});
