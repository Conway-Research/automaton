import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';
import {initializeSalesControl,salesPaused,setSalesPaused} from '../commerce/sales-control.js';
it('defaults live sales to paused and preserves operator state across connections and restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-sales-')),file=path.join(dir,'shop.db');
 const a=new Database(file),b=new Database(file);
 try {
  a.exec("CREATE TABLE commerce_stripe_config(id INTEGER PRIMARY KEY,mode TEXT);INSERT INTO commerce_stripe_config VALUES(1,'live')");
  initializeSalesControl(a);expect(salesPaused(a)).toBe(true);
  setSalesPaused(a,false);initializeSalesControl(b);expect(salesPaused(b)).toBe(false);
  setSalesPaused(b,true);expect(salesPaused(a)).toBe(true);
  const c=new Database(file);try{initializeSalesControl(c);expect(salesPaused(c)).toBe(true);expect(c.prepare('SELECT COUNT(*) n FROM obolus_sales_audit').get()).toEqual({n:2});}finally{c.close();}
 }finally{b.close();a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
