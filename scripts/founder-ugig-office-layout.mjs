import {sha256} from './founder-binary-artifacts.mjs';
import {officeMust as must} from './founder-ugig-office-contract.mjs';

// Requirements come only from the immutable, agreed specification.
export function officeLayoutRequirements(agreement,bytes){
 must(['document-cleanup','support-templates'].includes(agreement.workKind),'layout work kind');
 must(Buffer.isBuffer(bytes)&&bytes.length<=256000&&bytes.length===agreement.specRef?.size&&sha256(bytes)===agreement.specRef.sha256,'layout specification binding');
 const spec=JSON.parse(bytes.toString('utf8'));
 must(spec&&typeof spec==='object'&&!Array.isArray(spec),'layout specification');
 if(!Object.hasOwn(spec,'layout'))return {};
 const layout=spec.layout;
 must(layout&&typeof layout==='object'&&!Array.isArray(layout)&&Object.keys(layout).length===1&&Array.isArray(layout.expectedPages)&&layout.expectedPages.length<=30,'layout requirements');
 const entries=[],seen=new Set();
 for(const item of layout.expectedPages){
  must(item&&typeof item==='object'&&Object.keys(item).sort().join(',')==='heading,page','layout entry');
  must(typeof item.heading==='string'&&item.heading===item.heading.trim()&&item.heading.length>0&&item.heading.length<=300&&!/[\u0000-\u001f\u007f]/.test(item.heading)&&!seen.has(item.heading),'layout heading');
  must(Number.isInteger(item.page)&&item.page>=1&&item.page<=30,'layout page');
  seen.add(item.heading);entries.push([item.heading,item.page]);
 }
 return Object.fromEntries(entries);
}
