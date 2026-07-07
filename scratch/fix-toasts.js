const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('frontend/src/pages', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Pattern to match: catch (errName) { ... toast.error('some string'); ... }
    // Since AST parsing is heavy for a quick script, we will use a regex that handles common cases
    // We replace generic toast.error('string') with toast.error(errName.response?.data?.message || 'string')
    
    // Split into lines
    const lines = content.split('\n');
    let currentCatchParam = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const catchMatch = line.match(/catch\s*\(\s*([a-zA-Z0-9_]+)\s*\)/);
      if (catchMatch) {
        currentCatchParam = catchMatch[1];
      }

      // If we are inside a catch or just below it, and see a toast.error('...')
      if (currentCatchParam && line.includes('toast.error(')) {
        // Find if it's purely a string: toast.error('...')
        // Avoid replacing if it already has || or variables (like error.response...)
        if (line.match(/toast\.error\(\s*['"]([^'"]+)['"]\s*\)/)) {
          lines[i] = line.replace(
            /toast\.error\(\s*['"]([^'"]+)['"]\s*\)/,
            `toast.error(${currentCatchParam}.response?.data?.message || '$1')`
          );
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
