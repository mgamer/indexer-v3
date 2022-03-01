// Possible kinds of triggers that could result in recomputing `floor_sell` caches
export type TriggerKind =
  | "new-order"
  | "expiry"
  | "sale"
  | "cancel"
  | "balance-change"
  | "approval-change";
