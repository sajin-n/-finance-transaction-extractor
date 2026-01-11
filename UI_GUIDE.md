# 🎨 UI Feature Guide

## Visual Reference for All New Features

---

## 📊 Analytics Dashboard

**Toggle Button:**
```
┌─────────────────────────────┐
│  📊 Show Analytics          │ ← Click to toggle
└─────────────────────────────┘
```

**Analytics Cards (when shown):**
```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Total            │ Total Income     │ Total Expenses   │ Net Balance      │
│ Transactions     │                  │                  │                  │
│                  │                  │                  │                  │
│     42           │   $5,420.50      │   $3,210.75      │   +$2,209.75     │
│                  │   12 trans.      │   30 trans.      │                  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

---

## 🔍 Search & Filter Bar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Search transactions...     │ All Categories ▼ │ All Status ▼ │ Apply   │
└─────────────────────────────────────────────────────────────────────────────┘

                                If transactions selected:
                                ┌──────────────────┐
                                │ 🗑️ Delete (3)    │
                                └──────────────────┘
```

**Category Dropdown:**
```
All Categories ▼
├─ All Categories
├─ Income
├─ Groceries
├─ Dining
├─ Transportation
├─ Utilities
├─ Housing
├─ Shopping
├─ Entertainment
├─ Healthcare
├─ Transfer
└─ Uncategorized
```

**Status Dropdown:**
```
All Status ▼
├─ All Status
├─ pending
├─ verified
└─ flagged
```

---

## 📋 Transactions Table

### Header Row
```
┌───┬──────────┬────────────────────┬──────────┬────────┬────────┬──────────┬─────────┐
│ ☐ │ Date     │ Description        │ Category │ Status │ Amount │ Confid.  │ Actions │
├───┼──────────┼────────────────────┼──────────┼────────┼────────┼──────────┼─────────┤
```

### Normal Mode (View Only)
```
│ ☐ │ 1/15/24  │ Amazon Purchase    │ Shopping │ ⏱️ pend │ ⬇️$89.99│   85%   │ ✏️ 🗑️   │
│ ☑ │ 1/14/24  │ Salary Payment     │ Income   │ ✅ ver  │ ⬆️$2500 │   95%   │ ✏️ 🗑️   │
│ ☐ │ 1/13/24  │ Starbucks Coffee   │ Dining   │ ⚠️ flag│ ⬇️$5.50 │   72%   │ ✏️ 🗑️   │
```

### Edit Mode (When pencil clicked)
```
│ ☐ │ [1/15/24]│ [Amazon Purchase  ]│[Shopping▼]│[pend ▼]│[$89.99] │   85%   │ ✓  ✗   │
      └─date─┘  └─description────┘ └category┘  └status┘ └amount┘           save cancel
```

### Bulk Select Mode
```
│ ☑ │ 1/15/24  │ Amazon Purchase    │ Shopping │ ⏱️ pend │ ⬇️$89.99│   85%   │ ✏️ 🗑️   │ ← Selected
│ ☑ │ 1/14/24  │ Salary Payment     │ Income   │ ✅ ver  │ ⬆️$2500 │   95%   │ ✏️ 🗑️   │ ← Selected
│ ☐ │ 1/13/24  │ Starbucks Coffee   │ Dining   │ ⚠️ flag│ ⬇️$5.50 │   72%   │ ✏️ 🗑️   │ ← Not selected

                                               
                             ┌──────────────────┐
                             │ 🗑️ Delete (2)    │ ← Bulk delete button appears
                             └──────────────────┘
```

---

## 🎨 Visual Elements

### Status Badges
```
⏱️ pending      ← Yellow background, clock icon
✅ verified     ← Green background, checkmark icon
⚠️ flagged      ← Red background, alert icon
```

### Confidence Badges
```
90%+    ← Green badge
50-89%  ← Yellow badge
<50%    ← Red badge
```

### Amount Display
```
⬆️ $2,500.00    ← Green text, up arrow (income/positive)
⬇️ $89.99       ← Red text, down arrow (expense/negative)
```

### Category Tags
```
┌───────────┐
│ 🏷️ Income  │ ← Blue rounded badge
└───────────┘
```

### Action Icons
```
✏️  Edit       ← Blue pencil icon
🗑️  Delete     ← Red trash icon
✓  Save       ← Green checkmark
✗  Cancel     ← Red X
```

---

## 📝 Import Section

```
┌─────────────────────────────────────────────────────────┐
│ 📄 Import Statement                                     │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Paste your raw bank statement text here...          │ │
│ │                                                      │ │
│ │                                                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌────────────────┐                                     │
│ │ Parse & Save   │                                     │
│ └────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

**Loading State:**
```
┌────────────────────┐
│ ⏳ Parsing...      │ ← Spinning loader
└────────────────────┘
```

---

## 💾 Export Button

```
┌─────────────────────┐
│ 💾 Export CSV       │
└─────────────────────┘
```

On click → Downloads: `transactions-2026-01-11.csv`

---

## 🔄 Pagination

```
                    ┌────────────────────────┐
                    │ Load more transactions │
                    └────────────────────────┘
                               ↑
                    Appears when more exist
```

---

## 🎯 Interactive States

### Button Hover States
```
Normal:     ┌────────────┐
            │  Apply     │
            └────────────┘

Hover:      ┌────────────┐
            │  Apply     │ ← Darker background
            └────────────┘

Disabled:   ┌────────────┐
            │  Apply     │ ← Grayed out, cursor not-allowed
            └────────────┘
```

### Checkbox States
```
Unchecked:  ☐
Checked:    ☑  ← Blue checkmark
Indeterminate (partial): ◫
```

### Row Hover
```
Normal row:     white background
Hovered row:    light gray background (#f9fafb)
```

---

## 📱 Responsive Behavior

### Desktop (1024px+)
```
┌────────────────────────────────────────────────────────┐
│  [Analytics Cards - 4 across]                          │
├────────────────────────────────────────────────────────┤
│  [Full width table with all columns]                   │
└────────────────────────────────────────────────────────┘
```

### Tablet (768px+)
```
┌──────────────────────────────────┐
│  [Analytics Cards - 2 across]    │
├──────────────────────────────────┤
│  [Table with horizontal scroll]  │
└──────────────────────────────────┘
```

### Mobile (<768px)
```
┌────────────────────┐
│ [Cards - stacked]  │
│ [Cards - stacked]  │
│ [Cards - stacked]  │
│ [Cards - stacked]  │
├────────────────────┤
│ [Table - scroll]   │
└────────────────────┘
```

---

## 🎨 Color Scheme

```
Primary:        Black (#000000)
Accent:         Blue (#3b82f6)
Success:        Green (#10b981)
Warning:        Yellow (#fbbf24)
Error:          Red (#ef4444)
Background:     Gray-50 (#f9fafb)
Border:         Gray-200 (#e5e7eb)
Text:           Gray-900 (#111827)
Text-muted:     Gray-500 (#6b7280)
```

---

## 🔔 Notifications & Errors

### Error State
```
┌────────────────────────────────────────────┐
│ ❌ Failed to load transactions             │
└────────────────────────────────────────────┘
```

### Success State
```
┌────────────────────────────────────────────┐
│ ✅ Transaction updated successfully        │
└────────────────────────────────────────────┘
```

### Confirmation Dialog
```
┌─────────────────────────────────────────────┐
│  Are you sure you want to delete this       │
│  transaction?                               │
│                                             │
│  ┌──────────┐         ┌──────────┐         │
│  │  Cancel  │         │  Delete  │         │
│  └──────────┘         └──────────┘         │
└─────────────────────────────────────────────┘
```

---

## 🎯 Example Workflows

### 1. Quick Edit Flow
```
1. Click ✏️ on transaction
2. Fields become editable
3. Change values
4. Click ✓ to save
5. Row returns to normal view
```

### 2. Bulk Delete Flow
```
1. Check ☑ multiple transactions
2. "Delete (X)" button appears
3. Click button
4. Confirm dialog appears
5. Click "Delete"
6. Transactions removed
7. Analytics update
```

### 3. Filter Flow
```
1. Type in search box
2. Select category
3. Select status
4. Click "Apply Filters"
5. Table updates
6. Only matching transactions shown
```

---

## 💡 Tips

### Keyboard Shortcuts (Future Enhancement)
```
Ctrl+F      → Focus search
Ctrl+A      → Select all
Delete      → Delete selected
Esc         → Cancel edit
Enter       → Save edit (when editing)
```

### Smart Features
- **Auto-save**: Changes save immediately on ✓ click
- **Optimistic updates**: UI updates before server confirms
- **Error recovery**: Failed operations show error and revert
- **Duplicate prevention**: Won't load same transaction twice

---

## 🎨 Component Library Used

```
Lucide React     → Icons (Edit, Trash, Search, etc.)
Tailwind CSS     → Styling utilities
Shadcn UI        → Button, Input components
Custom Cards     → Analytics cards
HTML Tables      → Transaction grid
React Hooks      → State management
```

---

## 📐 Layout Measurements

```
Container max-width:    7xl (1280px)
Card padding:          6 (1.5rem / 24px)
Table cell padding:    6 (1.5rem)
Border radius:         xl (0.75rem / 12px)
Button padding:        Standard button sizing
Icon size:             4 (1rem / 16px) or 5 (1.25rem / 20px)
```

---

**This guide shows exactly what users will see when using your production-ready transaction app! 🎉**
