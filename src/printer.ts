import {
  ImageEncoder,
  LabelType,
  NiimbotBluetoothClient,
  NiimbotSerialClient,
  PageColorType,
  type NiimbotAbstractClient,
  type PrintDirection,
} from "@mmote/niimbluelib";

export type Transport = "bluetooth" | "serial";

export interface PrinterStatus {
  connected: boolean;
  transport?: Transport;
  name?: string;
  model?: string;
  battery?: number;
  paperInserted?: boolean;
  lidClosed?: boolean;
}

export interface PrintJobPage {
  canvas: HTMLCanvasElement;
  copies: number;
}

export interface PrintSettings {
  density: number; // 1..5 on B1
  labelType: LabelType;
}

export const LABEL_TYPES: { value: LabelType; label: string }[] = [
  { value: LabelType.WithGaps, label: "Gap labels" },
  { value: LabelType.Black, label: "Black mark" },
  { value: LabelType.Transparent, label: "Transparent" },
];

/** B1 defaults, used until the printer reports its own model metadata. */
export const B1_HEAD_PIXELS = 384;
export const DPI = 203;

export const supports = {
  bluetooth: typeof navigator !== "undefined" && "bluetooth" in navigator,
  serial: typeof navigator !== "undefined" && "serial" in navigator,
};

export class PrinterConnection {
  private client?: NiimbotAbstractClient;
  private transport?: Transport;
  private deviceName?: string;
  private battery?: number;
  private paperInserted?: boolean;
  private lidClosed?: boolean;
  onStatus: (s: PrinterStatus) => void = () => {};
  onProgress: (msg: string, fraction?: number) => void = () => {};
  onLog: (msg: string) => void = () => {};

  get status(): PrinterStatus {
    const meta = this.client?.getModelMetadata();
    return {
      connected: !!this.client?.isConnected(),
      transport: this.transport,
      name: this.deviceName,
      model: meta?.model,
      battery: this.battery,
      paperInserted: this.paperInserted,
      lidClosed: this.lidClosed,
    };
  }

  get headPixels(): number {
    return this.client?.getModelMetadata()?.printheadPixels ?? B1_HEAD_PIXELS;
  }

  get densityRange(): { min: number; max: number; def: number } {
    const m = this.client?.getModelMetadata();
    return { min: m?.densityMin ?? 1, max: m?.densityMax ?? 5, def: m?.densityDefault ?? 3 };
  }

  async connect(transport: Transport): Promise<void> {
    if (this.client?.isConnected()) await this.disconnect();
    const client: NiimbotAbstractClient =
      transport === "bluetooth" ? new NiimbotBluetoothClient() : new NiimbotSerialClient();
    this.client = client;
    this.transport = transport;

    client.on("disconnect", () => {
      this.onLog("Disconnected");
      this.onStatus(this.status);
    });
    client.on("heartbeat", (e) => {
      this.battery = e.data.batteryPercents ?? this.battery;
      this.paperInserted = e.data.paperInserted;
      this.lidClosed = e.data.lidClosed;
      this.onStatus(this.status);
    });
    client.on("printerinfofetched", (e) => {
      this.battery = e.info.batteryPercents ?? this.battery;
      this.onStatus(this.status);
    });
    client.on("printprogress", (e) => {
      const frac = (e.page - 1 + e.pagePrintProgress / 100) / Math.max(1, e.pagesTotal);
      this.onProgress(`Printing page ${e.page}/${e.pagesTotal}`, Math.min(1, frac));
    });

    const info = await client.connect();
    this.deviceName = info.deviceName;
    this.battery = client.getPrinterInfo().batteryPercents;
    client.startHeartbeat();
    this.onLog(`Connected to ${info.deviceName ?? "printer"} via ${transport} (${client.getModelMetadata()?.model ?? "unknown model"})`);
    this.onStatus(this.status);
  }

  async disconnect(): Promise<void> {
    const c = this.client;
    if (!c) return;
    try {
      c.stopHeartbeat();
      await c.disconnect();
    } finally {
      this.onStatus(this.status);
    }
  }

  /** Print a list of pages (each with its own copy count). */
  async print(pages: PrintJobPage[], settings: PrintSettings): Promise<void> {
    const client = this.client;
    if (!client?.isConnected()) throw new Error("Printer not connected");
    const meta = client.getModelMetadata();
    const direction: PrintDirection = meta?.printDirection ?? "top";
    const taskName = client.getPrintTaskType() ?? "B1";
    const total = pages.reduce((n, p) => n + p.copies, 0);
    const density = Math.min(meta?.densityMax ?? 5, Math.max(meta?.densityMin ?? 1, settings.density));

    client.stopHeartbeat(); // avoid interleaving heartbeat packets with the job
    const task = client.protocol.newPrintTask(taskName, {
      totalPages: total,
      density,
      labelType: settings.labelType,
    });
    try {
      await task.printInit();
      for (const [i, p] of pages.entries()) {
        const encoded = ImageEncoder.encodeCanvas(p.canvas, PageColorType.SingleColor, direction);
        await task.printPage(encoded, p.copies);
        await task.waitForPageFinished();
        this.onProgress(`Label ${i + 1}/${pages.length} sent`, (i + 1) / pages.length);
      }
      await task.waitForFinished();
    } finally {
      await client.protocol.printEnd().catch(() => {});
      if (client.isConnected()) client.startHeartbeat();
    }
  }
}
