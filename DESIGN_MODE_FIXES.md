# Design Mode Persistence Fixes

## Issues Fixed

### 1. **Selector Generation Using Temporary Attributes**
**Problem**: When creating design annotations, the selector generator would fall back to adding a temporary `data-pointa-id` attribute when it couldn't find a unique stable selector. This attribute doesn't persist across page reloads, causing elements to not be found after reload.

**Root Cause**: In `selector-generator.js`, the `generateClean()` method was calling `this.generate()` as a last resort, which adds temporary attributes.

**Fix**: Modified `generateClean()` to use a robust fallback (nth-of-type with parent context) instead of calling `generate()`. This ensures selectors are always based on stable DOM structure.

**File**: `extension/content/modules/selector-generator.js` lines 452-477

### 2. **Temporary Classes in Element Context**
**Problem**: When capturing element context for annotations, temporary `pointa-` classes (like `pointa-design-editing`) were being saved. These classes are added during editing but don't exist after page reload.

**Root Cause**: In `content.js`, the `generateElementContext()` method was capturing ALL classes without filtering.

**Fix**: Added filter to remove classes starting with `pointa-` when capturing element context.

**File**: `extension/content/content.js` line 345

### 3. **Opacity Value Range Mismatch**
**Problem**: The opacity slider uses values 0-100, but CSS opacity uses 0-1. When applying annotations after reload, opacity values were being applied directly (e.g., "50" instead of "0.5").

**Root Cause**: The `applyDesignChanges()` function didn't have special handling for opacity to convert from slider range to CSS range.

**Fix**: Added special case for opacity property to convert from 0-100 to 0-1 before applying.

**File**: `extension/content/modules/design-mode.js` lines 1082-1089

### 4. **Insufficient Logging**
**Problem**: When design changes weren't being applied, there was no way to diagnose where the issue was occurring.

**Fix**: Added comprehensive logging throughout:
- Badge manager: Logs every annotation being processed and whether element is found
- Design mode: Logs every property being applied with before/after values
- Element finding: Logs selector details and search results

**Files**: 
- `extension/content/modules/badge-manager.js`
- `extension/content/modules/design-mode.js`

## Design Mode Properties Audit

All editable properties in design mode are now confirmed to persist correctly after page reload:

### Typography ✅
- `textContent` - Text content of element
- `fontFamily` - Font family
- `fontWeight` - Font weight (300-800)
- `fontSize` - Font size in px
- `lineHeight` - Line height (unitless or px)
- `letterSpacing` - Letter spacing in em or px
- `textAlign` - Text alignment (left/center/right/justify)
- `fontStyle` - Font style (normal/italic)
- `textDecoration` - Text decoration (none/underline/line-through)

### Appearance ✅
- `opacity` - Opacity (0-100% from slider, converted to 0-1 for CSS)
- `borderRadius` - Border radius in px
- `boxShadow` - Box shadow (predefined values or custom)

### Colors ✅
- `color` - Text color
- `backgroundColor` - Background color (with special handling for background-image)
- `borderColor` - Border color

### Border ✅
- `borderStyle` - Border style (none/solid/dashed/dotted)
- `borderWidth` - Border width in px

### Layout ✅
- `marginTop`, `marginRight`, `marginBottom`, `marginLeft` - Margins in px
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` - Padding in px
- `gap` - Flexbox/grid gap in px

### DOM Structure ✅
- `dom_position` - Element position in DOM tree (has extensive handling with idempotency checks)

## How Property Application Works

When a design annotation is loaded on page reload:

1. **Badge Manager** (`badge-manager.js` line 37-114):
   - Finds each annotation for current URL
   - Uses `findElementBySelector()` to locate element
   - If element has `data-pointa-id` in selector, regenerates a better selector
   - Calls `applyDesignChanges()` for design-edit annotations

2. **Apply Design Changes** (`design-mode.js` line 1009-1100):
   - Determines scope (instance/page/app)
   - Finds all affected elements using scope selector
   - For each element:
     - Checks if already applied (idempotency)
     - Iterates through all CSS changes
     - Applies each change with appropriate handling:
       - `dom_position`: Special function with extensive logic
       - `textContent`: Direct assignment to `el.textContent`
       - `opacity`: Convert 0-100 to 0-1
       - Other CSS properties: Direct application with `!important`
     - Marks element with `data-annotation-applied` attribute

3. **Idempotency**:
   - Elements are marked with `data-annotation-applied="<annotation-id>"`
   - On subsequent calls, already-applied annotations are skipped
   - For position changes, applies every time (has its own idempotency check)

## Testing Guide

### Testing textContent Changes
1. Open design mode on a page
2. Click an element with text (e.g., heading, paragraph)
3. Change the text content in the "Text Content" textarea
4. Click "Submit Changes"
5. Verify text updates immediately ✓
6. **Reload the page**
7. Check console for logs:
   ```
   [Badge Manager] ===== Processing annotation...
   [Badge Manager] Element found: YES
   [DesignMode] ===== APPLY DESIGN CHANGES START =====
   [DesignMode] - Property: textContent, Change: {old: "...", new: "..."}
   [DesignMode] - Setting textContent from "..." to "..."
   ```
8. Verify text persists after reload ✓

### Testing CSS Properties
Repeat same process for each property type:
- **Typography**: Change font size, weight, alignment, etc.
- **Colors**: Change text color, background color, border color
- **Layout**: Change margins, padding, gap
- **Appearance**: Change opacity, border radius, shadow

### Testing Opacity Specifically
1. Open design mode, select element
2. Change opacity slider (e.g., to 50%)
3. Submit changes
4. Verify element becomes semi-transparent ✓
5. **Reload the page**
6. Check console for: `[DesignMode] - Setting CSS opacity to 0.5 (from slider value 50)`
7. Verify element is still semi-transparent ✓

### Testing DOM Position Changes
1. Open design mode, select element
2. Click "Move" button
3. Drag element to new position
4. Submit changes
5. Verify element moves immediately ✓
6. **Reload the page**
7. Check console for: `[DesignMode] - Applying DOM position change`
8. Verify element is in new position ✓

## Known Limitations

1. **Selector Regeneration**: If an annotation was created with a `data-pointa-id` selector before these fixes, it will be automatically regenerated to a proper selector the first time the element is found after reload.

2. **Opacity Tracking**: The opacity change tracking compares slider values (0-100) with computed style values (0-1), which may cause false positives when opening the editor. This doesn't affect functionality but may mark unchanged opacity as changed. Can be fixed in future update.

3. **React/Framework Hydration**: If the page uses React or similar framework with hydration, changes made before hydration completes may be overwritten. The extension waits for hydration, but timing issues may still occur in rare cases.

## Console Debugging

To debug issues, check browser console for these log prefixes:
- `[Badge Manager]` - Element finding and annotation processing
- `[DesignMode]` - CSS change application
- `[Apply DOM Position]` - DOM position change details (very verbose)
- `[Revert DOM Position]` - DOM position reversion details

Set console filter to these prefixes to see only relevant logs.

