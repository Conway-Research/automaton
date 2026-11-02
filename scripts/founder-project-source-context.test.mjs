import test from 'node:test';import assert from 'node:assert/strict';
import {projectSourceContext} from './founder-project-source-context.mjs';
test('context exposes real interfaces and caller expectations without copying unrelated implementation bodies',()=>{
 const files=[{path:'cli.py',content:"from domain import Engine\ndef main():\n engine = Engine('db')\n engine.reserve('r', 2)\n print('implementation-only-body')\n"},{path:'domain.py',content:'class Engine:\n def reserve(self, name, qty):\n  return 7\n'}];
 const result=projectSourceContext(files,{components:files.map(f=>({path:f.path}))});const text=JSON.stringify(result);
 assert(text.includes('def reserve(self, name, qty)'));assert(text.includes("engine.reserve('r', 2)"));assert(!text.includes('implementation-only-body'));assert(!text.includes('return 7'));
});
test('diagnostic excerpts are restricted to existing model files and preserve exact editable text',()=>{
 const files=[{path:'cli.py',content:'one\n  failing_call()\nthree\n'}];
 const result=projectSourceContext(files,{components:[{path:'cli.py'}]},'NUMARON_SOURCE_EXCEPTIONS [{"file":"/source/cli.py","line":2},{"file":"/source/../../private","line":1}]');
 assert(result[0].excerpts[0].text.includes('  failing_call()'));assert.equal(result.length,1);assert(!JSON.stringify(result).includes('private'));
});
