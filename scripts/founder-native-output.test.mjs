import test from 'node:test';import assert from 'node:assert/strict';import {writeNativeOutput} from './founder-native-output.mjs';
test('Docs fills only empty owned output, verifies content and never repeats matching insertion',async()=>{
 let text='',writes=0;const content='Private checked source-based draft. '.repeat(12);const call=async(url,o)=>{if(o.method==='POST'){writes++;assert.equal(JSON.parse(o.body).writeControl.requiredRevisionId,'rev1');text=JSON.parse(o.body).requests[0].insertText.text;return {};}return {documentId:'doc1',revisionId:'rev1',body:{content:[{paragraph:{elements:[{textRun:{content:text+'\n'}}]}}]}};};
 await writeNativeOutput({format:'document',id:'doc1',content,headers:{},call});await writeNativeOutput({format:'document',id:'doc1',content,headers:{},call});assert.equal(writes,1);
 text='Someone changed this document';await assert.rejects(writeNativeOutput({format:'document',id:'doc1',content,headers:{},call}),/changed/);
});
test('Sheets atomically creates its own populated tab without overwriting concurrent user edits',async()=>{
 const content=JSON.stringify([['=not_a_formula','Evidence'],['Finding','Unconfirmed']]);let exists=false,rows=[],writes=0;
 const call=async(url,o)=>{if(o.method==='POST'){const b=JSON.parse(o.body);assert.equal(b.requests[0].addSheet.properties.title,'Numaron');assert.equal(b.requests[1].updateCells.start.sheetId,b.requests[0].addSheet.properties.sheetId);if(exists)throw Error('concurrent sheet exists');exists=true;rows=b.requests[1].updateCells.rows.map(r=>r.values.map(v=>v.userEnteredValue.stringValue));writes++;return {};}
 if(url.includes('/values/'))return {values:rows};return {sheets:exists?[{properties:{title:'Numaron',sheetId:173801}}]:[]};};
 await writeNativeOutput({format:'spreadsheet',id:'sheet1',content,headers:{},call});await writeNativeOutput({format:'spreadsheet',id:'sheet1',content,headers:{},call});assert.equal(writes,1);assert.equal(rows[0][0],'=not_a_formula');rows=[['user edit']];await assert.rejects(writeNativeOutput({format:'spreadsheet',id:'sheet1',content,headers:{},call}),/changed/);assert.equal(writes,1);
 let calls=0;await assert.rejects(writeNativeOutput({format:'spreadsheet',id:'sheet2',content,headers:{},call:async(url,o)=>{calls++;if(o.method==='GET')return {sheets:[]};assert.equal(o.method,'POST');throw Error('concurrent sheet exists');}}),/concurrent/);assert.equal(calls,2);
});
