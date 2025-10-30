# Marketplace System Documentation

## Overview

The Marketplace is a comprehensive voucher redemption system where users can spend their earned TCS (Total Contribution Score) points to purchase vouchers. The system includes product management, shopping cart functionality, user inventory, and analytics tracking.

---

## Architecture

### Components

#### 1. **Frontend Components**
- **Location**: `src/features/market/components/MarketTab.jsx`
- **Purpose**: Main marketplace UI with three tabs: Shop, My Vouchers, and Management
- **Features**:
  - Product browsing and shopping cart
  - User voucher inventory
  - Management interface for admins
  - Points display with expiration warnings

#### 2. **Utility Modules**

##### A. Points Management (`src/shared/utils/pointsManagement.js`)
- **Purpose**: Manages user points, expiration, and redemption
- **Key Functions**:
  - `calculateUsablePoints(user)` - Calculates points that haven't expired
  - `calculateTotalPoints(user)` - Total points ever earned
  - `calculateExpiredPoints(user)` - Points that have expired
  - `getPointsBreakdown(user)` - Comprehensive breakdown with expiring soon
  - `redeemPoints(userId, points)` - Deducts points when purchasing vouchers
  - `addPoints(userId, points, source)` - Adds points to user's history

**Point Expiration Logic**:
- Points expire after 90 days (configurable in `POINTS_CONFIG.EXPIRATION_DAYS`)
- Points tracked in `user.pointsHistory` object with date-based keys
- Each entry has: `points`, `isUsable`, `addedAt`, `expirationDays`

##### B. Voucher Management (`src/shared/utils/voucherManagement.js`)
- **Purpose**: Handles voucher purchasing, inventory, and redemption status
- **Key Functions**:
  - `getAvailableProducts()` - Fetches active voucher products (isActive = true)
  - `calculateCartTotal(cartItems, products)` - Calculates total points needed
  - `purchaseVouchers(userId, userName, cartItems)` - Main purchase function
  - `getUserVouchers(userId)` - Gets user's purchased vouchers
  - `getUserVoucherStats(userId)` - Provides statistics (total, used, available, etc.)
  - `useVoucher(voucherId, usedBy)` - Marks voucher as used
  - `getAllRedeemedVouchers()` - For admin dashboard (collectionGroup query)
  - `getVoucherRedemptionStatus()` - Checks availability for each product

**Purchase Flow**:
1. Validates cart items
2. Checks voucher availability (quantity-based)
3. Verifies user has sufficient points
4. Deducts points using `redeemPoints()`
5. Creates vouchers in user subcollection `users/{userId}/vouchers`
6. Updates `voucherProducts` collection `redeemedQuantity`
7. Updates user's `totalVouchersPurchased` count

##### C. Voucher Products Management (`src/shared/utils/voucherProducts.js`)
- **Purpose**: Manages voucher product definitions in Firestore
- **Key Functions**:
  - `getVoucherProducts()` - Gets all products (sorted by points)
  - `getAllVoucherProducts()` - Includes draft products (for management)
  - `getVoucherProductById(productId)` - Get single product
  - `addVoucherProduct(productData)` - Add new product (Management only)
  - `updateVoucherProduct(productId, updates)` - Update product
  - `deleteVoucherProduct(productId)` - Delete product
  - `getRedemptionSummary()` - Redemption stats for management
  - `isProductFullyRedeemed(product)` - Checks if quantity limit reached
  - `recalculateRedeemedQuantity(productId)` - Recalculate from actual vouchers

**Product Data Structure**:
```javascript
{
  id: string,
  name: string,
  points: number,
  totalQuantity: number,
  redeemedQuantity: number,
  category: string,
  description: string,
  termsAndConditions: string,
  isActive: boolean, // true = live, false = draft
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. **Admin Dashboard** (`src/features/admin/components/VoucherRedemptionDashboard.jsx`)
- **Purpose**: Comprehensive analytics for voucher redemption
- **Features**:
  - Overview tab: Total TCS, spending, voucher counts
  - User Stats tab: Per-user breakdown
  - Redemption History tab: All voucher purchases
  - Analytics tab: PWA analytics integration

---

## Data Flow

### 1. User Points System
```
User completes tasks → Earns TCS points 
                    ↓
         Points stored in user.pointsHistory
                    ↓
         Points calculated on-demand
                    ↓
         Can be redeemed for vouchers
```

### 2. Voucher Purchase Flow
```
User browses products → Adds to cart
                    ↓
         Checks availability (quantity check)
                    ↓
         Validates sufficient points
                    ↓
         Deducts points from user.pointsHistory
                    ↓
         Creates vouchers in users/{userId}/vouchers
                    ↓
         Updates voucherProducts.redeemedQuantity
```

### 3. Availability Check
```
purchaseVouchers() called
        ↓
Checks each product.availableQuantity
        ↓
availableQuantity = totalQuantity - redeemedQuantity
        ↓
If requested > available: Returns error with exact counts
        ↓
Otherwise: Proceeds with purchase
```

---

## Firestore Collections

### 1. **`voucherProducts`** (Top-level collection)
```javascript
{
  id: string, // Document ID
  name: string,
  points: number,
  totalQuantity: number,
  redeemedQuantity: number, // Auto-updated on purchase
  category: string,
  description: string,
  termsAndConditions: string,
  isActive: boolean, // Draft/Live toggle
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 2. **`users/{userId}/vouchers`** (Subcollection)
```javascript
{
  id: string, // Voucher ID
  userId: string,
  userName: string,
  productId: string,
  productName: string,
  productIcon: string,
  pointsSpent: number,
  purchasedAt: Timestamp,
  status: 'confirmed' | 'pending' | 'used',
  redemptionMonth: string, // YYYY-MM format
  code: string, // 8-char unique code
  usedAt: Timestamp?,
  usedBy: string?
}
```

### 3. **`users`** (User documents)
```javascript
{
  // ... other fields
  pointsHistory: {
    "2024-01-15": {
      points: 150,
      isUsable: true,
      addedAt: Timestamp,
      expirationDays: 90
    },
    // ... more entries
  },
  usablePoints: number, // Calculated on demand
  totalPoints: number,
  totalVouchersPurchased: number,
  lastVoucherPurchase: Timestamp
}
```

---

## UI Tabs

### 1. **Shop Tab** (All Users)
- **Features**:
  - Displays only live vouchers (isActive = true)
  - Shows available quantity vs total quantity
  - "Fully Redeemed" button state when unavailable
  - Shopping cart functionality
  - Points breakdown display
  - Expiration warnings

**Cart Operations**:
- Add to cart (validates availability)
- Update quantity (+/- buttons)
- Remove item
- Checkout with total points calculation

### 2. **My Vouchers Tab** (All Users)
- **Features**:
  - User's purchased voucher inventory
  - Statistics: Total, Available, Used, Points Spent
  - Each voucher shows:
    - Product name
    - Unique code
    - Purchase date
    - Status badge (confirmed/used)
  - Color-coded status:
    - Green: Confirmed (available to use)
    - Yellow: Pending
    - Gray: Used
  - Empty state with call-to-action

### 3. **Management Tab** (Management & Admin Only)
- **Features**:
  - View all vouchers (including drafts)
  - Add new vouchers via modal form
  - Edit existing vouchers
  - Delete vouchers
  - Toggle Draft/Live status
  - Redemption summary (X/Y vouchers)
  - Redemption history with user details
  - Visual indicators:
    - Green badge: Live
    - Gray badge: Draft
    - Gray background: Draft products

**Management Modal Fields**:
- Voucher name
- Points cost
- Total quantity
- Category
- Description
- Detailed terms & conditions
- Draft/Live toggle

---

## Key Features

### 1. **Quantity-Based Availability**
- Each voucher product has `totalQuantity` and `redeemedQuantity`
- Purchase validates: `availableQuantity = totalQuantity - redeemedQuantity`
- If user requests more than available, error shows exact counts
- No over-selling possible
- Real-time updates on purchase

### 2. **Draft/Live System**
- Management can create vouchers as drafts
- Drafts don't appear in Shop tab
- Drafts can be edited
- Toggle to make draft "Live" → appears in shop
- Toggle to make live "Draft" → removed from shop

### 3. **Points Calculation**
- Points calculated on-demand from `pointsHistory`
- Considers expiration dates (90 days default)
- Shows "expiring soon" warnings (7 days)
- Falls back to `totalTCS` if `pointsHistory` not populated

### 4. **PWA Analytics Integration**
- Tracks market tab visits
- Tracks shop views
- Tracks voucher purchases (with quantities and points)
- Data available in Admin Dashboard → Analytics tab

### 5. **Validation & Error Handling**
- Quantity validation before purchase
- Points sufficiency check
- Availability check per product
- Clear error messages with exact counts
- Transaction safety (points deducted before vouchers created)

---

## Function Reference

### Points Management (`pointsManagement.js`)
| Function | Purpose | Returns |
|----------|---------|---------|
| `calculateUsablePoints(user)` | Calculate valid points | `number` |
| `calculateTotalPoints(user)` | Total points ever earned | `number` |
| `calculateExpiredPoints(user)` | Expired points count | `number` |
| `getPointsBreakdown(user)` | Full breakdown with warnings | `Object` |
| `redeemPoints(userId, points)` | Deduct points for purchase | `Promise<Object>` |
| `addPoints(userId, points, source)` | Add points to history | `Promise<Object>` |

### Voucher Management (`voucherManagement.js`)
| Function | Purpose | Returns |
|----------|---------|---------|
| `getAvailableProducts()` | Get active products | `Promise<Array>` |
| `calculateCartTotal(cart, products)` | Calculate cart total | `number` |
| `purchaseVouchers(userId, name, cart)` | Buy vouchers | `Promise<Object>` |
| `getUserVouchers(userId)` | Get user inventory | `Promise<Array>` |
| `getUserVoucherStats(userId)` | Get stats | `Promise<Object>` |
| `useVoucher(voucherId, usedBy)` | Mark as used | `Promise<Object>` |
| `getAllRedeemedVouchers()` | Admin view | `Promise<Array>` |
| `getVoucherRedemptionStatus()` | Availability check | `Promise<Object>` |

### Voucher Products (`voucherProducts.js`)
| Function | Purpose | Returns |
|----------|---------|---------|
| `getVoucherProducts()` | All products | `Promise<Array>` |
| `getAllVoucherProducts()` | Include drafts | `Promise<Array>` |
| `addVoucherProduct(data)` | Create product | `Promise<Object>` |
| `updateVoucherProduct(id, data)` | Update product | `Promise<Object>` |
| `deleteVoucherProduct(id)` | Delete product | `Promise<Object>` |
| `getRedemptionSummary()` | Stats summary | `Promise<Array>` |
| `isProductFullyRedeemed(product)` | Check availability | `boolean` |

---

## Files & Directories

### Core Files
```
src/
├── features/
│   ├── market/
│   │   └── components/
│   │       └── MarketTab.jsx          # Main marketplace UI
│   ├── admin/
│   │   └── components/
│   │       └── VoucherRedemptionDashboard.jsx  # Admin analytics
└── shared/
    └── utils/
        ├── pointsManagement.js        # Points calculation & redemption
        ├── voucherManagement.js       # Voucher purchasing & inventory
        ├── voucherProducts.js         # Product CRUD operations
        ├── firestoreHelpers.js        # Data cleaning utilities
        └── pwaAnalytics.js             # Analytics tracking
```

### Key Components
1. **MarketTab.jsx** - Main marketplace with 3 tabs
2. **VoucherRedemptionDashboard.jsx** - Admin analytics dashboard
3. **pointsManagement.js** - Points system
4. **voucherManagement.js** - Voucher operations
5. **voucherProducts.js** - Product management

---

## User Roles & Permissions

### All Users
- Browse active vouchers
- View own points balance
- Purchase vouchers
- View own voucher inventory

### Management & Admin
- All user permissions
- Create/edit/delete voucher products
- Toggle Draft/Live status
- View redemption summary
- View all redemption history
- Access analytics dashboard

---

## Security

1. **Points Deduction**: Validated server-side before voucher creation
2. **Availability Check**: Real-time quantity validation
3. **Role-Based Access**: Management features restricted
4. **Transaction Safety**: Points deducted, then vouchers created
5. **Error Recovery**: Clear error messages for all failures

---

## Future Enhancements

- Voucher expiration dates
- Bulk voucher management
- Export redemption reports
- Email notifications for purchases
- Recurring voucher patterns
- Voucher gift system

---

*Last Updated: Current implementation*
*Version: 1.0.0*

