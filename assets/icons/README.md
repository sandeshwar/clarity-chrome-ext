# Clarity Extension Icons

This directory contains all icon assets for the Clarity Chrome extension in both SVG and PNG formats.

## Icon Design

The Clarity icon features a modern, layered browser window design with:
- **Purple-blue gradient background** (#4F46E5 → #7C3AED → #2563EB)
- **Layered windows** showing depth and organization
- **macOS-style window controls** (red, yellow, green dots)
- **Content lines** representing organized tabs
- **Sparkle accent** symbolizing clarity and organization
- **Rounded corners** for a modern, friendly appearance

## Files

### Extension Icons (Required by Chrome)
- `icon-16.png` / `icon-16.svg` - 16×16px - Toolbar icon (small)
- `icon-32.png` / `icon-32.svg` - 32×32px - Toolbar icon (medium)
- `icon-48.png` / `icon-48.svg` - 48×48px - Extension management page
- `icon-128.png` / `icon.svg` - 128×128px - Chrome Web Store & installation

### Promotional Assets
- `logo-512.png` / `logo-512.svg` - 512×512px - High-resolution logo for marketing
- `promo-tile.png` / `promo-tile.svg` - 440×280px - Chrome Web Store promotional tile

## Design Specifications

### Color Palette
- **Primary Gradient**: Indigo (#4F46E5) → Purple (#7C3AED) → Blue (#2563EB)
- **Window Controls**: 
  - Red: #FF5F57
  - Yellow: #FFBD2E
  - Green: #28CA42
- **Window Surface**: White with opacity (0.9-0.95)
- **Content Lines**: White with 40-50% opacity

### Typography (Promo Tile)
- **Title**: System UI, 48px, Bold (700)
- **Subtitle**: System UI, 20px, Medium (500)
- **Features**: System UI, 16px, Regular (400)

## Usage

### In manifest.json
```json
"icons": {
  "16": "assets/icons/icon-16.png",
  "32": "assets/icons/icon-32.png",
  "48": "assets/icons/icon-48.png",
  "128": "assets/icons/icon-128.png"
}
```

### Chrome Web Store
- Use `icon-128.png` as the main extension icon
- Use `promo-tile.png` for the promotional tile (440×280)
- Use `logo-512.png` for marketing materials and social media

## Regenerating PNG Files

If you need to regenerate PNG files from SVG sources:

```bash
# Using ImageMagick
magick -background none -density 300 icon-16.svg -resize 16x16 icon-16.png
magick -background none -density 300 icon-32.svg -resize 32x32 icon-32.png
magick -background none -density 300 icon-48.svg -resize 48x48 icon-48.png
magick -background none -density 300 icon.svg -resize 128x128 icon-128.png
magick -background none -density 300 logo-512.svg -resize 512x512 logo-512.png
magick -background none -density 300 promo-tile.svg -resize 440x280 promo-tile.png
```

## Design Philosophy

The icon design emphasizes:
1. **Clarity** - Clean, organized visual hierarchy
2. **Modernity** - Contemporary design with gradients and depth
3. **Professionalism** - Polished appearance suitable for productivity tools
4. **Recognition** - Distinctive design that stands out in the toolbar
5. **Scalability** - Works well at all sizes from 16px to 512px

## License

These icons are part of the Clarity Chrome Extension and are subject to the same license as the main project.
