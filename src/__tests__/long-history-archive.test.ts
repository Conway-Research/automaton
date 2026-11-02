import {it,expect} from 'vitest';
import {extractSingleCsvZip,extractBoardXmlZip} from '../revenue/long-history/archive.js';
function stored(name='data.csv'){
 const n=Buffer.from(name),data=Buffer.from('abc'),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt32LE(0x352441c2,14);local.writeUInt32LE(3,18);local.writeUInt32LE(3,22);local.writeUInt16LE(n.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt32LE(0x352441c2,16);central.writeUInt32LE(3,20);central.writeUInt32LE(3,24);central.writeUInt16LE(n.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+n.length,12);end.writeUInt32LE(30+n.length+3,16);
 return Buffer.concat([local,n,data,central,n,end]);
}
it('extracts exactly one verified CSV entry',()=>{expect(Buffer.from(extractSingleCsvZip(stored(),{maxBytes:100})).toString()).toBe('abc');});
it('extracts only the fixed Board data entry, not arbitrary XML files',()=>{expect(Buffer.from(extractBoardXmlZip(stored('H15_data.xml'),{maxBytes:100})).toString()).toBe('abc');expect(()=>extractBoardXmlZip(stored('evil.xml'),{maxBytes:100})).toThrow();});
it('extracts a bounded deflated entry',()=>{
 const b=stored(),local=b.subarray(0,38),central=Buffer.from(b.subarray(41,95)),end=Buffer.from(b.subarray(95));
 local.writeUInt16LE(8,8);local.writeUInt32LE(5,18);central.writeUInt16LE(8,10);central.writeUInt32LE(5,20);end.writeUInt32LE(43,16);
 const zip=Buffer.concat([local,Buffer.from('4b4c4a0600','hex'),central,end]);
 expect(Buffer.from(extractSingleCsvZip(zip,{maxBytes:100})).toString()).toBe('abc');
});
it('rejects traversal, CRC corruption and encrypted entries',()=>{
 expect(()=>extractSingleCsvZip(stored('../data.csv'),{maxBytes:100})).toThrow();
 const broken=stored();broken[38]^=1;expect(()=>extractSingleCsvZip(broken,{maxBytes:100})).toThrow(/CRC/i);
 const encrypted=stored();encrypted.writeUInt16LE(1,6);expect(()=>extractSingleCsvZip(encrypted,{maxBytes:100})).toThrow();
});
it('refuses multiple entries and expansion beyond reservation',()=>{
 const many=stored();many.writeUInt16LE(2,many.length-12);expect(()=>extractSingleCsvZip(many,{maxBytes:100})).toThrow();
 expect(()=>extractSingleCsvZip(stored(),{maxBytes:2})).toThrow(/size/i);
 expect(()=>extractSingleCsvZip(Buffer.from('not zip'),{maxBytes:100})).toThrow();
});
