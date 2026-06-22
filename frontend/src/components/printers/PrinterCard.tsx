"use client";

import { Printer } from "@/types";

interface PrinterCardProps {
  printer: Printer;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onFilamentChange: (id: string) => void;
  onReportIssue: (id: string) => void;
}

const statusColors: Record<string, string> = {
  idle: "bg-gray-500",
  printing: "bg-green-500",
  paused: "bg-yellow-500",
  error: "bg-red-500",
  offline: "bg-gray-700",
};

export function PrinterCard({
  printer,
  onPause,
  onResume,
  onStop,
  onFilamentChange,
  onReportIssue,
}: PrinterCardProps) {
  const statusColor = statusColors[printer.status] ?? "bg-gray-500";

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4 border border-gray-700">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{printer.name}</h3>
          <p className="text-gray-400 text-xs">{printer.id}</p>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full mt-1 ${statusColor}`} />
      </div>

      {printer.currentJob && (
        <div className="space-y-1">
          <p className="text-gray-300 text-sm truncate">{printer.currentJob}</p>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${printer.progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{printer.progressPercent}%</span>
            <span>{Math.round(printer.timeRemaining / 60)}m left</span>
          </div>
        </div>
      )}

      <div className="flex justify-between text-xs text-gray-400">
        <span>Material: {printer.materialType}</span>
        <span>Health: {printer.aiHealthScore}/100</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {printer.status === "printing" && (
          <button
            onClick={() => onPause(printer.id)}
            className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded-md"
          >
            Pause
          </button>
        )}
        {printer.status === "paused" && (
          <button
            onClick={() => onResume(printer.id)}
            className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded-md"
          >
            Resume
          </button>
        )}
        {["printing", "paused"].includes(printer.status) && (
          <button
            onClick={() => onStop(printer.id)}
            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded-md"
          >
            Stop
          </button>
        )}
        <button
          onClick={() => onFilamentChange(printer.id)}
          className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md"
        >
          Filament
        </button>
        <button
          onClick={() => onReportIssue(printer.id)}
          className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-md"
        >
          Report
        </button>
      </div>
    </div>
  );
}
