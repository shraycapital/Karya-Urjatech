# PWA Icons Required

To fix PWA installation on Android Chrome, you need to create PNG icons in these sizes:

## Required Icon Sizes:
- 72x72.png
- 96x96.png  
- 128x128.png
- 144x144.png
- 152x152.png
- 192x192.png (CRITICAL for Android)
- 384x384.png
- 512x512.png (CRITICAL for Android)

## How to Generate Icons:

### Option 1: Online Icon Generator
1. Go to https://realfavicongenerator.net/
2. Upload your favicon.ico or logo image
3. Download the generated icon set
4. Replace the placeholder files in this folder

### Option 2: Image Editor
1. Open your logo in any image editor (Photoshop, GIMP, Canva)
2. Resize to each required size
3. Export as PNG with transparent background
4. Save with the exact names shown above

### Option 3: Command Line (if you have ImageMagick)
```bash
convert favicon.ico -resize 72x72 icons/icon-72x72.png
convert favicon.ico -resize 96x96 icons/icon-96x96.png
convert favicon.ico -resize 128x128 icons/icon-128x128.png
convert favicon.ico -resize 144x144 icons/icon-144x144.png
convert favicon.ico -resize 152x152 icons/icon-152x152.png
convert favicon.ico -resize 192x192 icons/icon-192x192.png
convert favicon.ico -resize 384x384 icons/icon-384x384.png
convert favicon.ico -resize 512x512 icons/icon-512x512.png
```

## Important Notes:
- Icons must be PNG format (not ICO)
- 192x192 and 512x512 are REQUIRED for Android Chrome
- Use transparent background for best results
- Icons should be square and properly centered
