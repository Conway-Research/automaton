import test from 'node:test';
import assert from 'node:assert/strict';
import {collectMail, classifyDpa, nextAlerts, gmailRead} from './numaron-avv-monitor.mjs';
test('mail reader follows pagination and never uses mutations', async()=>{
 const calls=[];const data={payload:{headers:[{name:'From',value:'Zoho Sign <notifications@zohosign.eu>'},{name:'To',value:'info@numaron.ch'},{name:'Subject',value:'Data Processing Addendum: signature requested'}]}};
 const rows=await collectMail(async p=>{calls.push(p);if(p.startsWith('profile'))return {emailAddress:'numaronia@gmail.com'};if(p.startsWith('messages/a'))return data;if(p.includes('pageToken='))return {messages:[{id:'a'}]};return {nextPageToken:'next'};});
 assert.equal(rows.length,1);assert.equal(rows[0].id,'a');assert.ok(calls.some(x=>x.includes('includeSpamTrash=true')));assert.ok(calls.some(x=>x.includes('pageToken=next')));
 assert.ok(!JSON.stringify(rows).includes('http'));assert.ok(!JSON.stringify(rows).includes('payload'));
});
test('wrong mailbox, malformed response and unbounded pagination fail closed',async()=>{
 await assert.rejects(collectMail(async()=>({emailAddress:'wrong@gmail.com'})),/mail-account/);
 await assert.rejects(collectMail(async p=>p==='profile'?{emailAddress:'numaronia@gmail.com'}:{messages:'bad'}),/mail-response/);
 await assert.rejects(collectMail(async p=>p==='profile'?{emailAddress:'numaronia@gmail.com'}:{nextPageToken:'next'}),/mail-pagination/);
});
test('mail filter ignores unrelated Zoho and wrong recipients',async()=>{
 const read=async p=>p==='profile'?{emailAddress:'numaronia@gmail.com'}:p.startsWith('messages?')?{messages:[{id:'a'},{id:'b'}]}:{payload:{headers:[{name:'From',value:p.includes('/a')?'noreply@zohoaccounts.eu':'sign@evil.example'},{name:'To',value:'info@numaron.ch'},{name:'Subject',value:p.includes('/a')?'Neue E-Mail-Adresse hinzugefügt':'Data Processing Addendum signature'}]}};
 assert.deepEqual(await collectMail(read),[]);
});
test('only explicit DPA text is classified; unknown/login is never pending',()=>{
 assert.equal(classifyDpa('Datenschutz Datenverarbeitungszusatz Ausstehende Signaturen').status,'pending-signatures');
 assert.equal(classifyDpa('Anmelden zum Zugriff auf Accounts').status,'login-required');
 assert.equal(classifyDpa('Re-authentication needed','https://accounts.zoho.eu/account/v1/relogin').status,'login-required');
 assert.equal(classifyDpa('Datenschutz Datenverarbeitungszusatz strange layout').status,'unrecognized');
 assert.equal(classifyDpa('Datenschutz Datenverarbeitungszusatz Abgelehnt').status,'rejected');
});
test('invitation, state change and errors notify once; initial pending stays silent',()=>{
 const first=nextAlerts({seen:[],dpaStatus:'pending-signatures'},{mail:{status:'ok',invitations:[]},zoho:{status:'pending-signatures'}});assert.equal(first.alerts.length,0);
 const result={mail:{status:'ok',invitations:[{id:'a',subject:'DPA'}]},zoho:{status:'rejected'}};
 const second=nextAlerts(first.state,result);assert.equal(second.alerts.length,2);
 assert.equal(nextAlerts(second.state,result).alerts.length,0);
 const failure={mail:{status:'gmail-access-required'},zoho:{status:'profile-busy'}};
 const third=nextAlerts(second.state,failure);assert.equal(third.alerts.length,2);assert.equal(nextAlerts(third.state,failure).alerts.length,0);
 assert.equal(third.state.dpaStatus,'rejected');
});
test('Gmail transport rejects arbitrary paths and uses only GET',async()=>{
 let calls=0;await assert.rejects(gmailRead('messages/send','token',async()=>{calls++;}),/mail-path/);assert.equal(calls,0);
 await gmailRead('profile','token',async(u,o)=>{calls++;assert.equal(o.method,'GET');assert.equal(o.redirect,'error');return Response.json({emailAddress:'numaronia@gmail.com'});});assert.equal(calls,1);
});
