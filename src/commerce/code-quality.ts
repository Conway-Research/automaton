import ts from 'typescript';
import {createHash} from 'node:crypto';
/** Parse only: never execute generated code, imports, package scripts or a compiler plugin. */
export function inspectCode(content:string,language:'typescript'|'javascript'){
 if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>100000||!['typescript','javascript'].includes(language))throw Error('Bounded TypeScript or JavaScript required');
 const file=ts.createSourceFile(language==='typescript'?'product.ts':'product.js',content,ts.ScriptTarget.Latest,true,language==='typescript'?ts.ScriptKind.TS:ts.ScriptKind.JS);
 const compiler=ts.transpileModule(content,{fileName:file.fileName,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,allowJs:true}});
 const syntax=(compiler.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>({code:d.code,line:d.start===undefined?null:file.getLineAndCharacterOfPosition(d.start).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 const security:{code:string;line:number}[]=[];
 const add=(node:ts.Node,code:string)=>security.push({code,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1});
 function visit(node:ts.Node){
  if(ts.isCallExpression(node)||ts.isNewExpression(node)){
   const expression=node.expression;
   if(ts.isIdentifier(expression)&&['eval','Function','exec','execSync','spawn','spawnSync'].includes(expression.text))add(node,'dynamic_execution_review');
   if(ts.isPropertyAccessExpression(expression)&&['eval','exec','execSync','spawn','spawnSync','write','writeFile','writeFileSync'].includes(expression.name.text))add(node,'execution_or_write_review');
   if(ts.isIdentifier(expression)&&expression.text==='require'||expression.kind===ts.SyntaxKind.ImportKeyword)add(node,'dynamic_import_review');
  }
  if(ts.isImportDeclaration(node))add(node,'dependency_review_required');
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&['innerHTML','outerHTML'].includes(node.left.name.text))add(node,'html_injection_review');
  if(ts.isIdentifier(node)&&node.text==='fetch')add(node,'network_review_required');
  ts.forEachChild(node,visit);
 }
 visit(file);
 const formatted=syntax.length?null:ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(file);
 return {sourceDigest:createHash('sha256').update(content).digest('hex'),syntax,security:security.slice(0,100),securityTruncated:security.length>100,formatted,
  status:syntax.length||security.length?'repair_or_review_required':'syntax_checked',executionPerformed:false,
  remainingChecks:['project_typecheck','dependency_and_license_audit','unit_and_integration_tests','security_tests','runtime_isolation'],
  limitation:'Static syntax and selected risky patterns only; not proof of secure or correct software. Formatting is a candidate that must be retested. Imported code is neither read nor executed. No automatic security rewrites.'};
}
