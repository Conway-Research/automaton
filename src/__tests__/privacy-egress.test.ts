import {it,expect} from 'vitest';
import {assertModelPrivacy} from '../security/privacy-egress.js';
import {registerLogSecrets,redactLogText} from '../observability/redaction.js';
it.each(['ｃｕｓｔｏｍｅｒ＠ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ','customer@exam\u200bple.invalid','１２３-４５-６７８９'])('privacy: canonicalized obfuscated identifiers are blocked (%s)',content=>{
 const input={content};expect(()=>assertModelPrivacy(input)).toThrow('Personal or payment');expect(input.content).toBe(content);
});
it('privacy: zero-width splitting cannot export a registered credential, even locally',()=>{
 registerLogSecrets(['synthetic-obfuscation-fixture']);
 expect(()=>assertModelPrivacy({content:'synthetic-obfus\u200bcation-fixture'},true)).toThrow('Credential material');
});
it.each(['customer@example.invalid','123-45-6789','CH93 0076 2011 6238 5295 7'])('privacy: ordinary external inference denies personal/payment identifiers %s',content=>{
 expect(()=>assertModelPrivacy({content})).toThrow('Personal or payment data blocked');
 expect(()=>assertModelPrivacy({content},true)).not.toThrow();
});
it('privacy: local transport never permits credentials; logs mask mail addresses',()=>{
 const secret='private-fixture-dlp-material';registerLogSecrets([secret]);
 expect(()=>assertModelPrivacy({content:secret},true)).toThrow('Credential material');
 expect(redactLogText('Customer customer@example.invalid')).toBe('Customer [REDACTED-EMAIL]');
 expect(()=>assertModelPrivacy({content:'Aggregate revenue 123 cents, no customer identifiers'})).not.toThrow();
});
