
import fs from 'fs';
import path from 'path';

const searchDir = 'f:/vite/comment-viewer/temp_niconama/workspaces/api/niconama/proto';
const outFile = 'f:/vite/comment-viewer/public/ndgr_full.proto';

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(file));
        } else {
            if (file.endsWith('.proto')) results.push(file);
        }
    });
    return results;
}

const files = getFiles(searchDir);
console.log(`Found ${files.length} proto files.`);

let content = '';
files.forEach(f => {
    let c = fs.readFileSync(f, 'utf8');
    // Remove syntax and package lines to avoid collisions? 
    // Or keep them and hope protobufjs handles multiple packages?
    // Usually standard concat works if packages are same or compatible.
    // But duplicate "syntax = ..." might be error.
    // Let's comment out syntax lines after the first one.
    c = c.replace(/syntax = "proto3";/g, '// syntax = "proto3";');
    c = c.replace(/package dwango/g, '// package dwango'); // We might want to unify package?
    // Actually, simply appending might break if there are imports.
    // Ideally we assume they are compatible or use imports.
    // But since we want ONE file for browser, we should try to inline.
    // However, keeping it simple: Just concat and let's see.
    // Re-adding syntax at top.
    content += `// File: ${path.basename(f)}\n${c}\n\n`;
});

const finalContent = 'syntax = "proto3";\npackage dwango.nicolive.chat.service.edge;\n\n' + content;

fs.writeFileSync(outFile, finalContent);
console.log('Done.');
