"use client";

import { Order, OrderStatus } from "@/types";

const PIPELINE_STAGES: OrderStatus[] = [
  "NEW",
  "AI_PREP",
  "PRINTING",
  "POST_PROCESS",
  "QUALITY_CHECK",
  "PACK",
  "DISPATCH",
];

const STAGE_LABELS: Record<OrderStatus, string> = {
  NEW: "New",
  AI_PREP: "AI Prep",
  PRINTING: "Printing",
  POST_PROCESS: "Post Process",
  QUALITY_CHECK: "Quality Check",
  PACK: "Pack",
  DISPATCH: "Dispatch",
};

interface OrderPipelineProps {
  orders: Order[];
}

export function OrderPipeline({ orders }: OrderPipelineProps) {
  const byStage = PIPELINE_STAGES.reduce<Record<OrderStatus, Order[]>>(
    (acc, stage) => {
      acc[stage] = orders.filter((o) => o.status === stage);
      return acc;
    },
    {} as Record<OrderStatus, Order[]>
  );

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max p-1">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="w-52 bg-gray-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                {STAGE_LABELS[stage]}
              </span>
              <span className="text-xs bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">
                {byStage[stage].length}
              </span>
            </div>
            {byStage[stage].map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const deadline = new Date(order.deadline);
  const isUrgent = deadline.getTime() - Date.now() < 4 * 60 * 60 * 1000;

  return (
    <div
      className={`bg-gray-700 rounded-lg p-2.5 space-y-1 border ${
        isUrgent ? "border-red-500" : "border-transparent"
      }`}
    >
      <p className="text-xs font-medium text-white truncate">{order.id}</p>
      <p className="text-xs text-gray-400 truncate">{order.customerName}</p>
      <p className="text-xs text-blue-400">{order.material}</p>
    </div>
  );
}
