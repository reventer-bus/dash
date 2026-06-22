export type PrinterStatus = "idle" | "printing" | "paused" | "error" | "offline";

export interface Printer {
  id: string;
  name: string;
  status: PrinterStatus;
  currentJob?: string;
  progressPercent: number;
  timeRemaining: number; // seconds
  materialType: string;
  aiHealthScore: number; // 0-100
  cameraUrl?: string;
  partnerId: string;
}

export type OrderStatus =
  | "NEW"
  | "AI_PREP"
  | "PRINTING"
  | "POST_PROCESS"
  | "QUALITY_CHECK"
  | "PACK"
  | "DISPATCH";

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  fileUrl: string;
  material: string;
  assignedPrinterId?: string;
  deadline: string;
  status: OrderStatus;
  createdAt: string;
}

export type FailureType = "spaghetti" | "layer_shift" | "warping" | "other";

export interface PrintFailureAlert {
  id: string;
  printerId: string;
  failureType: FailureType;
  probability: number;
  detectedAt: string;
  resolved: boolean;
}

export interface Partner {
  id: string;
  name: string;
  location: string;
  printerCount: number;
  jobCompletionRate: number;
  qualityScore: number;
  revenue: number;
  materialInventory: MaterialInventory[];
}

export interface MaterialInventory {
  type: "PLA" | "PETG" | "ABS";
  remainingGrams: number;
  spoolCount: number;
}

export interface MaintenanceAlert {
  printerId: string;
  type: "belt" | "nozzle" | "lubrication" | "build_plate";
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface AIOptimisationResult {
  orientation: { x: number; y: number; z: number };
  supportsRequired: boolean;
  layerHeight: number;
  wallCount: number;
  infillPercent: number;
  speedMmPerSec: number;
  nozzleTempC: number;
  bedTempC: number;
  retractionMm: number;
  estimatedPrintHours: number;
  materialGrams: number;
  successProbability: number;
}
