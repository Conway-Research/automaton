import test from 'node:test';import assert from 'node:assert/strict';
import {officeFixture} from './founder-ugig-office-fixture.mjs';
import {officeGenerationKey,validateOfficeRelease} from './founder-ugig-office-contract.mjs';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {binaryManifestFiles,binaryMime} from './founder-binary-artifacts.mjs';
function setup(){const f=officeFixture();const result=checkedJSON({generationKey:officeGenerationKey(f.a),binaryArtifacts:[{name:'delivery.docx',type:binaryMime('delivery.docx'),size:1,sha256:'a'.repeat(64)}],files:f.a.requiredFiles.filter(n=>n!=='delivery.docx').map(path=>({path,content:'synthetic contract validation only'}))});result.packageDigest=digest({binaryArtifacts:result.binaryArtifacts,files:result.files});result.productDigest=digest({files:binaryManifestFiles({...result,deliveryProtocol:'mixed-files-v1'})});return {...f,result};}
test('valid independently identified specialist release remains admissible',()=>{const f=setup();assert.equal(validateOfficeRelease({agreement:f.a,result:f.result,releasePack:f.releaseFor(f.result),now:f.now}).valid,true);});
for(const padded of [false,true])test('owner cannot self-approve specialist review '+padded,()=>{const f=setup(),releasePack=f.releaseFor(f.result);releasePack.release.productReview.reviewerId=padded?' '+f.a.ownerId+' ':f.a.ownerId;releasePack.deliveryGrant.releaseDigest=digest(releasePack.release);assert.equal(validateOfficeRelease({agreement:f.a,result:f.result,releasePack,now:f.now}).valid,false);});
