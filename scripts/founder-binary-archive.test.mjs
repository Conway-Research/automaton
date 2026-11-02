import test from 'node:test';import assert from 'node:assert/strict';import {deflateRawSync} from 'node:zlib';
import {validateBinary,crc32} from './founder-binary-artifacts.mjs';
function zip(entries){let offset=0;const local=[],central=[];for(const [name,input] of entries){const n=Buffer.from(name),b=Buffer.from(input),data=deflateRawSync(b),crc=crc32(b),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(b.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length;}const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,cd,end]);}
const office=[['[Content_Types].xml','<Types/>'],['_rels/.rels','<Relationships/>'],['word/document.xml','<document/>']];
test('standard CRC32 check vector',()=>assert.equal(crc32(Buffer.from('123456789')),0xcbf43926));
for(const [name,entries] of [
 ['traversal',[...office,['../escape','x']]],
 ['case collision',[...office,['WORD/DOCUMENT.XML','x']]],
 ['macro',[...office,['word/vbaProject.bin','x']]],
 ['external relationship',[...office,['word/_rels/document.xml.rels','<Relationship TargetMode=\"External\" Target=\"https://example.com\"/>']]],
 ['external target without mode',[...office,['word/_rels/document.xml.rels','<Relationship Target="https://example.com"/>']]],
 ['encoded target',[...office,['word/_rels/document.xml.rels','<Relationship Target="&#104;ttps://example.com"/>']]],
 ['entity',[...office,['word/other.xml','<!DOCTYPE x [<!ENTITY x SYSTEM \"file:///private\">]><x>&x;</x>']]],
 ['UTF16 external relationship',[...office,['word/_rels/document.xml.rels',Buffer.from('<Relationship TargetMode=\"External\"/>','utf16le')]]],
 ['expansion',[...office,['word/other.xml','a'.repeat(200000)]]],
 ['nested executable',[...office,['word/payload.exe','MZ']]],
 ])test('archive rejects '+name,()=>assert.throws(()=>validateBinary('document.docx',zip(entries))));
test('model pickle is not an allowed model delivery',()=>assert.throws(()=>validateBinary('model.zip',zip([['model.pkl','fake']]))));
test('archive CRC corruption rejected',()=>{const b=zip(office);b[50]^=1;assert.throws(()=>validateBinary('document.docx',b));});
