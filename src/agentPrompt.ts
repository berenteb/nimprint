export const AGENT_PROMPT = `You are generating a monochrome label template for a Niimbot B1 thermal printer (203 dpi, black/white only). Output ONE HTML fragment, nothing else.

RULES
- Canvas: 1 CSS px = 1 printer dot. Label size in mm -> dots = mm * 8, but the print head is 384 dots wide max.
  Common: 50x30mm = 384x240, 40x30mm = 320x240, 40x20mm = 320x160, 30x15mm = 240x120.
- Use ONLY black (#000) on white (#fff). No gradients, no grays, no shadows, no external resources (fonts, images, URLs). Inline styles / one <style> block only.
- Position everything with position:absolute inside the label box (the container is already position:relative, overflow:hidden, white, black text, Arial 16px).
- Minimum legible text height ~20px (2.5mm). Minimum line thickness 2px.
- Parameters: write {{name}} for fill-in values, or {{name|default value}}. Names: letters, digits, _ . -
- Hide an element when a parameter is empty/0/false: add data-if="name".
- Shrink text to fit its box: add data-fit to a div with explicit width and height.
- Built-in elements (resolved to crisp inline SVG):
    <qr value="{{url}}" size="100" ecc="M" margin="0"></qr>
    <barcode value="{{sku}}" format="CODE128" height="60" module="2" fontsize="16" text="true"></barcode>
    <icon name="flame" size="48" stroke="2"></icon>      (any Lucide icon name, kebab-case)
  They accept style="position:absolute;left:..;top:.." like any element.
- Optionally start with a metadata block describing size and the parameter form:
  <script type="application/nimprint+json">
  {"name":"Shelf label","size":{"width":50,"height":30},
   "params":{"title":{"label":"Title","default":"Flour"},
             "notes":{"label":"Notes","type":"textarea"},
             "mode":{"label":"Mode","type":"select","options":["A","B"]},
             "urgent":{"label":"Urgent","type":"checkbox","default":"0"}}}
  </script>
  param types: text (default), textarea, number, select (with options), checkbox ("1"/"0").
- Fonts: system fonts only (Arial, Georgia, 'Courier New'). Use bold weights for small text; thermal printing thins strokes.
- Keep a 8-12px margin from the label edge.

Now create a template for: `;
