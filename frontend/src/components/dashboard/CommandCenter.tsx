"use client";

import { PrinterStatus, Order, PrintFailureAlert } from "@/types";

interface CommandCenterProps {
  activeOrders: number;
  printingJobs: number;
  postProcessingQueue: number;
  qualityCheckQueue: number;
  packingQueue: number;
  alerts: PrintFailureAlert[];
  revenueToday: number;
}

export function CommandCenter({
  activeOrders,
  printingJobs,
  postProcessingQueue,
  qualityCheckQueue,
  packingQueue,
  alerts,
  revenueToday,
}: CommandCenterProps) {
  const stats = [
    { label: "Active Orders", value: activeOrders, color: "text-blue-400" },
    { label: "Printing", value: printingJobs, color: "text-green-400" },
    { label: "Post Processing", value: postProcessingQueue, color: "text-yellow-400" },
    { label: "Quality Check", value: qualityCheckQueue, color: "text-purple-400" },
    { label: "Packing", value: packingQueue, color: "text-orange-400" },
    { label: "Revenue Today", value: `₹${revenueToday.toLocaleString()}`, color: "text-emerald-400" },
  ];

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Command Centre</h2>
        {alerts.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {alerts.length} Alert{alerts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-800 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
