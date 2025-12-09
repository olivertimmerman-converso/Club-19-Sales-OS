# Club 19 Sales OS - Permissions System

## Overview

The Club 19 Sales OS uses a role-based access control (RBAC) system to manage user permissions across the application. All permission logic is centralized in `lib/permissions.ts` as the single source of truth.

## Roles

The system supports 6 distinct roles:

### 1. **Superadmin** (`superadmin`)
- **Who**: Oliver (system owner)
- **Access**: Full system access - all routes, all features
- **Homepage**: `/staff/admin/dashboard`

### 2. **Founder** (`founder`)
- **Who**: Company founders
- **Access**: Core business operations
- **Routes**: Dashboard, Sales, Clients, Shoppers, Invoices, Finance
- **Homepage**: `/dashboard`

### 3. **Operations** (`operations`)
- **Who**: Alys (operations manager)
- **Access**: Full operations - sales, finance, legacy data, deal studio
- **Routes**: Dashboard, Sales, Clients, Suppliers, Shoppers, Invoices, Finance, Legacy, Deal Studio (/trade)
- **Homepage**: `/dashboard`
- **Notes**: Can create deals via Sales Atelier

### 4. **Admin** (`admin`)
- **Who**: Sophie (administrator)
- **Access**: Staff portal with admin dashboards
- **Routes**: Staff portal, admin dashboards, analytics, error tracking, shopper views
- **Homepage**: `/staff/admin/dashboard`

### 5. **Finance** (`finance`)
- **Who**: Finance team
- **Access**: Financial data and reports
- **Routes**: Finance dashboards, commissions, overdue payments
- **Read-Only**: Admin sales (view only)
- **Homepage**: `/staff/finance/dashboard`

### 6. **Shopper** (`shopper`)
- **Who**: Hope, MC (sales team)
- **Access**: Personal sales dashboard
- **Routes**: Shopper dashboard, personal sales
- **Homepage**: `/staff/shopper/dashboard`
- **Notes**: Most restricted role - can only see their own sales

## Route Permissions

### Main OS Routes (`app/(os)/`)

| Route | Superadmin | Founder | Operations | Admin | Finance | Shopper |
|-------|-----------|---------|------------|-------|---------|---------|
| `/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/sales` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/sales/[id]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/clients` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/suppliers` | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `/shoppers` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/invoices` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/finance` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/legacy` | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `/trade` (Deal Studio) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/admin` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Staff Portal Routes (`app/staff/`)

| Route | Superadmin | Admin | Finance | Shopper |
|-------|-----------|-------|---------|---------|
| `/staff` | ✅ | ✅ | ✅ | ✅ |
| `/staff/shopper/dashboard` | ✅ | ✅ | ❌ | ✅ |
| `/staff/shopper/sales` | ✅ | ✅ | ❌ | ✅ |
| `/staff/admin/dashboard` | ✅ | ✅ | ❌ | ❌ |
| `/staff/admin/sales` | ✅ | ✅ | 👁️ | ❌ |
| `/staff/admin/analytics` | ✅ | ✅ | ❌ | ❌ |
| `/staff/admin/errors` | ✅ | ✅ | ❌ | ❌ |
| `/staff/finance/dashboard` | ✅ | ❌ | ✅ | ❌ |
| `/staff/finance/commissions` | ✅ | ❌ | ✅ | ❌ |
| `/staff/finance/overdue` | ✅ | ❌ | ✅ | ❌ |
| `/staff/superadmin/tools` | ✅ | ❌ | ❌ | ❌ |

**Legend**: ✅ Full Access | 👁️ Read-Only | ❌ No Access

## Architecture

### Single Source of Truth: `lib/permissions.ts`

All permission logic is defined in this file:

```typescript
// Check if a role can access a route
canAccessRoute(role: StaffRole, pathname: string): boolean

// Check if a route is read-only for a role
isRouteReadOnly(role: StaffRole, pathname: string): boolean

// Get all accessible routes for a role
getRoutesForRole(role: StaffRole): string[]

// Get default homepage for a role
getHomepageForRole(role: StaffRole): string

// Get human-readable label for a role
getRoleLabel(role: StaffRole): string
```

### Permission Checking Flow

1. **Middleware** (`middleware.ts`):
   - Checks user authentication via Clerk
   - Extracts `staffRole` from `user.publicMetadata`
   - Calls `canAccessRoute(role, pathname)` for every protected route
   - Redirects to `/unauthorised` if access denied

2. **Page-Level** (`assertAccess.ts`):
   - Server components can call `assertAccess(pathname, role)`
   - Throws redirect to `/unauthorised` if denied

3. **Sidebar** (`sidebarConfig.ts`):
   - Derives visible menu items from `canAccessRoute(role, href)`
   - Navigation automatically reflects permissions

### Backward Compatibility

The following files exist for backward compatibility but delegate to `permissions.ts`:

- `lib/rbac.ts` - Re-exports with deprecation notices
- `lib/assertAccess.ts` - Thin wrapper with logging
- `lib/sidebarConfig.ts` - Derives from permissions

**New code should import directly from `lib/permissions.ts`**.

## Updating Permissions

To add or modify permissions:

1. **Edit `lib/permissions.ts`**:
   - Update `ROUTE_PERMISSIONS` object with new routes
   - Specify `allowedRoles` and optionally `readOnlyRoles`
   - Add description for documentation

2. **Update Sidebar** (if new route should appear in menu):
   - Edit `ALL_SIDEBAR_ITEMS` in `lib/sidebarConfig.ts`
   - Add label, href, and icon

3. **Test**:
   - Run `npm run build` to catch TypeScript errors
   - Test each role manually in development
   - Verify middleware redirects work correctly

## Role Assignment

Roles are stored in Clerk's `publicMetadata`:

```json
{
  "staffRole": "operations"
}
```

To assign roles:
1. Access Clerk Dashboard
2. Navigate to Users → Select User → Metadata
3. Add/update `publicMetadata.staffRole`
4. Valid values: `superadmin`, `founder`, `operations`, `admin`, `finance`, `shopper`

## Security Notes

- **Default Role**: Users without a valid `staffRole` default to `"shopper"` (most restricted)
- **Superadmin Bypass**: Superadmin has access to ALL routes (no exceptions)
- **Middleware Protection**: All non-public routes go through middleware RBAC check
- **Page-Level Protection**: Critical pages also use `assertAccess()` as defense-in-depth
- **Read-Only Routes**: Finance can view but not edit `/staff/admin/sales`

## Common Issues

### "Access Denied" for Valid User
1. Check `publicMetadata.staffRole` in Clerk Dashboard
2. Verify role is spelled correctly (case-sensitive)
3. Check if route is in `ROUTE_PERMISSIONS` in `lib/permissions.ts`
4. Clear browser cache and re-login

### Navigation Item Not Showing
1. Verify route is in `ROUTE_PERMISSIONS` with correct role
2. Check `ALL_SIDEBAR_ITEMS` in `lib/sidebarConfig.ts`
3. Ensure `getSidebarItemsForRole()` is being called

### TypeScript Errors
- Ensure all imports use `lib/permissions.ts` not old `roleTypes.ts`
- Run `npx tsc --noEmit` to check for type errors

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `lib/permissions.ts` | ✅ **Single source of truth** | Active |
| `lib/assertAccess.ts` | Wrapper with logging | Active (delegates) |
| `lib/sidebarConfig.ts` | Sidebar navigation | Active (derives) |
| `middleware.ts` | Route protection | Active (uses permissions) |
| `lib/rbac.ts` | Legacy compatibility | Deprecated |
| `lib/roleTypes.ts` | Old type definitions | Deleted ❌ |

## Migration Notes

This permissions system was consolidated on [Date] to eliminate:
- 3 conflicting sources of truth
- Duplicate role definitions
- Inconsistent permission checks

All existing functionality is preserved with backward compatibility wrappers.
