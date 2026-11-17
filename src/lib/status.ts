export const ORDER_STATUSES = [
  "order_placed",
  "payment_pending",
  "pickup_scheduled",
  "courier_assigned",
  "garments_collected",
  "received_at_facility",
  "cleaning_in_progress",
  "quality_inspection",
  "ready_for_delivery",
  "return_courier_assigned",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "delayed",
  "quality_issue",
  "re_cleaning_required",
  "customer_complaint",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  order_placed: "Order placed",
  payment_pending: "Payment pending",
  pickup_scheduled: "Pickup scheduled",
  courier_assigned: "Courier assigned",
  garments_collected: "Garments collected",
  received_at_facility: "Received at cleaning facility",
  cleaning_in_progress: "Cleaning in progress",
  quality_inspection: "Quality inspection",
  ready_for_delivery: "Ready for delivery",
  return_courier_assigned: "Courier assigned for return",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  delayed: "Delayed",
  quality_issue: "Quality issue",
  re_cleaning_required: "Re-cleaning required",
  customer_complaint: "Customer complaint",
};

/** Main customer-visible progress steps, in order (exceptions such as cancelled are excluded). */
export const TRACKING_STEPS: OrderStatus[] = ORDER_STATUSES.slice(0, 13).filter((s) => s !== "cancelled") as OrderStatus[];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  awaiting_verification: "Awaiting verification",
  partially_paid: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};
