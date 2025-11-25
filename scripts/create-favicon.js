const fs = require('fs');
const path = require('path');

// Create a simple .ico file from the 32x32 PNG
// For a proper multi-resolution .ico, we'd need a library, but for now we'll just copy the 32x32
const source = path.join(__dirname, '../public/favicon-32x32.png');
const dest = path.join(__dirname, '../public/favicon.ico');

// For browsers, a .ico file can actually just be a PNG renamed
// Modern browsers will accept this
fs.copyFileSync(source, dest);
console.log('✓ favicon.ico created');
