# Order preparation status fix

## Scope

This change fixes only the preparation workflow for `Order` and `OrderItem`.
It does not change authentication, uploads, cup handling, event lifecycle, sales,
Excel exports, numbering, or the payment workflow.

## Rules enforced

- The only preparation transition is `PREPARING -> READY`.
- `READY` is terminal and retrying a Ready action is idempotent.
- An order becomes `READY` only when it has at least one item and every item is
  `READY`.
- Preparation status changes never write `paymentStatus` or `completedAt`.
- `readyAt` is written only on the first parent transition to `READY`.
- New orders and their items are explicitly created as `PREPARING`.
- Preparation mutations are restricted to orders belonging to an active event.
- Historical orders are not normalized or reconciled.

## Entry points reviewed

- `createOrder`
- `updateOrderStatus`
- `markOrderItemReady`
- `markOrderItemsReady`
- `markBatchItemsReady`
- `bulkStatusUpdate`
- `normalizeLiveOrders`
- `reconcileReadyOrder`

`updateOrderItemStatus` does not exist in this codebase. All current item status
writes are covered by the entry points above.

## Concurrency and consistency

Ready mutations run in transactions and lock the affected order rows before
reloading state. Item updates use conditional `PREPARING` predicates, and parent
reconciliation checks the locked, current item state. This prevents retries or
concurrent cooks from moving a terminal order backward or prematurely marking a
partially prepared order Ready.

## Frontend review

The dashboard already exposes Ready actions only for `PREPARING` orders/items
and renders `READY` entries as labels. No frontend change was needed.

## Validation

- `npx vitest run`: 17 test files, 116 tests passed.
- `npm run build:api`: passed.
- `npm run build:web`: passed (the existing bundle-size warning remains).
- No database migration is required.
