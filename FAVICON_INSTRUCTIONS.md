# Favicon Creation Instructions

## Source Image
You've uploaded the Club 19 London logo. To create the favicons, follow these steps:

## Required Transformations
1. **Invert colors**: Black background, white logo/text
2. **Center the logo** (remove Instagram padding)
3. **Increase contrast** for small sizes
4. **Optimize for clarity** at 16x16 and 32x32

## Option 1: Use Online Tool (Easiest)
1. Go to https://realfavicongenerator.net/
2. Upload your Club 19 logo image
3. Configure:
   - iOS: Use black background, white logo
   - Android: Same
   - Windows: Same
   - Favicon: Generate all sizes
4. Download the package
5. Place files in `/app` directory as shown below

## Option 2: Use Figma/Photoshop
1. Open the logo in Figma or Photoshop
2. Create a new 512x512px canvas with BLACK background (#000000)
3. Place the Club 19 logo in center
4. Invert colors to WHITE (#FFFFFF)
5. Export as:
   - PNG 512x512 → `icon-512.png`
   - PNG 192x192 → `icon-192.png`
   - PNG 180x180 → `apple-touch-icon.png`
   - PNG 32x32 → `favicon-32x32.png`
   - PNG 16x16 → `favicon-16x16.png`

## Option 3: Use ImageMagick (Command Line)
If you have ImageMagick installed:

\`\`\`bash
# Assuming you have 'club19-logo.png' saved locally

# Invert colors and create black background
convert club19-logo.png -negate -background black -alpha remove inverted-logo.png

# Generate all sizes
convert inverted-logo.png -resize 512x512 icon-512.png
convert inverted-logo.png -resize 192x192 icon-192.png
convert inverted-logo.png -resize 180x180 apple-touch-icon.png
convert inverted-logo.png -resize 32x32 favicon-32x32.png
convert inverted-logo.png -resize 16x16 favicon-16x16.png

# Create .ico file with multiple sizes
convert favicon-16x16.png favicon-32x32.png favicon.ico
\`\`\`

## File Placement

### Next.js 14 App Router
Place these files in the `/app` directory:

\`\`\`
/app
  ├── icon.png (or icon.tsx for dynamic)
  ├── apple-icon.png
  └── favicon.ico
\`\`\`

OR in `/public` directory:

\`\`\`
/public
  ├── favicon.ico
  ├── apple-touch-icon.png
  ├── icon-192.png
  ├── icon-512.png
  └── favicon-16x16.png
  └── favicon-32x32.png
\`\`\`

## Design Specifications

### Colors
- Background: `#000000` (black)
- Logo/Text: `#FFFFFF` (white)
- Border: `#FFFFFF` (white, 2-3px stroke)

### Typography
- "CLUB19": Serif font (Playfair Display or similar)
- "LONDON": Serif font, lighter weight, letter-spaced

### Layout
- Circular border around the logo
- "C" and "19" in large serif type in center
- "LONDON" text below in smaller size

### Sizes Required
- **favicon.ico**: 16x16 + 32x32 (multi-resolution)
- **apple-touch-icon.png**: 180x180 (iOS home screen)
- **icon-192.png**: 192x192 (Android/PWA)
- **icon-512.png**: 512x512 (Android/PWA, high-res)

## Quality Tips
- Use vector (SVG) as source if possible for crisp scaling
- For 16x16, simplify details (may need custom version)
- Ensure sufficient contrast
- Test on both light and dark backgrounds
- Check visibility in browser tabs

## Next Steps
After generating the images:
1. Place them in `/app` or `/public` directory
2. Update `app/layout.tsx` metadata (already prepared)
3. Test by clearing browser cache and reloading
