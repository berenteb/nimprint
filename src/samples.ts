export interface Sample {
  id: string;
  name: string;
  html: string;
}

const meta = (o: unknown) =>
  `<script type="application/nimprint+json">${JSON.stringify(o, null, 2)}</script>\n`;

export const SAMPLES: Sample[] = [
  {
    id: "attendeum-mock",
    name: "Web UI mock (attendeum.hu style)",
    html:
      meta({
        name: "Web UI mock",
        size: { width: 50, height: 30 },
        params: {
          headline: { label: "Headline", default: "Rendezvény szoftver" },
          sub: { label: "Subheading", default: "Konferencia app és livestream" },
          cta: { label: "Primary button", default: "Beszéljen velünk" },
          secondary: { label: "Secondary button", default: "Dokumentáció" },
        },
      }) +
      `<div style="position:absolute;left:0;right:0;top:0;height:36px;border-bottom:2px solid #000"></div>
<div style="position:absolute;left:12px;top:0;height:36px;font:800 20px/36px Arial">Attendeum</div>
<div style="position:absolute;left:150px;top:0;height:36px;font:600 14px/36px Arial;letter-spacing:.3px">Termék&nbsp;&nbsp;Megoldások&nbsp;&nbsp;Árak</div>
<div style="position:absolute;right:12px;top:7px;width:30px;height:22px;border:2px solid #000;border-radius:11px;font:700 12px/18px Arial;text-align:center">HU</div>
<div data-fit style="position:absolute;left:12px;right:12px;top:44px;height:62px;font:800 30px/1.05 Arial;display:flex;align-items:center">{{headline}}</div>
<div style="position:absolute;left:12px;top:110px;width:64px;border-top:4px solid #000"></div>
<div data-fit style="position:absolute;left:12px;right:12px;top:120px;height:22px;font:500 18px/22px Arial;white-space:nowrap">{{sub}}</div>
<div data-fit style="position:absolute;left:12px;top:150px;width:164px;height:34px;background:#000;color:#fff;border-radius:17px;font:700 16px/34px Arial;text-align:center;white-space:nowrap">{{cta}}</div>
<div data-fit style="position:absolute;left:186px;top:150px;width:150px;height:34px;box-sizing:border-box;border:2px solid #000;border-radius:17px;font:700 16px/30px Arial;text-align:center;white-space:nowrap">{{secondary}}</div>
<div style="position:absolute;left:12px;top:196px;width:112px;height:32px;box-sizing:border-box;border:2px solid #000;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;font:700 14px Arial"><icon name="calendar" size="18"></icon>Event</div>
<div style="position:absolute;left:136px;top:196px;width:112px;height:32px;box-sizing:border-box;border:2px solid #000;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;font:700 14px Arial"><icon name="video" size="18"></icon>Live</div>
<div style="position:absolute;left:260px;top:196px;width:112px;height:32px;box-sizing:border-box;border:2px solid #000;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;font:700 14px Arial"><icon name="users" size="18"></icon>App</div>
`,
  },
  {
    id: "storage-box",
    name: "Storage box (icon + title + QR)",
    html:
      meta({
        name: "Storage box",
        size: { width: 50, height: 30 },
        params: {
          title: { label: "Title", default: "Winter clothes" },
          subtitle: { label: "Contents", type: "textarea", default: "Jackets, scarves,\ngloves" },
          link: { label: "QR content", default: "https://example.com/box/42" },
          icon: { label: "Icon (Lucide name)", default: "snowflake" },
        },
      }) +
      `<div style="position:absolute;left:12px;top:12px;width:72px;height:72px;border:4px solid #000;border-radius:12px;display:flex;align-items:center;justify-content:center">
  <icon name="{{icon}}" size="48" stroke="2.5"></icon>
</div>
<div data-fit style="position:absolute;left:96px;top:12px;width:170px;height:72px;font:800 34px/1 Arial,sans-serif;display:flex;align-items:center">{{title}}</div>
<div data-fit data-if="subtitle" style="position:absolute;left:12px;top:100px;width:254px;height:124px;font:500 26px/1.15 Arial,sans-serif">{{subtitle}}</div>
<qr value="{{link}}" size="108" style="position:absolute;right:12px;top:12px" margin="0"></qr>
<div style="position:absolute;left:12px;right:12px;top:94px;border-top:3px solid #000"></div>
`,
  },
  {
    id: "asset-tag",
    name: "Asset tag (barcode)",
    html:
      meta({
        name: "Asset tag",
        size: { width: 40, height: 30 },
        params: {
          org: { label: "Owner", default: "ACME LAB" },
          asset: { label: "Asset ID", default: "AST-004217" },
          desc: { label: "Description", default: "Oscilloscope 4ch" },
        },
      }) +
      `<div style="position:absolute;inset:0;border:4px solid #000;border-radius:10px"></div>
<div style="position:absolute;left:0;right:0;top:0;height:50px;background:#000;color:#fff;font:800 28px/50px Arial;text-align:center;border-radius:6px 6px 0 0" data-fit>{{org}}</div>
<div data-fit style="position:absolute;left:14px;right:14px;top:60px;height:34px;font:600 26px/34px Arial;text-align:center">{{desc}}</div>
<barcode value="{{asset}}" format="CODE128" height="70" module="2" fontsize="22" style="position:absolute;left:50%;top:108px;transform:translateX(-50%)"></barcode>
`,
  },
  {
    id: "spice-jar",
    name: "Jar / pantry label",
    html:
      meta({
        name: "Pantry jar",
        size: { width: 50, height: 30 },
        params: {
          item: { label: "Item", default: "Smoked paprika" },
          date: { label: "Opened", default: "2026-10-14" },
          best: { label: "Best before", default: "2027-04" },
          allergen: { label: "Contains allergens", type: "checkbox", default: "0" },
        },
      }) +
      `<div data-fit style="position:absolute;left:14px;right:14px;top:14px;height:90px;font:800 56px/1 Georgia,serif;display:flex;align-items:center">{{item}}</div>
<div style="position:absolute;left:14px;right:14px;top:114px;border-top:3px dashed #000"></div>
<div style="position:absolute;left:14px;top:126px;font:700 20px Arial">OPENED</div>
<div style="position:absolute;left:14px;top:150px;font:600 30px 'Courier New',monospace">{{date}}</div>
<div style="position:absolute;left:200px;top:126px;font:700 20px Arial">BEST BEFORE</div>
<div style="position:absolute;left:200px;top:150px;font:600 30px 'Courier New',monospace">{{best}}</div>
<div data-if="allergen" style="position:absolute;right:14px;bottom:12px;padding:2px 8px;font:800 20px Arial;background:#000;color:#fff">ALLERGEN</div>
`,
  },
  {
    id: "cable-flag",
    name: "Cable flag (small, 2 rows)",
    html:
      meta({
        name: "Cable flag",
        size: { width: 30, height: 15 },
        params: {
          from: { label: "From", default: "SW1 / P12" },
          to: { label: "To", default: "AP3 / eth0" },
        },
      }) +
      `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 10px">
  <div data-fit style="height:46px;font:800 38px/46px Arial;white-space:nowrap">{{from}}</div>
  <div data-fit style="height:46px;font:800 38px/46px Arial;white-space:nowrap">&rarr; {{to}}</div>
</div>
`,
  },
  {
    id: "shipping",
    name: "Address label (multiline)",
    html:
      meta({
        name: "Address",
        size: { width: 50, height: 30 },
        params: {
          to: { label: "Recipient", default: "Jane Doe" },
          address: { label: "Address", type: "textarea", default: "1 Example Street\n1011 Amsterdam\nNetherlands" },
          ref: { label: "Reference", default: "Order #1042" },
        },
      }) +
      `<div style="position:absolute;left:14px;top:10px;font:700 18px Arial;letter-spacing:2px">SHIP TO</div>
<div data-fit style="position:absolute;left:14px;right:14px;top:32px;height:44px;font:800 40px/44px Arial;white-space:nowrap">{{to}}</div>
<div data-fit style="position:absolute;left:14px;right:14px;top:82px;height:116px;font:500 30px/1.15 Arial">{{address}}</div>
<div data-fit style="position:absolute;left:14px;right:14px;bottom:8px;height:26px;font:600 20px/26px 'Courier New',monospace;border-top:2px solid #000;padding-top:2px">{{ref}}</div>
`,
  },
];
