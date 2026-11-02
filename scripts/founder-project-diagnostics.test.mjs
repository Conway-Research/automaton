import test from 'node:test';import assert from 'node:assert/strict';
import {projectDiagnosticExecution} from './founder-project-diagnostics.mjs';
test('argument diagnostics default off and require an explicit boolean synthetic scope',()=>{
 assert(projectDiagnosticExecution().includes('synthetic_arguments=False'));assert(projectDiagnosticExecution({syntheticArguments:true}).includes('synthetic_arguments=True'));assert.throws(()=>projectDiagnosticExecution({syntheticArguments:'true'}),/synthetic|boolean/i);
});
test('synthetic debugger captures bounded primitive parameters without globals or custom representations',()=>{
 const script=projectDiagnosticExecution({syntheticArguments:true});assert(script.includes('NUMARON_SYNTHETIC_EXCEPTION_ARGUMENTS'));assert(script.includes('co_argcount'));assert(script.includes('co_kwonlyargcount'));assert(script.includes('type(argument)'));assert(script.includes('password|secret|token'));assert(script.includes('len(arguments)>=4'));assert(script.includes('argument[:160]'));assert(!script.includes('repr('));assert(!script.includes('f_globals'));
});
