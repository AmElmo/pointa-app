# Annotation Data Formats

This document explains the annotation data formats available in Pointa and their use cases.

## Overview

Pointa supports three data formats:

1. **Lean Format** (Default for text annotations) - Optimized for LLM token efficiency
2. **Design-Rich Format** (Default for design mode) - Enhanced context for visual changes
3. **Verbose Format** - Complete detailed data (legacy/fallback)

## Format Comparison

### Lean Format (Current Default)

**Purpose**: Minimize token usage in LLM context while preserving essential information for code editing.

**Key Reductions**:
- **Classes**: Only 3 most semantic classes (prioritizes: nav, header, footer, main, content, card, button, form, modal, menu)
- **Styles**: Only `display` and `position` (removes color, backgroundColor, fontSize, margin, padding)
- **Parent Chain**: Only 1 level deep with minimal data (tag, first 2 classes, id)
- **Viewport**: Omitted (not critical for code editing)

**Kept for Fallback Element Finding**:
- **Text Sample**: Full 100 characters (needed for reliable text-based element matching)
- **Position**: Element coordinates (x, y, width, height - needed for position-based fallback)

**Example (Single Message)**:
```json
{
  "id": "pointa_1234567890_abc",
  "url": "https://example.com/products",
  "selector": "div.product-card:nth-child(2)",
  "comment": "Make this button larger",
  "messages": [
    {
      "role": "user",
      "text": "Make this button larger",
      "timestamp": "2025-11-03T12:00:00.000Z",
      "iteration": 1
    }
  ],
  "element_context": {
    "tag": "div",
    "classes": ["card", "product-card"],
    "text": "Product Title Here Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor",
    "styles": {
      "display": "flex",
      "position": "relative"
    },
    "position": {
      "x": 876,
      "y": 302.25,
      "width": 548,
      "height": 346
    }
  },
  "source_file_path": "app/products/page.tsx",
  "source_line_range": "45-67",
  "project_area": "products",
  "url_path": "/products",
  "context_hints": [
    "Next.js app detected",
    "React component"
  ],
  "parent_chain": [
    {
      "tag": "div",
      "classes": ["grid", "products-grid"],
      "id": null
    }
  ],
  "status": "pending",
  "created_at": "2025-11-03T12:00:00.000Z",
  "updated_at": "2025-11-03T12:00:00.000Z",
  "data_format": "lean"
}
```

**Example (Conversation with Multiple Iterations)**:
```json
{
  "id": "pointa_1234567890_abc",
  "url": "https://example.com/products",
  "selector": "div.product-card:nth-child(2)",
  "comment": "Also change the color to blue",
  "messages": [
    {
      "role": "user",
      "text": "Make this button larger",
      "timestamp": "2025-11-03T12:00:00.000Z",
      "iteration": 1
    },
    {
      "role": "user",
      "text": "Also change the color to blue",
      "timestamp": "2025-11-03T12:15:00.000Z",
      "iteration": 2
    }
  ],
  "element_context": {
    "tag": "div",
    "classes": ["card", "product-card"],
    "text": "Product Title Here Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor",
    "styles": {
      "display": "flex",
      "position": "relative"
    },
    "position": {
      "x": 876,
      "y": 302.25,
      "width": 548,
      "height": 346
    }
  },
  "source_file_path": "app/products/page.tsx",
  "source_line_range": "45-67",
  "project_area": "products",
  "url_path": "/products",
  "context_hints": [
    "Next.js app detected",
    "React component"
  ],
  "parent_chain": [
    {
      "tag": "div",
      "classes": ["grid", "products-grid"],
      "id": null
    }
  ],
  "status": "pending",
  "created_at": "2025-11-03T12:00:00.000Z",
  "updated_at": "2025-11-03T12:15:00.000Z",
  "data_format": "lean"
}
```

## Message Format & Conversation History

**IMPORTANT**: Annotations support multi-turn conversations through the `messages` array. This allows iterative refinement of requirements.

### Message Structure

Each annotation contains a `messages` array where each message has:
- **`role`**: Always "user" (identifies who sent the message)
- **`text`**: The actual message content
- **`timestamp`**: When the message was created (ISO 8601 format)
- **`iteration`**: Sequential number (1, 2, 3...) indicating which iteration of feedback this is

**Key Points:**
- **First message** (iteration: 1) = Original user request
- **Subsequent messages** (iteration: 2, 3...) = Follow-up requests/clarifications/iterations added by user
- The `comment` field always reflects the **latest message text** for backward compatibility
- The `iteration` number makes it explicit that these are sequential user requests

### How Conversations Work

1. **Initial annotation**: User creates annotation with 1 message
2. **AI implements**: AI calls `mark_annotations_for_review` → status becomes `in-review`
3. **User adds follow-up**: If unsatisfied, user clicks annotation and adds new message → status returns to `pending`
4. **AI re-implements**: AI sees updated annotation with full message history
5. **Repeat**: Process continues until user marks as `done`

### Reading Messages as AI

When you receive an annotation with multiple messages:
- **Read ALL messages in chronological order** - they represent the full conversation
- **The latest message** contains the most recent requirement/clarification
- **Earlier messages** provide context and evolution of the request
- **DO NOT** treat it as a single request - honor the entire conversation flow

**Example interpretation**:
```json
"messages": [
  { 
    "role": "user",
    "text": "Make this button larger",
    "timestamp": "2025-11-03T12:00:00.000Z",
    "iteration": 1
  },
  { 
    "role": "user",
    "text": "Also change the color to blue",
    "timestamp": "2025-11-03T12:15:00.000Z",
    "iteration": 2
  }
]
```
**Interpretation**: 
- **Iteration 1**: User's original request was to make button larger
- **Iteration 2**: User added a follow-up requirement for blue color
- **Action**: Implement BOTH requirements (size AND color)

## Annotation Status Workflow

Annotations follow a three-stage lifecycle to ensure proper human verification of AI work:

### Status Values

1. **`pending`** (Default) - New annotation, not yet worked on by AI
2. **`in-review`** - AI has addressed the annotation, awaiting human verification
3. **`done`** - Human has verified and approved the completed work

### Status Transitions

```
pending → in-review → done
   ↑          ↓
   └──────────┘ (rework requested via new message)
```

**Normal Flow:**
- User creates annotation → `status: "pending"`, 1 message
- AI implements changes, calls `mark_annotations_for_review` → `status: "in-review"`
- Human verifies work via UI checkmark → `status: "done"`

**Iteration Flow (Rework):**
- Annotation is `in-review` but user wants changes
- User clicks annotation, adds new message → new message appended to `messages` array, `status: "pending"`
- AI sees annotation again with full message history and re-implements
- Process repeats until approved

### UI Behavior by Status

**Pending Annotations:**
- Visible as badge on page
- Visible in popup "Active" section
- Included in badge count

**In-Review Annotations:**
- Visible as badge on page with "In Review" label in popup
- Shows rework button in popup
- Included in badge count
- Can be marked as done via checkmark in badge tooltip

**Done Annotations:**
- Hidden from page (badge removed with fade-out animation)
- Moved to collapsible "Done" section in popup
- Excluded from badge count
- Can be purged (deleted) in bulk via popup

### MCP Tool Behavior

**`read_annotations`:**
- Default `status: "active"` returns both `pending` and `in-review`
- Excludes `done` annotations by default
- Use `status: "all"` to include done annotations

**`mark_annotations_for_review`:**
- Called by AI after successfully implementing changes
- Updates status: `pending` → `in-review` for one or more annotations
- Accepts a single annotation ID or an array of IDs for batch operations
- Preserves all annotation data and history
- Batch multiple annotations in a single call for better UX

**No Automatic Deletion:**
- AI cannot delete annotations
- Only humans can mark as done (via UI)
- Only humans can purge done annotations (via popup)

### Example: In-Review Annotation (After AI Implementation)

```json
{
  "id": "pointa_1234567890_abc",
  "url": "https://example.com/products",
  "comment": "Make this button larger",
  "messages": [
    {
      "role": "user",
      "text": "Make this button larger",
      "timestamp": "2025-11-03T12:00:00.000Z",
      "iteration": 1
    }
  ],
  "status": "in-review",
  "created_at": "2025-11-03T12:00:00.000Z",
  "updated_at": "2025-11-03T12:15:00.000Z",
  "data_format": "lean"
}
```

### Example: Annotation After User Adds Follow-up (Iteration 2)

```json
{
  "id": "pointa_1234567890_abc",
  "url": "https://example.com/products",
  "comment": "Actually, make it even bigger and add a shadow",
  "messages": [
    {
      "role": "user",
      "text": "Make this button larger",
      "timestamp": "2025-11-03T12:00:00.000Z",
      "iteration": 1
    },
    {
      "role": "user",
      "text": "Actually, make it even bigger and add a shadow",
      "timestamp": "2025-11-03T12:30:00.000Z",
      "iteration": 2
    }
  ],
  "status": "pending",
  "created_at": "2025-11-03T12:00:00.000Z",
  "updated_at": "2025-11-03T12:30:00.000Z",
  "data_format": "lean"
}
```

**Note**: When user adds a follow-up message, the annotation automatically returns to `pending` status so AI can see and address the new requirements.

**Estimated Size**: ~1KB per annotation (vs 15KB-50KB+ for verbose)

### Verbose Format (Legacy)

**Purpose**: Complete detailed information for advanced use cases or debugging.

**Includes Everything**:
- All CSS classes
- Full text content (100 characters)
- Complete computed styles (7+ properties)
- Detailed position (x, y, width, height)
- Viewport dimensions
- Up to 3 levels of parent chain with full data
- Additional metadata

**Example**:
```json
{
  "id": "pointa_1234567890_abc",
  "url": "https://example.com/products",
  "selector": "div.product-card:nth-child(2)",
  "comment": "Make this button larger",
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "element_context": {
    "tag": "div",
    "classes": [
      "relative",
      "bg-card",
      "border",
      "border-border",
      "p-6",
      "rounded-xl",
      "transition-all",
      "duration-700",
      "h-full",
      "group",
      "flex",
      "flex-col",
      "opacity-100",
      "translate-y-0"
    ],
    "text": "Product Title Here Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor...",
    "styles": {
      "display": "flex",
      "position": "relative",
      "fontSize": "16px",
      "color": "oklch(0.95 0 0)",
      "backgroundColor": "oklch(0.12 0 0)",
      "margin": "0px",
      "padding": "24px"
    },
    "position": {
      "x": 876,
      "y": 302.25,
      "width": 548,
      "height": 346
    }
  },
  "source_file_path": "app/products/page.tsx",
  "source_line_range": "45-67",
  "project_area": "products",
  "url_path": "/products",
  "source_map_available": true,
  "context_hints": [
    "UI section: main-content",
    "Next.js app detected",
    "CSS-in-JS styling detected",
    "Likely file: app/products/page.tsx"
  ],
  "parent_chain": [
    {
      "tag": "div",
      "classes": ["grid", "grid-cols-1", "md:grid-cols-2", "gap-6"],
      "id": null,
      "role": null,
      "text_sample": "Product 1 Product 2 Product 3..."
    },
    {
      "tag": "main",
      "classes": ["max-w-6xl", "mx-auto", "px-4", "py-12"],
      "id": null,
      "role": null,
      "text_sample": "Products page content..."
    },
    {
      "tag": "div",
      "classes": ["min-h-screen", "bg-background"],
      "id": null,
      "role": null,
      "text_sample": "Full page content..."
    }
  ],
  "status": "pending",
  "created_at": "2025-11-03T12:00:00.000Z",
  "updated_at": "2025-11-03T12:00:00.000Z",
  "data_format": "verbose"
}
```

**Note:** Status workflow (`pending` → `in-review` → `done`) applies to all formats.

**Estimated Size**: 15KB-50KB+ per annotation

### Design-Rich Format (For Design Mode)

**Purpose**: Provide comprehensive context for visual style changes made through Design Mode. Since design changes ARE the intent (direct manipulation), this format captures the full style state and auto-detects implementation context.

**Philosophy**: Design mode annotations need MORE context than regular annotations because:
- The changes themselves are the message (no user comment to explain intent)
- AI needs to understand the full style ecosystem to implement correctly
- Component architecture detection is critical (apply to instance vs. component)
- Framework-specific patterns guide implementation strategy (Tailwind vs CSS-in-JS vs inline)

**Key Enhancements Over Lean**:
- **Full Computed Styles** - Complete style state BEFORE changes (~50 properties)
- **All CSS Classes** - Unfiltered class list for framework detection
- **Auto-Detected Context** - CSS framework, reusability, styling approach, change patterns
- **Changes Summary** - Human-readable description of what changed
- **Component Analysis** - Framework detection, component file identification, architecture hints
- **Enhanced Parent Chain** - 2 levels for better hierarchy context

**Example**:
```json
{
  "id": "pointa_1234567890_abc",
  "type": "design-edit",
  "url": "http://localhost:3000/",
  "selector": "button.btn-primary",
  
  "css_changes": {
    "paddingTop": { "old": "8px", "new": "16px" },
    "paddingBottom": { "old": "8px", "new": "16px" },
    "fontSize": { "old": "16px", "new": "20px" }
  },
  
  "changes_summary": "padding top: 8px → 16px, padding bottom: 8px → 16px, +1 more",
  
  "element_context": {
    "tag": "button",
    "classes": ["btn", "btn-primary", "rounded-lg", "shadow-md", "px-4", "py-2"],
    "text": "Get Started",
    "position": { "x": 100, "y": 200, "width": 150, "height": 42 },
    
    "computed_styles": {
      "fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto",
      "fontSize": "16px",
      "fontWeight": "500",
      "lineHeight": "24px",
      "color": "rgb(255, 255, 255)",
      "backgroundColor": "rgb(91, 91, 214)",
      "display": "inline-flex",
      "paddingTop": "8px",
      "paddingBottom": "8px",
      "paddingLeft": "16px",
      "paddingRight": "16px",
      "borderRadius": "8px",
      "boxShadow": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      "...": "~50 total properties"
    }
  },
  
  "design_context": {
    "css_framework": {
      "framework": "tailwind",
      "confidence": "high"
    },
    
    "reusability": {
      "instances_on_page": 3,
      "is_unique": false,
      "likely_component": true,
      "primary_class": "btn-primary",
      "recommendation": "Consider applying to component definition, not just this instance"
    },
    
    "styling_approach": {
      "uses_inline_styles": false,
      "uses_utility_classes": true,
      "class_count": 6,
      "recommended_approach": "utility-class-change"
    },
    
    "change_pattern": {
      "change_count": 3,
      "change_type": "mixed",
      "categories": {
        "typography": ["fontSize"],
        "spacing": ["paddingTop", "paddingBottom"],
        "colors": [],
        "visual": []
      },
      "follows_design_system": true,
      "grid_system": "8px",
      "is_symmetric": true,
      "is_systematic": true
    },
    
    "component_context": {
      "is_component_file": true,
      "component_name": "Button",
      "framework": "Next.js",
      "is_likely_root_element": true,
      "file_type": "tsx",
      "recommendation": "Edit component file: components/Button.tsx"
    }
  },
  
  "source_file_path": "components/Button.tsx",
  "source_line_range": "12-24",
  "project_area": "components",
  "context_hints": [
    "UI section: main-content",
    "Next.js app detected",
    "Likely file: components/Button.tsx"
  ],
  
  "parent_chain": [
    { "tag": "section", "classes": ["hero", "container"], "id": null, "role": null },
    { "tag": "main", "classes": [], "id": null, "role": "main" }
  ],
  
  "viewport": { "width": 1920, "height": 1080 },
  
  "status": "pending",
  "created_at": "2025-11-09T12:00:00.000Z",
  "updated_at": "2025-11-09T12:00:00.000Z",
  "data_format": "design-rich"
}
```

**Key Benefits for AI**:

1. **Full Style Context** - AI sees complete style ecosystem, not just what changed
2. **Framework Detection** - Knows whether to edit Tailwind classes, CSS-in-JS, or component props
3. **Reusability Analysis** - Understands if element is a component instance (3 on page = component)
4. **Change Pattern Recognition** - Detects systematic changes (8px grid, symmetric padding)
5. **Component Architecture Hints** - Knows to edit `components/Button.tsx`, not inline styles
6. **Implementation Strategy** - Recommends "utility-class-change" vs "inline-style-override"

**Zero User Friction** - All context is auto-detected. No prompts, no text input required.

**Estimated Size**: ~3-5KB per annotation (more than lean, less than verbose, optimal for design mode)

**When Used**: Automatically applied for all design mode annotations (`type: "design-edit"`).

## What the LLM Really Needs

The lean format is designed around what an LLM actually needs to find and edit code:

### Critical Data (Kept in Lean):
1. **source_file_path** - Where to edit
2. **source_line_range** - Exact lines to modify
3. **project_area** - Project context
4. **context_hints** - High-level guidance
5. **selector** - How to identify the element
6. **comment** - What the user wants changed
7. **Basic element context** - Minimal DOM info for verification

### Nice-to-Have (Removed in Lean):
- Detailed styling information
- Precise pixel positions
- Deep parent hierarchies
- Complete class lists
- Viewport dimensions

## Switching Between Formats

### Current Configuration

The lean format is **currently active** by default.

To switch to verbose format, edit `extension/content/content.js` line 2032:

```javascript
// Current (Lean):
const useLeanFormat = true;

// Change to Verbose:
const useLeanFormat = false;
```

### When to Use Each Format

**Use Lean (Default)**:
- ✅ Normal MCP usage with Cursor AI
- ✅ Token cost is a concern
- ✅ File/line info is available
- ✅ Most production scenarios

**Use Verbose**:
- 🔧 Debugging annotation issues
- 🔧 Source mapping unavailable
- 🔧 Need complete context for manual review

## Token Savings

Based on typical annotations:

| Metric | Verbose | Lean | Savings |
|--------|---------|------|---------|
| Avg Size | 25KB | 1KB | **~96%** |
| Token Count* | ~6,000 | ~250 | **~96%** |
| 50 annotations | ~300K tokens | ~12.5K tokens | **287.5K tokens** |

*Approximate, varies by content and tokenizer

## Implementation Details

The format selection is implemented in `extension/content/content.js`:

- **Line 1891-1968**: `createLeanAnnotation()` - Lean format generator
- **Line 1978-2005**: `createVerboseAnnotation()` - Verbose format generator  
- **Line 2032**: `useLeanFormat` flag controls which is used
- **Line 2034-2036**: Format selection logic

Both functions are called from `saveAnnotation()` which validates and saves the annotation.

## Migration

Existing annotations in verbose format will continue to work. New annotations will use the lean format by default. Both formats are fully compatible with the MCP server and Cursor integration.

## Future Enhancements

Potential improvements to consider:

1. **Dynamic format selection** - Choose format based on available source mapping
2. **User preference** - Allow users to choose via settings
3. **Format conversion** - Tool to convert existing verbose annotations to lean

