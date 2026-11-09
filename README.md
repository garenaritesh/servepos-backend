# ServePOS Level 1 — Simple Counter POS

ServePOS Level 1 is designed for small cafes and restaurants where the owner or one counter operator takes the order and completes the sale directly. It retains the owner-side management features from ServePOS Level 2, but removes the service workflow (waiter station, kitchen/KOT, parcel desk and separate cashier counter).

## Order flow

1. Open **Take Order** (the first screen after login).
2. Enter customer name/mobile if available.
3. Select menu items and adjust quantities in the cart.
4. Choose Cash, UPI, Card or Other.
5. Press **Complete order & save**. The order is recorded as paid, stock is deducted, customer history is updated, and sales/profit reports update.

## Included modules

- Owner first-run setup and local owner login
- Quick POS order screen with customer details, item search/categories, quantity controls, cart, payment type and totals
- Orders and sales history
- Customer management and order history
- Tables management (optional record keeping; no table service workflow)
- Menu management, item pricing, cost, recipes and profit/margin
- Finished-item inventory and raw ingredient inventory
- Ingredient recipe stock deduction and low-stock checks
- Expense management
- Sales, COGS, gross profit and estimated net profit reports
- Restaurant settings, logo, invoice details, tax settings and receipt printing
- JSON backup export and restore

## Removed from Level 1

- Waiter workspace and waiter serving flow
- Kitchen display and KOT preparation flow
- Parcel desk / packing workflow
- Separate cashier billing queue
- Staff department switching and staff panel

## Run locally

```bash
npm install
npm run dev
```

## Build for web

```bash
npm run build
```

## Android packaging

This project includes Capacitor configuration. After installing dependencies and setting up Android Studio/Android SDK:

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

## Current storage and limitations

This test version stores data in browser LocalStorage. It is not yet using SQLite, Neon, cloud backup or multi-device synchronization. Clearing browser/app data or uninstalling the app can remove locally stored records. Export JSON backups during testing. Production-grade security and cloud sync are planned as later development phases.

The project ZIP is a development prototype. Run the app and test all workflows before using it for a real restaurant.


## Automatic customer bill printing
In Settings > Customer bill printing, the owner can enable or disable automatic customer bill printing.
- ON: after each order is saved, ServePOS opens the customer bill in the device/browser print dialog.
- OFF: orders are saved normally and no bill print dialog is opened automatically.
The printer must be configured on the device, and browser print pop-ups must be allowed.


## Customer bill preview and printing
When automatic bill printing is ON, completing an order opens a professional bill preview inside ServePOS. The owner can choose **Print bill** to open the device print dialog, or **Close** to dismiss the preview without printing. Printing is user-initiated from the preview so the owner can review the bill first.


## Blank-screen fix and bill preview
The bill preview no longer constructs a separate print document while React is rendering. The preview is a normal in-app dialog; the Print bill button opens the existing receipt print window only after a user click. This avoids opening a blank popup during order completion.


## Storage update: IndexedDB
Restaurant business data is now stored in the browser's IndexedDB rather than the small localStorage quota. On first launch, the app migrates the existing `servepos-l1-data` record into IndexedDB and removes the legacy localStorage copy only after the IndexedDB write succeeds. This supports larger restaurant datasets and logo images. User login/session preferences remain in localStorage. Keep using the in-app backup export as an additional recovery copy.


## Mobile UI fixes (November 2026)
- Menu-item and simple-form modals now constrain their height to the viewport and scroll internally on mobile, keeping Save/Cancel actions reachable instead of scrolling the page behind the dialog.
- Ingredients inventory now opens Add Ingredient in a modal; Edit Ingredient opens the same modal. The ingredient list and inventory dashboard remain visible on the page.
- Customer bill preview falls back to the currently configured restaurant logo when an older order snapshot has no logo. The print document waits for logo/image decoding before opening the print dialog.
- To update an existing Android install, overwrite the project source files, then run `npm run build` and `npx cap sync android`, and press Run in Android Studio. Keep the existing Android project/application ID; do not uninstall the app if you need to preserve local device data.


## Android WebView modal patch
- Reworked the small-screen modal as a full-screen sheet inside Android WebView. Header stays visible while the form content scrolls independently.
- Ingredient inventory exposes the Add ingredient action directly below the inventory summary; Add and Edit both open the same modal.
- After replacing the project files, run `npm run build` and `npx cap sync android` from the project root, then Run from Android Studio. Confirm the build output is copied to `android/app/src/main/assets/public`.
- If the app still shows the previous screen, close ServePOS fully on the phone, rebuild and sync again, then Run/Install from Android Studio. Do not uninstall or clear app storage if you need to retain local data.


## Password visibility and owner login
- Added a show/hide eye control to owner setup password and confirmation, login password, and staff temporary password fields.
- The owner account is stored locally on this device (password stored as a SHA-256 hash). After first setup, the app creates a signed-in local session automatically. The session remains across normal app closes/restarts until the owner logs out; after logout, the same username/password can sign in again.
- Accounts are device-local in this release. Clearing app data or uninstalling the app may remove accounts and local restaurant data. Back up before destructive device/app actions.
