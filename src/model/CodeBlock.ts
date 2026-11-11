/** Code block language for new diagrams. */
export const LANGUAGE = "drawscii";
/** Languages rendered and edited as diagrams; `asciiflow` is from before the rename. */
export const LANGUAGES = [LANGUAGE, "asciiflow"];
/** An opening fence of a diagram block: indent, fence and language. */
export const OPENING_FENCE = /^( {0,3})(`{3,}|~{3,})(drawscii|asciiflow)\s*$/;

/** Prepare an edit against an exact note snapshot; never guess a shifted block. */
export function replaceCodeBlock(
  text: string,
  start: number,
  end: number,
  source: string,
  content: string,
): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const opening = OPENING_FENCE.exec(lines[start] ?? "");
  if (!opening || end <= start || end >= lines.length) {
    throw new Error(
      "Could not locate this diagram. Reopen the note and try again.",
    );
  }
  // Keep the block's own language, so older `asciiflow` notes stay as they are.
  const [, indent, fence, language] = opening;
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
  const normalize = (value: string) =>
    value.replace(/\r\n/g, "\n").replace(/\n$/, "");
  const body = lines
    .slice(start + 1, end)
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join("\n");
  if (!closing.test(lines[end]) || normalize(body) !== normalize(source)) {
    throw new Error("This diagram has changed. Reopen it before saving.");
  }
  // Enlarge fences when the drawing itself contains a fence-like line.
  let fenceLength = fence.length;
  for (const line of content.split(/\r?\n/)) {
    const run = new RegExp(`^ {0,3}(${fence[0]}+)\\s*$`).exec(line);
    if (run) fenceLength = Math.max(fenceLength, run[1].length + 1);
  }
  const delimiter = fence[0].repeat(fenceLength);
  const replacement = [
    `${indent}${delimiter}${language}`,
    ...content.split(/\r?\n/).map((line) => indent + line),
    `${indent}${delimiter}`,
  ];
  return [
    ...lines.slice(0, start),
    ...replacement,
    ...lines.slice(end + 1),
  ].join(newline);
}

export function saveIfUnchanged(
  current: string,
  original: string,
  updated: string,
): string {
  if (current !== original) {
    throw new Error(
      "The note changed while this editor was open. Your drawing is still here; copy it before reopening the note.",
    );
  }
  return updated;
}

/** Merge only an unchanged, unambiguous diagram, preserving edits elsewhere. */
export function mergeCodeBlock(
  current: string,
  original: string,
  start: number,
  end: number,
  source: string,
  content: string,
) {
  let target = start;
  if (current !== original) {
    const oldLines = original.split(/\r?\n/),
      lines = current.split(/\r?\n/);
    const block = oldLines.slice(start, end + 1);
    const matches: number[] = [];
    for (let i = 0; i <= lines.length - block.length; i++) {
      if (block.every((line, j) => lines[i + j] === line)) matches.push(i);
    }
    if (matches.length !== 1)
      throw new Error(
        "This diagram changed or cannot be identified uniquely. Your draft is kept. Copy it or reopen the latest note before saving.",
      );
    target = matches[0];
  }
  const updated = replaceCodeBlock(
    current,
    target,
    target + (end - start),
    source,
    content,
  );
  // Account for new content and an enlarged fence on the next save.
  const newEnd = target + content.split(/\r?\n/).length + 1;
  return { text: updated, start: target, end: newEnd };
}
