const fs = require('fs');
let code = fs.readFileSync('src/config.ts', 'utf8');

// Replace invalid template literal syntax
code = code.replace(/new RegExp\(\`\^\\\\\\\\s\*\$\\\{key\\\}=\.\*\\\\\$\`, "m"\)/, 'new RegExp(`^\\\\s*${key}=.*$`, "m")');

// Wait, the error is: Invalid character at \`^\\\\s*...
// Let's just fix it completely by re-writing the saveConfig function manually.
