// Tiny inline markdown renderer for **bold** and *italic*.
// Returns an array of React nodes — keep it small, dependency-free.
import React from "react";

export function renderInline(text) {
  if (!text) return null;
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(
        React.createElement("strong", { key: key++ }, token.slice(2, -2))
      );
    } else {
      out.push(React.createElement("em", { key: key++ }, token.slice(1, -1)));
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render a multiline string preserving line breaks + bold markers. */
export function renderRich(text) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return lines.map((line, i) =>
    React.createElement(
      React.Fragment,
      { key: i },
      renderInline(line),
      i < lines.length - 1 ? React.createElement("br") : null
    )
  );
}
