import {it,expect} from 'vitest';
import {createDatabase} from '../state/database.js';
import {receiveSupportMessage} from '../commerce/support-inbox.js';
import {configureSupportOutbox} from '../commerce/support-outbox.js';
import {eraseSupportCase,supportErasureScope,configureSupportRetention,expireSupportCases,supportRetentionScope} from '../commerce/support-privacy.js';
import {fixtureSecurityReview} from './fixtures/security-review.js';
import {isProtectedFile} from '../self-mod/code.js';
it('privacy: configured retention expires terminal data only under a current reviewed policy',()=>{
 const db=createDatabase(':memory:');try{
  configureSupportOutbox(db.raw,'support@example.invalid',2);
  const message={mailbox:'support@example.invalid',providerId:'retention',from:'customer@example.invalid',subject:'private',body:'personal'};
  const terminal=receiveSupportMessage(db.raw,message),pending=receiveSupportMessage(db.raw,{...message,providerId:'pending'});
  db.raw.prepare("UPDATE obolus_support_inbox SET status='reviewed' WHERE id=?").run(terminal.id);
  const old='a'.repeat(64);
  db.raw.prepare("INSERT INTO obolus_support_inbox(id,payload,status,created_at) VALUES(?,?,'reviewed',datetime('now','-31 days'))").run(old,JSON.stringify(message));
  expect(expireSupportCases(db.raw)).toEqual({configured:false,erased:0});
  expect(()=>configureSupportRetention(db.raw,30)).toThrow('INSUFFICIENT');
  fixtureSecurityReview(db.raw,supportRetentionScope(30),Date.now());configureSupportRetention(db.raw,30);
  expect(expireSupportCases(db.raw)).toEqual({configured:true,erased:1});
  expect(db.raw.prepare('SELECT 1 FROM obolus_support_inbox WHERE id=?').get(old)).toBeUndefined();
  expect(db.raw.prepare('SELECT 1 FROM obolus_support_erasure WHERE inbox_id=?').get(old)).toBeTruthy();
  expect(db.raw.prepare('SELECT 1 FROM obolus_support_inbox WHERE id=?').get(pending.id)).toBeTruthy();
  expect(()=>configureSupportRetention(db.raw,3650)).toThrow('Retention');
 }finally{db.close();}
});
it('privacy: erases only a reviewed terminal case, prevents replay and preserves financial records and triggers',()=>{
 const db=createDatabase(':memory:');try{
  configureSupportOutbox(db.raw,'support@example.invalid',2);
  const message={mailbox:'support@example.invalid',providerId:'fixture',from:'customer@example.invalid',subject:'private',body:'personal-support-content'};
  const first=receiveSupportMessage(db.raw,message),other=receiveSupportMessage(db.raw,{...message,providerId:'other'});
  expect(()=>eraseSupportCase(db.raw,first.id)).toThrow('INSUFFICIENT_EVIDENCE');
  fixtureSecurityReview(db.raw,supportErasureScope(first.id),Date.now());
  expect(()=>eraseSupportCase(db.raw,first.id)).toThrow('resolve');
  db.raw.prepare("UPDATE obolus_support_inbox SET status='reviewed' WHERE id=?").run(first.id);
  const changes=db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get();
  expect(eraseSupportCase(db.raw,first.id)).toEqual({erased:true,duplicate:false});
  expect(eraseSupportCase(db.raw,first.id)).toEqual({erased:true,duplicate:true});
  expect(receiveSupportMessage(db.raw,message)).toMatchObject({duplicate:true,status:'erased'});
  expect(db.raw.prepare('SELECT payload FROM obolus_support_inbox WHERE id=?').get(first.id)).toBeUndefined();
  expect(db.raw.prepare('SELECT 1 FROM obolus_support_inbox WHERE id=?').get(other.id)).toBeTruthy();
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual(changes);
  expect(()=>db.raw.prepare('DELETE FROM obolus_support_inbox WHERE id=?').run(other.id)).toThrow('immutable');
  expect(()=>db.raw.exec('DELETE FROM obolus_support_erasure')).toThrow('immutable');
  expect(isProtectedFile('src/commerce/support-privacy.ts')).toBe(true);
 }finally{db.close();}
});
